package com.nuvio.app.features.simkl

import co.touchlab.kermit.Logger
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.tracking.TrackingProfileStore
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingProviderRegistry
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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
    private val refreshMutex = Mutex()
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
    }

    fun refreshAsync() {
        scope.launch { refreshNow() }
    }

    suspend fun ensureFresh() {
        ensureLoaded()
        val lastChecked = state.value.snapshot.lastCheckedAtEpochMs
        if (lastChecked != null && SimklPlatformClock.nowEpochMs() - lastChecked < CACHE_TTL_MS) return
        refreshNow()
    }

    suspend fun refreshNow() {
        ensureLoaded()
        refreshMutex.withLock {
            if (!SimklAuthRepository.isAuthenticated.value) return
            val profileId = ProfileRepository.activeProfileId
            val generation = profileGeneration
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
            SimklSyncStorage.savePayload(json.encodeToString(result))
            _state.value = SimklSyncUiState(
                snapshot = result,
                hasLoaded = true,
            )
        }
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

    private const val CACHE_TTL_MS = 60_000L
}
