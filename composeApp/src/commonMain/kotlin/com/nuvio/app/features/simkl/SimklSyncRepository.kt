package com.nuvio.app.features.simkl

import co.touchlab.kermit.Logger
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.tracking.TrackingProfileStore
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingProviderRegistry
import com.nuvio.app.features.tracking.TrackingRefreshIntent
import kotlinx.atomicfu.atomic
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object SimklSyncRepository : TrackingProfileStore {
    override val providerId: TrackingProviderId = TrackingProviderId.SIMKL

    private val log = Logger.withTag("SimklSync")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val refreshGate = SimklRefreshGate()
    private val refreshRequestSequence = atomic(0L)
    private val engine = SimklSyncEngine(
        remote = SimklApiSyncRemote(),
        nowEpochMs = SimklPlatformClock::nowEpochMs,
    )

    private val _state = MutableStateFlow(SimklSyncUiState())
    val state: StateFlow<SimklSyncUiState> = _state.asStateFlow()

    private var hasLoaded = false
    private var profileGeneration = 0L

    init {
        TrackingProviderRegistry.registerProfileStore(this)
    }

    fun ensureLoaded() {
        if (hasLoaded) return
        hasLoaded = true
        val snapshot = SimklSyncStorage.loadPayload()
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?.let { payload ->
                runCatching { json.decodeFromString<SimklSyncSnapshot>(payload) }
                    .onFailure { error -> log.w { "Failed to parse Simkl sync snapshot: ${error.message}" } }
                    .getOrNull()
            }
            ?: SimklSyncSnapshot()
        _state.value = SimklSyncUiState(snapshot = snapshot, hasLoaded = true)
        SimklWatchDiagnostics.logSnapshot(stage = "cache-load", snapshot = snapshot)
    }

    fun refreshAsync(intent: TrackingRefreshIntent) {
        refreshAsync(intent, SimklRefreshOrigin.UNKNOWN)
    }

    internal fun refreshAsync(
        intent: TrackingRefreshIntent,
        origin: SimklRefreshOrigin,
    ) {
        scope.launch { refresh(intent, origin) }
    }

    suspend fun refresh(intent: TrackingRefreshIntent): Boolean =
        refresh(intent, SimklRefreshOrigin.MANUAL_SYNC)

    internal suspend fun refresh(
        intent: TrackingRefreshIntent,
        origin: SimklRefreshOrigin,
    ): Boolean {
        ensureLoaded()
        val requestId = refreshRequestSequence.incrementAndGet()
        val requestedGeneration = profileGeneration
        val requestedProfileId = ProfileRepository.activeProfileId
        val before = _state.value
        SimklWatchDiagnostics.logRefreshRequest(
            requestId = requestId,
            origin = origin,
            intent = intent,
            profileId = requestedProfileId,
            profileGeneration = requestedGeneration,
            authenticated = SimklAuthRepository.isAuthenticated.value,
            snapshot = before.snapshot,
            errorMessage = before.errorMessage,
        )
        val outcome = refreshGate.runIfNeeded(
            profileGeneration = requestedGeneration,
            shouldRun = {
                val current = _state.value
                val authenticated = SimklAuthRepository.isAuthenticated.value
                val nowEpochMs = SimklPlatformClock.nowEpochMs()
                val eligible = requestedGeneration == profileGeneration &&
                    authenticated &&
                    shouldRunSimklRefresh(
                        intent = intent,
                        lastCheckedAtEpochMs = current.snapshot.lastCheckedAtEpochMs,
                        nowEpochMs = nowEpochMs,
                        hasError = current.errorMessage != null,
                    )
                SimklWatchDiagnostics.logRefreshDecision(
                    requestId = requestId,
                    origin = origin,
                    intent = intent,
                    nowEpochMs = nowEpochMs,
                    lastCheckedAtEpochMs = current.snapshot.lastCheckedAtEpochMs,
                    authenticated = authenticated,
                    hasError = current.errorMessage != null,
                    eligible = eligible,
                )
                eligible
            },
        ) {
            refreshSnapshot(requestedGeneration)
        }
        SimklWatchDiagnostics.logRefreshCompletion(
            requestId = requestId,
            origin = origin,
            intent = intent,
            outcome = outcome,
            before = before,
            after = _state.value,
        )
        val completed = _state.value
        return requestedGeneration == profileGeneration &&
            requestedProfileId == ProfileRepository.activeProfileId &&
            SimklAuthRepository.isAuthenticated.value &&
            completed.hasLoaded &&
            completed.errorMessage == null
    }

    private suspend fun refreshSnapshot(generation: Long) {
        val profileId = ProfileRepository.activeProfileId
        val previous = _state.value
        _state.value = previous.copy(isLoading = true, errorMessage = null)

        val result = try {
            engine.synchronize(previous.snapshot)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.w { "Simkl sync failed: ${error.message}" }
            if (generation == profileGeneration && profileId == ProfileRepository.activeProfileId) {
                _state.value = previous.copy(
                    isLoading = false,
                    hasLoaded = true,
                    errorMessage = error.message ?: "Unable to sync Simkl",
                )
            }
            return
        }

        if (generation != profileGeneration || profileId != ProfileRepository.activeProfileId) return
        SimklAuthRepository.synchronizeUserSettings(result.activities?.settings?.all)
        if (generation != profileGeneration || profileId != ProfileRepository.activeProfileId) return
        SimklSyncStorage.savePayload(json.encodeToString(result))
        _state.value = SimklSyncUiState(
            snapshot = result,
            hasLoaded = true,
        )
        SimklWatchDiagnostics.logSnapshot(stage = "network-commit", snapshot = result)
    }

    internal fun commitPlaybackRemoval(sessionIds: Set<Long>) {
        if (sessionIds.isEmpty()) return
        ensureLoaded()
        val current = _state.value
        val updatedPlayback = current.snapshot.playback.filterNot { session -> session.id in sessionIds }
        if (updatedPlayback.size == current.snapshot.playback.size) return
        val updatedSnapshot = current.snapshot.copy(playback = updatedPlayback)
        SimklSyncStorage.savePayload(json.encodeToString(updatedSnapshot))
        _state.value = current.copy(snapshot = updatedSnapshot)
        SimklWatchDiagnostics.logSnapshot(stage = "playback-removal", snapshot = updatedSnapshot)
    }

    override fun onProfileChanged() {
        profileGeneration += 1L
        hasLoaded = false
        _state.value = SimklSyncUiState()
        ensureLoaded()
    }

    override fun clearLocalState() {
        profileGeneration += 1L
        hasLoaded = false
        _state.value = SimklSyncUiState()
        SimklSyncStorage.savePayload("")
    }

    override fun removeStoredProfile(profileId: Int) {
        SimklSyncStorage.removeProfile(profileId)
    }
}
