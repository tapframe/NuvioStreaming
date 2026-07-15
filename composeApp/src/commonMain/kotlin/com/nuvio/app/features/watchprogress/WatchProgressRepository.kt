package com.nuvio.app.features.watchprogress

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.features.addons.AddonManifest
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.AddonsUiState
import com.nuvio.app.features.addons.enabledAddons
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.player.PlayerPlaybackSnapshot
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktProgressRepository
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.WatchProgressSource
import com.nuvio.app.features.trakt.effectiveWatchProgressSource
import com.nuvio.app.features.trakt.isTraktCompatibleId
import com.nuvio.app.features.trakt.resolveEffectiveContentId
import com.nuvio.app.features.watching.application.WatchingActions
import com.nuvio.app.features.watching.sync.ProgressDeltaEvent
import com.nuvio.app.features.watching.sync.ProgressSyncRecord
import com.nuvio.app.features.watching.sync.ProgressSyncAdapter
import com.nuvio.app.features.watching.sync.SupabaseProgressSyncAdapter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit

private const val WATCH_PROGRESS_METADATA_RESOLUTION_CONCURRENCY = 4
private const val WATCH_PROGRESS_METADATA_RESOLUTION_LIMIT = 64
private const val WATCH_PROGRESS_METADATA_FETCH_ATTEMPTS = 3
private const val WATCH_PROGRESS_METADATA_RETRY_BASE_DELAY_MS = 750L
private const val WATCH_PROGRESS_DELTA_PAGE_SIZE = 900
private const val WATCH_PROGRESS_DELTA_OPERATION_UPSERT = "upsert"
private const val WATCH_PROGRESS_DELTA_OPERATION_DELETE = "delete"

private data class RemoteMetadataResolutionResult(
    val entries: List<WatchProgressEntry>,
    val meta: MetaDetails?,
)

private data class MetadataProviderReadiness(
    val providers: List<AddonManifest>,
) {
    val fingerprint: String
        get() = providers.map(AddonManifest::transportUrl).sorted().joinToString(separator = "|")

    val isReady: Boolean
        get() = providers.isNotEmpty()
}

internal class MetadataResolutionRetryCoordinator {
    private val lock = SynchronizedObject()
    private var generation = 0L
    private var activeGeneration: Long? = null
    private var activeProviderFingerprint: String? = null
    private var lastRequestedProviderFingerprint: String? = null
    private var pendingProviderFingerprint: String? = null

    fun reset() {
        synchronized(lock) {
            generation += 1L
            activeGeneration = null
            activeProviderFingerprint = null
            lastRequestedProviderFingerprint = null
            pendingProviderFingerprint = null
        }
    }

    fun invalidateActiveResolution() {
        synchronized(lock) {
            generation += 1L
            activeGeneration = null
            activeProviderFingerprint = null
            pendingProviderFingerprint = null
        }
    }

    fun requestForProviders(providerFingerprint: String): Boolean =
        synchronized(lock) {
            if (activeGeneration != null) {
                if (providerFingerprint != activeProviderFingerprint) {
                    pendingProviderFingerprint = providerFingerprint
                }
                return@synchronized false
            }
            if (providerFingerprint == lastRequestedProviderFingerprint) {
                return@synchronized false
            }

            lastRequestedProviderFingerprint = providerFingerprint
            true
        }

    fun beginResolution(providerFingerprint: String?): Long =
        synchronized(lock) {
            generation += 1L
            activeGeneration = generation
            activeProviderFingerprint = providerFingerprint
            pendingProviderFingerprint = null
            if (providerFingerprint != null) {
                lastRequestedProviderFingerprint = providerFingerprint
            }
            generation
        }

    fun providersObservedBeforeFetch(
        resolutionGeneration: Long,
        providerFingerprint: String,
    ) {
        synchronized(lock) {
            if (activeGeneration != resolutionGeneration) return@synchronized
            activeProviderFingerprint = providerFingerprint
            lastRequestedProviderFingerprint = providerFingerprint
            if (pendingProviderFingerprint == providerFingerprint) {
                pendingProviderFingerprint = null
            }
        }
    }

    fun finishResolution(
        resolutionGeneration: Long,
        currentProviderFingerprint: String?,
    ): Boolean = synchronized(lock) {
        if (activeGeneration != resolutionGeneration) return@synchronized false

        activeGeneration = null
        val shouldRetry = currentProviderFingerprint != null &&
            currentProviderFingerprint != activeProviderFingerprint &&
            (pendingProviderFingerprint != null ||
                currentProviderFingerprint != lastRequestedProviderFingerprint)
        activeProviderFingerprint = null
        pendingProviderFingerprint = null
        if (shouldRetry) {
            lastRequestedProviderFingerprint = currentProviderFingerprint
        }
        shouldRetry
    }
}

private data class WatchProgressDeltaApplyResult(
    val appliedUpserts: Int,
    val appliedDeletes: Int,
    val preservedLocalItems: Boolean,
    val changed: Boolean,
)

internal enum class WatchProgressDeltaDecisionType {
    UPSERT,
    DELETE,
    PRESERVE_LOCAL,
    IGNORE,
}

internal data class WatchProgressDeltaDecision(
    val type: WatchProgressDeltaDecisionType,
    val updatedEntry: WatchProgressEntry? = null,
    val clearsDirtyProgress: Boolean = false,
)

internal fun enrichWatchProgressEntry(
    current: WatchProgressEntry,
    meta: MetaDetails,
): WatchProgressEntry {
    val episodeVideo = if (current.seasonNumber != null && current.episodeNumber != null) {
        meta.videos.firstOrNull { video ->
            video.season == current.seasonNumber && video.episode == current.episodeNumber
        }
    } else {
        null
    }
    return current.copy(
        title = meta.name.takeIf(String::isNotBlank) ?: current.title,
        poster = meta.poster?.takeIf(String::isNotBlank) ?: current.poster,
        background = meta.background?.takeIf(String::isNotBlank) ?: current.background,
        logo = meta.logo?.takeIf(String::isNotBlank) ?: current.logo,
        episodeTitle = episodeVideo?.title?.takeIf(String::isNotBlank) ?: current.episodeTitle,
        episodeThumbnail = episodeVideo?.thumbnail?.takeIf(String::isNotBlank) ?: current.episodeThumbnail,
        pauseDescription = episodeVideo?.overview?.takeIf(String::isNotBlank)
            ?: meta.description?.takeIf(String::isNotBlank)
            ?: current.pauseDescription,
    )
}

internal fun WatchProgressEntry.needsRemoteMetadataEnrichment(): Boolean =
    title.isBlank() ||
        title.equals(parentMetaId, ignoreCase = true) ||
        poster.isNullOrBlank() ||
        background.isNullOrBlank()

object WatchProgressRepository {
    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val accountScopeLock = SynchronizedObject()
    private var accountScopeJob: Job = SupervisorJob()
    private var accountScope = CoroutineScope(accountScopeJob + Dispatchers.Default)
    private val log = Logger.withTag("WatchProgressRepository")

    private val _uiState = MutableStateFlow(WatchProgressUiState())
    val uiState: StateFlow<WatchProgressUiState> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var hasLoadedNuvioRemoteProgress = false
    private var currentProfileId: Int = 1
    private var profileGeneration: Long = 0L
    private var activeSource: WatchProgressSource = WatchProgressSource.NUVIO_SYNC
    private val _activeSourceState = MutableStateFlow(activeSource)
    internal val activeSourceState: StateFlow<WatchProgressSource> = _activeSourceState.asStateFlow()
    private val entriesLock = SynchronizedObject()
    private var entriesByProgressKey: MutableMap<String, WatchProgressEntry> = mutableMapOf()
    private var dirtyProgressKeys: MutableSet<String> = mutableSetOf()
    private var metadataResolutionJob: Job? = null
    private val metadataResolutionRetryCoordinator = MetadataResolutionRetryCoordinator()
    private val nuvioPullMutex = Mutex()
    private var lastSuccessfulPushEpochMs = 0L
    private var deltaCursorEventId = 0L
    private var deltaInitialized = false
    internal var syncAdapter: ProgressSyncAdapter = SupabaseProgressSyncAdapter

    init {
        syncScope.launch {
            TraktProgressRepository.uiState.collectLatest {
                if (shouldUseTraktProgress()) {
                    publish()
                }
            }
        }

        syncScope.launch {
            AddonRepository.uiState.collectLatest { state ->
                retryMetadataResolutionWhenAddonMetaProvidersReady(state)
            }
        }

    }

    fun ensureLoaded() {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        TraktProgressRepository.ensureLoaded()
        if (!hasLoaded) {
            updateActiveSource(
                effectiveWatchProgressSource(
                    isTraktAuthenticated = TraktAuthRepository.isAuthenticated.value,
                    requestedSource = TraktSettingsRepository.uiState.value.watchProgressSource,
                ),
            )
            loadFromDisk(ProfileRepository.activeProfileId)
        }
    }

    fun onProfileChanged(profileId: Int) {
        if (profileId == currentProfileId && hasLoaded) return
        TraktSettingsRepository.onProfileChanged()
        updateActiveSource(
            effectiveWatchProgressSource(
                isTraktAuthenticated = TraktAuthRepository.isAuthenticated.value,
                requestedSource = TraktSettingsRepository.uiState.value.watchProgressSource,
            ),
        )
        loadFromDisk(profileId)
        TraktProgressRepository.onProfileChanged()
    }

    fun clearLocalState() {
        val previousAccountJob = synchronized(accountScopeLock) {
            accountScopeJob.also {
                accountScopeJob = SupervisorJob()
                accountScope = CoroutineScope(accountScopeJob + Dispatchers.Default)
            }
        }
        previousAccountJob.cancel()
        cancelMetadataResolution(resetProviderHistory = true)
        hasLoaded = false
        hasLoadedNuvioRemoteProgress = false
        currentProfileId = 1
        profileGeneration += 1L
        updateActiveSource(WatchProgressSource.NUVIO_SYNC)
        clearLocalEntries()
        lastSuccessfulPushEpochMs = 0L
        deltaCursorEventId = 0L
        deltaInitialized = false
        TraktProgressRepository.clearLocalState()
        TraktSettingsRepository.clearLocalState()
        _uiState.value = WatchProgressUiState()
    }

    private fun loadFromDisk(profileId: Int) {
        cancelMetadataResolution(resetProviderHistory = true)
        currentProfileId = profileId
        profileGeneration += 1L
        hasLoaded = true
        hasLoadedNuvioRemoteProgress = false
        clearLocalEntries()

        val payload = WatchProgressStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isNotEmpty()) {
            val storedPayload = WatchProgressCodec.decodePayload(payload)
            lastSuccessfulPushEpochMs = storedPayload.lastSuccessfulPushEpochMs
            deltaCursorEventId = storedPayload.deltaCursorEventId
            deltaInitialized = storedPayload.deltaInitialized
            replaceLocalEntries(storedPayload.entries)
            replaceDirtyProgressKeys(storedPayload.dirtyProgressKeys)
        } else {
            lastSuccessfulPushEpochMs = 0L
            deltaCursorEventId = 0L
            deltaInitialized = false
        }
        log.d {
            "Loaded watch progress for profile $profileId: entries=${localEntryCount()} " +
                "deltaInitialized=$deltaInitialized cursor=$deltaCursorEventId lastPush=$lastSuccessfulPushEpochMs"
        }
        publish()
        resolveRemoteMetadata()
    }

    private fun activeOperationGeneration(profileId: Int): Long? {
        if (ProfileRepository.activeProfileId != profileId) return null
        if (!hasLoaded || currentProfileId != profileId) {
            loadFromDisk(profileId)
        }
        return profileGeneration
    }

    private fun isActiveOperation(profileId: Int, generation: Long): Boolean =
        currentProfileId == profileId &&
            profileGeneration == generation &&
            ProfileRepository.activeProfileId == profileId

    suspend fun pullFromServer(profileId: Int) {
        refreshForSource(
            profileId = profileId,
            source = activeSource,
            sourceChanged = false,
            force = false,
        )
    }

    suspend fun forceSnapshotRefreshFromServer(profileId: Int) {
        refreshForSource(
            profileId = profileId,
            source = activeSource,
            sourceChanged = false,
            force = true,
        )
    }

    suspend fun selectWatchProgressSource(profileId: Int, source: WatchProgressSource) {
        WatchProgressSourceCoordinator.selectSource(profileId = profileId, source = source)
    }

    suspend fun clearLocalAndForceSnapshotRefreshFromServer(profileId: Int) {
        ContinueWatchingEnrichmentCache.clearAll(profileId)
        WatchProgressSourceCoordinator.refreshActiveSource(profileId = profileId, force = true)
    }

    internal fun activateSource(source: WatchProgressSource) {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        TraktProgressRepository.ensureLoaded()
        if (!hasLoaded) {
            loadFromDisk(ProfileRepository.activeProfileId)
        }
        if (activeSource == source) {
            publish()
            return
        }

        updateActiveSource(source)
        cancelMetadataResolution(resetProviderHistory = false)
        if (source == WatchProgressSource.TRAKT) {
            TraktProgressRepository.clearLocalState()
        } else {
            hasLoadedNuvioRemoteProgress = false
        }
        publish()
        if (source == WatchProgressSource.NUVIO_SYNC) {
            resolveRemoteMetadata()
        }
    }

    internal suspend fun refreshForSource(
        profileId: Int,
        source: WatchProgressSource,
        sourceChanged: Boolean,
        force: Boolean,
    ): Boolean {
        ensureLoaded()
        if (currentProfileId != profileId) {
            loadFromDisk(profileId)
        }
        val operationGeneration = activeOperationGeneration(profileId) ?: run {
            log.d { "Skipping watch progress refresh for inactive profile $profileId" }
            return false
        }

        activateSource(source)
        return when (source) {
            WatchProgressSource.TRAKT -> refreshTraktSource(
                profileId = profileId,
                operationGeneration = operationGeneration,
                sourceChanged = sourceChanged,
                force = force,
            )

            WatchProgressSource.NUVIO_SYNC -> refreshNuvioSource(
                profileId = profileId,
                operationGeneration = operationGeneration,
                force = force,
            )
        }
    }

    private suspend fun refreshTraktSource(
        profileId: Int,
        operationGeneration: Long,
        sourceChanged: Boolean,
        force: Boolean,
    ): Boolean {
        if (!TraktAuthRepository.isAuthenticated.value) {
            log.d { "Skipping Trakt progress refresh because Trakt is not authenticated" }
            return false
        }

        return try {
            if (force || sourceChanged) {
                TraktProgressRepository.invalidateAndRefresh()
            } else {
                TraktProgressRepository.refreshNow()
            }
            if (isActiveOperation(profileId, operationGeneration) && activeSource == WatchProgressSource.TRAKT) {
                publish()
            }
            val state = TraktProgressRepository.uiState.value
            state.hasLoadedRemoteProgress && state.errorMessage == null
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.e(error) { "Failed to refresh Trakt watch progress" }
            false
        }
    }

    private suspend fun refreshNuvioSource(
        profileId: Int,
        operationGeneration: Long,
        force: Boolean,
    ): Boolean {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) {
            // There is no upstream source for this account, so local state is authoritative.
            hasLoadedNuvioRemoteProgress = true
            publish()
            return true
        }

        return nuvioPullMutex.withLock {
            try {
                if (force) {
                    pullNuvioSnapshotFromServer(
                        profileId = profileId,
                        operationGeneration = operationGeneration,
                    )
                } else {
                    pullSupabaseDeltaFromServer(
                        profileId = profileId,
                        operationGeneration = operationGeneration,
                    )
                }
                true
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.e(error) { "Failed to refresh Nuvio watch progress" }
                false
            }
        }
    }

    private suspend fun pullNuvioSnapshotFromServer(
        profileId: Int,
        operationGeneration: Long,
    ) {
        val cursorBeforeSnapshot = try {
            syncAdapter.getDeltaCursor(profileId)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.w { "Watch progress cursor unavailable during snapshot refresh: ${error.message}" }
            null
        }

        pullFullFromAdapter(
            profileId = profileId,
            resetDeltaState = cursorBeforeSnapshot == null,
            operationGeneration = operationGeneration,
            preserveLocalEntries = true,
        )
        if (!isActiveOperation(profileId, operationGeneration)) return

        if (cursorBeforeSnapshot != null) {
            deltaCursorEventId = cursorBeforeSnapshot
            deltaInitialized = true
            persist()
        }
    }

    private suspend fun pullSupabaseDeltaFromServer(
        profileId: Int,
        operationGeneration: Long,
    ) {
        if (!isActiveOperation(profileId, operationGeneration)) return
        log.d {
            "Watch progress delta sync start: profile=$profileId entries=${localEntryCount()} " +
                "deltaInitialized=$deltaInitialized cursor=$deltaCursorEventId lastPush=$lastSuccessfulPushEpochMs"
        }
        if (!deltaInitialized) {
            log.d { "Watch progress delta not initialized for profile $profileId; requesting cursor before snapshot" }
            val cursorBeforeSnapshot = try {
                syncAdapter.getDeltaCursor(profileId)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w { "Watch progress delta cursor unavailable, falling back to full pull: ${error.message}" }
                null
            }
            if (cursorBeforeSnapshot == null) {
                log.d { "Watch progress delta cursor unavailable for profile $profileId; using snapshot fallback" }
                pullFullFromAdapter(
                    profileId = profileId,
                    resetDeltaState = true,
                    operationGeneration = operationGeneration,
                )
                return
            }

            log.d { "Watch progress delta cursor before snapshot for profile $profileId is $cursorBeforeSnapshot" }
            pullFullFromAdapter(
                profileId = profileId,
                resetDeltaState = false,
                operationGeneration = operationGeneration,
            )
            if (!isActiveOperation(profileId, operationGeneration)) return
            deltaCursorEventId = cursorBeforeSnapshot
            deltaInitialized = true
            persist()
            log.d {
                "Watch progress delta initialized for profile $profileId: cursor=$deltaCursorEventId " +
                    "entries=${localEntryCount()}"
            }
            return
        }

        var cursor = deltaCursorEventId
        var changed = false
        var totalUpserts = 0
        var totalDeletes = 0
        var preservedLocalItems = false
        var cursorAdvanced = false
        var page = 1

        while (true) {
            log.d { "Pulling watch progress delta page $page for profile $profileId from cursor $cursor" }
            val events = try {
                syncAdapter.pullDelta(
                    profileId = profileId,
                    sinceEventId = cursor,
                    limit = WATCH_PROGRESS_DELTA_PAGE_SIZE,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w { "Watch progress delta pull unavailable, falling back to full pull: ${error.message}" }
                pullFullFromAdapter(
                    profileId = profileId,
                    resetDeltaState = true,
                    operationGeneration = operationGeneration,
                )
                return
            }
            if (!isActiveOperation(profileId, operationGeneration)) return
            if (events.isEmpty()) {
                log.d { "Watch progress delta page $page returned no events for profile $profileId at cursor $cursor" }
                break
            }

            val firstEvent = events.firstOrNull()?.eventId
            val lastEvent = events.lastOrNull()?.eventId
            val eventUpserts = events.count { it.operation.equals(WATCH_PROGRESS_DELTA_OPERATION_UPSERT, ignoreCase = true) }
            val eventDeletes = events.count { it.operation.equals(WATCH_PROGRESS_DELTA_OPERATION_DELETE, ignoreCase = true) }
            log.d {
                "Watch progress delta page $page fetched ${events.size} events for profile $profileId " +
                    "first=$firstEvent last=$lastEvent upserts=$eventUpserts deletes=$eventDeletes"
            }

            val pageResult = applyWatchProgressDeltaEvents(events = events)
            changed = pageResult.changed || changed
            totalUpserts += pageResult.appliedUpserts
            totalDeletes += pageResult.appliedDeletes
            preservedLocalItems = preservedLocalItems || pageResult.preservedLocalItems
            val previousCursor = cursor
            cursor = maxOf(cursor, events.maxOf { it.eventId })
            cursorAdvanced = cursorAdvanced || cursor > previousCursor
            deltaCursorEventId = cursor
            deltaInitialized = true
            log.d {
                "Watch progress delta page $page applied for profile $profileId: " +
                    "appliedUpserts=${pageResult.appliedUpserts} appliedDeletes=${pageResult.appliedDeletes} " +
                    "preservedLocal=${pageResult.preservedLocalItems} newCursor=$cursor"
            }

            if (events.size < WATCH_PROGRESS_DELTA_PAGE_SIZE) break
            page += 1
        }

        hasLoaded = true
        val remoteReadinessChanged = !hasLoadedNuvioRemoteProgress
        hasLoadedNuvioRemoteProgress = true
        if (changed || remoteReadinessChanged) {
            publish()
        }
        if (changed || cursorAdvanced) {
            persist()
        }
        if (changed) {
            resolveRemoteMetadata()
        }
        log.d {
            "Watch progress delta sync finished for profile $profileId: changed=$changed " +
                "appliedUpserts=$totalUpserts appliedDeletes=$totalDeletes preservedLocal=$preservedLocalItems " +
                "cursor=$deltaCursorEventId entries=${localEntryCount()}"
        }
    }

    private suspend fun pullFullFromAdapter(
        profileId: Int,
        resetDeltaState: Boolean,
        operationGeneration: Long,
        preserveLocalEntries: Boolean = true,
    ) {
        val serverEntries = syncAdapter.pull(profileId = profileId)
        if (!isActiveOperation(profileId, operationGeneration)) return
        log.d {
            "Watch progress snapshot fetched ${serverEntries.size} entries for profile $profileId " +
                "resetDeltaState=$resetDeltaState preserveLocalEntries=$preserveLocalEntries"
        }
        val localBeforePull = localEntriesSnapshot()
        val reconciliation = reconcileLocalProgressKeysWithSnapshot(
            serverEntries = serverEntries,
            localEntries = localBeforePull,
        )
        migrateDirtyProgressKeys(reconciliation.migratedKeys)
        val dirtyBeforeApply = dirtyProgressKeysSnapshot()
        val updatedEntries = if (preserveLocalEntries) {
            mergeWatchProgressEntriesPreservingUnsynced(
                serverEntries = serverEntries,
                localEntries = reconciliation.entries,
                dirtyProgressKeys = dirtyBeforeApply,
            )
        } else {
            val newestRemoteByKey = linkedMapOf<String, WatchProgressEntry>()
            serverEntries.forEach { record ->
                val key = record.resolvedProgressKey()
                val candidate = record.toWatchProgressEntry(cached = null)
                val existing = newestRemoteByKey[key]
                if (existing == null || candidate.isFresherThan(existing)) {
                    newestRemoteByKey[key] = candidate
                }
            }
            newestRemoteByKey
        }
        replaceLocalEntries(updatedEntries)
        acknowledgeDirtyProgressFromSnapshot(
            serverEntries = serverEntries,
            localEntriesBeforeApply = reconciliation.entries,
            dirtyKeysBeforeApply = dirtyBeforeApply,
        )
        if (resetDeltaState) {
            deltaCursorEventId = 0L
            deltaInitialized = false
        }
        hasLoaded = true
        hasLoadedNuvioRemoteProgress = true
        publish()
        persist()
        resolveRemoteMetadata()
        log.d {
            "Watch progress snapshot applied for profile $profileId: entries=${localEntryCount()} " +
                "deltaInitialized=$deltaInitialized cursor=$deltaCursorEventId"
        }
    }

    private fun applyWatchProgressDeltaEvents(
        events: Collection<ProgressDeltaEvent>,
    ): WatchProgressDeltaApplyResult {
        var changed = false
        var appliedUpserts = 0
        var appliedDeletes = 0
        var preservedLocalItems = false
        val latestEventByProgressKey = linkedMapOf<String, ProgressDeltaEvent>()
        events.sortedBy(ProgressDeltaEvent::eventId).forEach { event ->
            val progressKey = event.resolvedProgressKey()
            if (progressKey.isBlank()) {
                return@forEach
            }
            when (event.operation.lowercase()) {
                WATCH_PROGRESS_DELTA_OPERATION_DELETE -> {
                    latestEventByProgressKey[progressKey] = event
                }
                WATCH_PROGRESS_DELTA_OPERATION_UPSERT -> {
                    if (event.videoId.isNotBlank()) {
                        latestEventByProgressKey[progressKey] = event
                    }
                }
                else -> Unit
            }
        }

        latestEventByProgressKey.forEach { (progressKey, event) ->
            val current = localEntry(progressKey)
            val decision = decideWatchProgressDeltaEvent(
                current = current,
                event = event,
                isLocalDirty = progressKey in dirtyProgressKeysSnapshot(),
            )
            when (decision.type) {
                WatchProgressDeltaDecisionType.UPSERT -> {
                    upsertLocalEntry(requireNotNull(decision.updatedEntry))
                    changed = true
                    appliedUpserts += 1
                }
                WatchProgressDeltaDecisionType.DELETE -> {
                    if (removeLocalEntry(progressKey) != null) {
                        changed = true
                        appliedDeletes += 1
                    }
                }
                WatchProgressDeltaDecisionType.PRESERVE_LOCAL -> {
                    preservedLocalItems = true
                }
                WatchProgressDeltaDecisionType.IGNORE -> Unit
            }
            if (decision.clearsDirtyProgress) {
                clearProgressDirty(progressKey)
            }
        }
        return WatchProgressDeltaApplyResult(
            appliedUpserts = appliedUpserts,
            appliedDeletes = appliedDeletes,
            preservedLocalItems = preservedLocalItems,
            changed = changed,
        )
    }

    internal fun decideWatchProgressDeltaEvent(
        current: WatchProgressEntry?,
        event: ProgressDeltaEvent,
        isLocalDirty: Boolean,
    ): WatchProgressDeltaDecision = when (event.operation.lowercase()) {
        WATCH_PROGRESS_DELTA_OPERATION_UPSERT -> {
            if (event.videoId.isBlank()) {
                WatchProgressDeltaDecision(WatchProgressDeltaDecisionType.IGNORE)
            } else {
                val updated = event.toProgressSyncRecord().toWatchProgressEntry(cached = current)
                when {
                    current == null ->
                        WatchProgressDeltaDecision(
                            type = WatchProgressDeltaDecisionType.UPSERT,
                            updatedEntry = updated,
                            clearsDirtyProgress = true,
                        )
                    isLocalDirty && current.isFresherThan(updated) ->
                        WatchProgressDeltaDecision(WatchProgressDeltaDecisionType.PRESERVE_LOCAL)
                    current == updated ->
                        WatchProgressDeltaDecision(
                            type = WatchProgressDeltaDecisionType.IGNORE,
                            clearsDirtyProgress = true,
                        )
                    else -> WatchProgressDeltaDecision(
                        type = WatchProgressDeltaDecisionType.UPSERT,
                        updatedEntry = updated,
                        clearsDirtyProgress = true,
                    )
                }
            }
        }
        WATCH_PROGRESS_DELTA_OPERATION_DELETE -> when {
            current == null -> WatchProgressDeltaDecision(WatchProgressDeltaDecisionType.IGNORE)
            isLocalDirty -> WatchProgressDeltaDecision(WatchProgressDeltaDecisionType.PRESERVE_LOCAL)
            else -> WatchProgressDeltaDecision(
                type = WatchProgressDeltaDecisionType.DELETE,
                clearsDirtyProgress = true,
            )
        }
        else -> WatchProgressDeltaDecision(WatchProgressDeltaDecisionType.IGNORE)
    }

    private fun ProgressSyncRecord.toWatchProgressEntry(cached: WatchProgressEntry?): WatchProgressEntry =
        WatchProgressEntry(
            contentType = contentType,
            parentMetaId = contentId,
            parentMetaType = cached?.parentMetaType ?: contentType,
            videoId = videoId,
            title = cached?.title?.takeIf { it.isNotBlank() } ?: contentId,
            logo = cached?.logo,
            poster = cached?.poster,
            background = cached?.background,
            seasonNumber = season,
            episodeNumber = episode,
            episodeTitle = cached?.episodeTitle,
            episodeThumbnail = cached?.episodeThumbnail,
            lastPositionMs = position,
            durationMs = duration,
            lastUpdatedEpochMs = lastWatched,
            providerName = cached?.providerName,
            providerAddonId = cached?.providerAddonId,
            lastStreamTitle = cached?.lastStreamTitle,
            lastStreamSubtitle = cached?.lastStreamSubtitle,
            pauseDescription = cached?.pauseDescription,
            lastSourceUrl = cached?.lastSourceUrl,
            isCompleted = isWatchProgressComplete(position, duration, false),
            progressKey = resolvedProgressKey(),
        )

    private fun ProgressDeltaEvent.toProgressSyncRecord(): ProgressSyncRecord =
        ProgressSyncRecord(
            progressKey = progressKey,
            contentId = contentId,
            contentType = contentType,
            videoId = videoId,
            season = season,
            episode = episode,
            position = position,
            duration = duration,
            lastWatched = lastWatched,
        )

    internal fun mergeWatchProgressEntriesPreservingUnsynced(
        serverEntries: Collection<ProgressSyncRecord>,
        localEntries: Collection<WatchProgressEntry>,
        dirtyProgressKeys: Set<String>,
    ): Map<String, WatchProgressEntry> {
        val reconciliation = reconcileLocalProgressKeysWithSnapshot(
            serverEntries = serverEntries,
            localEntries = localEntries,
        )
        val effectiveDirtyKeys = dirtyProgressKeys.mapTo(mutableSetOf()) { key ->
            reconciliation.migratedKeys[key] ?: key
        }
        val localByProgressKey = reconciliation.entries.newestByProgressKey()
        val merged = linkedMapOf<String, WatchProgressEntry>()
        serverEntries.forEach { record ->
            val progressKey = record.resolvedProgressKey()
            val candidate = record.toWatchProgressEntry(cached = localByProgressKey[progressKey])
            val existing = merged[progressKey]
            if (existing == null || candidate.isFresherThan(existing)) {
                merged[progressKey] = candidate
            }
        }

        localByProgressKey.forEach { (progressKey, localEntry) ->
            val remoteEntry = merged[progressKey]
            if (progressKey !in effectiveDirtyKeys) return@forEach
            if (remoteEntry == null || localEntry.isFresherThan(remoteEntry)) {
                merged[progressKey] = localEntry
            }
        }

        return merged
    }

    private fun retryMetadataResolutionWhenAddonMetaProvidersReady(state: AddonsUiState) {
        if (!hasLoaded || shouldUseTraktProgress()) return

        val readiness = state.metadataProviderReadiness()
        if (!readiness.isReady) return

        val fingerprint = readiness.fingerprint
        if (!metadataResolutionRetryCoordinator.requestForProviders(fingerprint)) return
        resolveRemoteMetadata()
    }

    private fun cancelMetadataResolution(resetProviderHistory: Boolean) {
        if (resetProviderHistory) {
            metadataResolutionRetryCoordinator.reset()
        } else {
            metadataResolutionRetryCoordinator.invalidateActiveResolution()
        }
        metadataResolutionJob?.cancel()
        metadataResolutionJob = null
    }

    private fun resolveRemoteMetadata() {
        val targetProfileId = currentProfileId
        val targetGeneration = profileGeneration
        val missingMetadataEntries = localEntriesSnapshot()
            .filter(WatchProgressEntry::needsRemoteMetadataEnrichment)
        val entriesToResolve = missingMetadataEntries.continueWatchingEntries(
            limit = WATCH_PROGRESS_METADATA_RESOLUTION_LIMIT,
        )
        val needsResolution = entriesToResolve
            .groupBy { it.parentMetaId to it.contentType }

        if (needsResolution.isEmpty()) return

        val providersAtStart = AddonRepository.uiState.value.metadataProviderReadiness()
        val resolutionGeneration = metadataResolutionRetryCoordinator.beginResolution(
            providerFingerprint = providersAtStart.fingerprint.takeIf { providersAtStart.isReady },
        )
        metadataResolutionJob?.cancel()
        metadataResolutionJob = syncScope.launch(start = CoroutineStart.LAZY) {
            try {
                if (!isActiveOperation(targetProfileId, targetGeneration)) return@launch
                AddonRepository.initialize()
                val providerReadiness = AddonRepository.uiState.value.metadataProviderReadiness()
                if (providerReadiness.isReady) {
                    metadataResolutionRetryCoordinator.providersObservedBeforeFetch(
                        resolutionGeneration = resolutionGeneration,
                        providerFingerprint = providerReadiness.fingerprint,
                    )
                }
                val semaphore = Semaphore(WATCH_PROGRESS_METADATA_RESOLUTION_CONCURRENCY)
                val resolutionResults = Channel<RemoteMetadataResolutionResult>(Channel.UNLIMITED)
                needsResolution.forEach { (key, entries) ->
                    launch {
                        val result = semaphore.withPermit {
                            fetchRemoteMetadataGroup(key = key, entries = entries)
                        }
                        resolutionResults.send(result)
                    }
                }

                var resolvedEntries = 0
                repeat(needsResolution.size) {
                    val result = resolutionResults.receive()
                    ensureActive()
                    if (!isActiveOperation(targetProfileId, targetGeneration)) return@launch
                    val meta = result.meta
                    if (meta == null) {
                        return@repeat
                    }

                    var appliedEntries = 0
                    for (entry in result.entries) {
                        val current = localEntry(entry.resolvedProgressKey()) ?: continue
                        val enriched = enrichWatchProgressEntry(current = current, meta = meta)
                        if (enriched == current) continue
                        upsertLocalEntry(enriched)
                        appliedEntries += 1
                    }
                    if (appliedEntries == 0) return@repeat

                    resolvedEntries += appliedEntries

                    if (isActiveOperation(targetProfileId, targetGeneration)) {
                        publish()
                    }
                }
                resolutionResults.close()
                if (resolvedEntries > 0 && isActiveOperation(targetProfileId, targetGeneration)) {
                    persist()
                }
            } finally {
                val currentReadiness = AddonRepository.uiState.value.metadataProviderReadiness()
                val shouldRetry = metadataResolutionRetryCoordinator.finishResolution(
                    resolutionGeneration = resolutionGeneration,
                    currentProviderFingerprint = currentReadiness.fingerprint.takeIf { currentReadiness.isReady },
                )
                if (shouldRetry && hasLoaded && !shouldUseTraktProgress()) {
                    resolveRemoteMetadata()
                }
            }
        }
        metadataResolutionJob?.start()
    }

    private suspend fun fetchRemoteMetadataGroup(
        key: Pair<String, String>,
        entries: List<WatchProgressEntry>,
    ): RemoteMetadataResolutionResult {
        val (metaId, metaType) = key
        var meta: MetaDetails? = null
        for (attempt in 1..WATCH_PROGRESS_METADATA_FETCH_ATTEMPTS) {
            if (attempt > 1) {
                val retryDelayMs = WATCH_PROGRESS_METADATA_RETRY_BASE_DELAY_MS *
                    (1L shl (attempt - 2))
                delay(retryDelayMs)
            }
            meta = try {
                MetaDetailsRepository.fetch(metaType, metaId)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                null
            }
            if (meta != null) break
        }
        return RemoteMetadataResolutionResult(
            entries = entries,
            meta = meta,
        )
    }

    fun upsertPlaybackProgress(
        session: WatchProgressPlaybackSession,
        snapshot: PlayerPlaybackSnapshot,
        syncRemote: Boolean = true,
    ) {
        ensureLoaded()
        upsert(session = session, snapshot = snapshot, persist = true, syncRemote = syncRemote)
    }

    fun flushPlaybackProgress(
        session: WatchProgressPlaybackSession,
        snapshot: PlayerPlaybackSnapshot,
        syncRemote: Boolean = true,
    ) {
        ensureLoaded()
        upsert(session = session, snapshot = snapshot, persist = true, syncRemote = syncRemote)
    }

    fun clearProgress(videoId: String, parentMetaId: String? = null) {
        clearProgress(videoIds = listOf(videoId), parentMetaId = parentMetaId)
    }

    fun clearProgress(
        videoIds: Collection<String>,
        parentMetaId: String? = null,
    ) {
        ensureLoaded()
        if (videoIds.isEmpty()) return

        val useTraktProgress = shouldUseTraktProgress()
        if (useTraktProgress) {
            val entriesToRemove = currentEntries().filter { entry ->
                entry.videoId in videoIds &&
                    (parentMetaId == null || entry.parentMetaId == parentMetaId)
            }
            val locallyRemovedEntries = removeStoredLocalEntries(entriesToRemove)
            if (parentMetaId == null) {
                videoIds.forEach(TraktProgressRepository::applyOptimisticRemoval)
            } else {
                entriesToRemove
                    .distinctBy { entry ->
                        Triple(entry.parentMetaId, entry.seasonNumber, entry.episodeNumber)
                    }
                    .forEach { entry ->
                        TraktProgressRepository.applyOptimisticRemoval(
                            contentId = entry.parentMetaId,
                            seasonNumber = entry.seasonNumber,
                            episodeNumber = entry.episodeNumber,
                        )
                    }
            }
            if (locallyRemovedEntries.isNotEmpty()) {
                persist()
            }
            publish()
            val traktEntriesToRemove = entriesToRemove.filter { entry -> entry.shouldAttemptTraktPlaybackDelete() }
            if (traktEntriesToRemove.isNotEmpty()) {
                syncScope.launch {
                    traktEntriesToRemove.forEach { entry ->
                        runCatching {
                            TraktProgressRepository.removeProgress(
                                contentId = entry.parentMetaId,
                                seasonNumber = entry.seasonNumber,
                                episodeNumber = entry.episodeNumber,
                            )
                        }.onFailure { error ->
                            if (error is CancellationException) throw error
                            log.e(error) { "Failed to clear Trakt playback progress for ${entry.videoId}" }
                        }
                    }
                }
            }
            return
        }

        val removedEntries = removeLocalEntriesForVideoIds(
            videoIds = videoIds,
            parentMetaId = parentMetaId,
        )
        if (removedEntries.isNotEmpty()) {
            publish()
            persist()
            pushDeleteToServer(removedEntries)
        }
    }

    fun removeProgress(
        contentId: String,
        seasonNumber: Int? = null,
        episodeNumber: Int? = null,
    ) {
        ensureLoaded()
        val normalizedContentId = contentId.trim()
        if (normalizedContentId.isBlank()) return

        val useTraktProgress = shouldUseTraktProgress()
        val entriesToRemove = currentEntries().filter { entry ->
            if (entry.parentMetaId != normalizedContentId) {
                false
            } else if (seasonNumber != null && episodeNumber != null) {
                entry.seasonNumber == seasonNumber && entry.episodeNumber == episodeNumber
            } else {
                true
            }
        }
        if (entriesToRemove.isEmpty()) return

        if (useTraktProgress) {
            val locallyRemovedEntries = removeStoredLocalEntries(entriesToRemove)
            TraktProgressRepository.applyOptimisticRemoval(
                contentId = normalizedContentId,
                seasonNumber = seasonNumber,
                episodeNumber = episodeNumber,
            )
            if (locallyRemovedEntries.isNotEmpty()) {
                persist()
            }
            publish()
            val shouldAttemptTraktDelete = entriesToRemove.any { entry -> entry.shouldAttemptTraktPlaybackDelete() }
            if (!shouldAttemptTraktDelete) {
                return
            }
            syncScope.launch {
                runCatching {
                    TraktProgressRepository.removeProgress(
                        contentId = normalizedContentId,
                        seasonNumber = seasonNumber,
                        episodeNumber = episodeNumber,
                    )
                }.onFailure { error ->
                    if (error is CancellationException) throw error
                    log.e(error) { "Failed to remove Trakt watch progress" }
                }
            }
            return
        }

        entriesToRemove.forEach { entry ->
            removeLocalEntry(entry.resolvedProgressKey())
        }
        publish()
        persist()
        pushDeleteToServer(entriesToRemove)
    }

    fun progressForVideo(
        videoId: String,
        parentMetaId: String? = null,
        seasonNumber: Int? = null,
        episodeNumber: Int? = null,
    ): WatchProgressEntry? {
        ensureLoaded()
        return if (shouldUseTraktProgress()) {
            TraktProgressRepository.uiState.value.entries
        } else {
            localEntriesSnapshot()
        }.resolveProgressForVideo(
            videoId = videoId,
            parentMetaId = parentMetaId,
            seasonNumber = seasonNumber,
            episodeNumber = episodeNumber,
        )
    }

    fun resumeEntryForSeries(metaId: String): WatchProgressEntry? {
        ensureLoaded()
        return currentEntries().resumeEntryForSeries(metaId)
    }

    fun continueWatching(): List<WatchProgressEntry> {
        ensureLoaded()
        return currentEntries().continueWatchingEntries()
    }

    fun refreshEpisodeProgress(contentId: String, forceRefresh: Boolean = false) {
        ensureLoaded()
        if (!shouldUseTraktProgress()) return
        syncScope.launch {
            runCatching {
                TraktProgressRepository.refreshEpisodeProgress(
                    contentId = contentId,
                    forceRefresh = forceRefresh,
                )
            }.onFailure { error ->
                if (error is CancellationException) throw error
                log.w { "Failed to refresh Trakt episode progress for $contentId: ${error.message}" }
            }
        }
    }

    private fun upsert(
        session: WatchProgressPlaybackSession,
        snapshot: PlayerPlaybackSnapshot,
        persist: Boolean,
        syncRemote: Boolean,
    ) {
        val targetProfileId = session.profileId
        val positionMs = snapshot.positionMs.coerceAtLeast(0L)
        val durationMs = snapshot.durationMs.coerceAtLeast(0L)
        val isCompleted = isWatchProgressComplete(
            positionMs = positionMs,
            durationMs = durationMs,
            isEnded = snapshot.isEnded,
        )
        if (!isCompleted && !shouldStoreWatchProgress(positionMs = positionMs, durationMs = durationMs)) {
            return
        }

        val useTraktProgress = shouldUseTraktProgress()

        // If Trakt is the active CW source and parentMetaId is not Trakt-resolvable
        // but videoId contains a valid IMDB/TMDB, use the resolved ID to avoid
        // duplicate CW entries (one local with garbage ID, one from Trakt with real ID).
        val effectiveParentMetaId = if (useTraktProgress) {
            resolveEffectiveContentId(session.parentMetaId, session.videoId)
        } else {
            session.parentMetaId
        }

        val candidateEntry = WatchProgressEntry(
            contentType = session.contentType,
            parentMetaId = effectiveParentMetaId,
            parentMetaType = session.parentMetaType,
            videoId = session.videoId,
            title = session.title,
            logo = session.logo,
            poster = session.poster,
            background = session.background,
            seasonNumber = session.seasonNumber,
            episodeNumber = session.episodeNumber,
            episodeTitle = session.episodeTitle,
            episodeThumbnail = session.episodeThumbnail,
            lastPositionMs = if (isCompleted && durationMs > 0L) durationMs else positionMs,
            durationMs = durationMs,
            lastUpdatedEpochMs = WatchProgressClock.nowEpochMs(),
            providerName = session.providerName,
            providerAddonId = session.providerAddonId,
            lastStreamTitle = session.lastStreamTitle,
            lastStreamSubtitle = session.lastStreamSubtitle,
            pauseDescription = session.pauseDescription,
            lastSourceUrl = session.lastSourceUrl,
            isCompleted = isCompleted,
        ).normalizedCompletion()

        if (targetProfileId != currentProfileId || ProfileRepository.activeProfileId != targetProfileId) {
            val entry = if (persist) {
                upsertStoredProfileProgress(profileId = targetProfileId, entry = candidateEntry)
            } else {
                resolveStoredProfileProgressIdentity(profileId = targetProfileId, entry = candidateEntry)
            }
            if (syncRemote) {
                pushScrobbleToServer(entry = entry, profileId = targetProfileId)
            }
            return
        }

        val entry = localEntriesSnapshot().resolveIdentityForUpsert(candidateEntry)

        if (entry.parentMetaType.equals("series", ignoreCase = true)) {
            ContinueWatchingPreferencesRepository.removeDismissedNextUpKeysForContent(entry.parentMetaId)
        }

        upsertLocalEntry(entry)
        markProgressDirty(entry)
        if (useTraktProgress) {
            TraktProgressRepository.applyOptimisticProgress(entry)
        }
        publish()
        if (persist) persist()
        if (entry.needsRemoteMetadataEnrichment()) {
            resolveRemoteMetadata()
        }
        if (syncRemote) {
            pushScrobbleToServer(entry = entry, profileId = targetProfileId)
        }
        if (shouldCascadeCompletedProgressToWatchedHistory(entry, useTraktProgress)) {
            WatchingActions.onProgressEntryUpdated(entry, syncRemote = syncRemote)
        }
    }

    private fun upsertStoredProfileProgress(
        profileId: Int,
        entry: WatchProgressEntry,
    ): WatchProgressEntry {
        val payload = WatchProgressStorage.loadPayload(profileId).orEmpty().trim()
        val storedPayload = if (payload.isNotEmpty()) {
            WatchProgressCodec.decodePayload(payload)
        } else {
            StoredWatchProgressPayload()
        }
        val resolvedEntry = storedPayload.entries.resolveIdentityForUpsert(entry)
        val progressKey = resolvedEntry.resolvedProgressKey()
        val updatedEntries = storedPayload.entries
            .filterNot { it.resolvedProgressKey() == progressKey } + resolvedEntry
        WatchProgressStorage.savePayload(
            profileId,
            WatchProgressCodec.encodePayload(
                entries = updatedEntries,
                lastSuccessfulPushEpochMs = storedPayload.lastSuccessfulPushEpochMs,
                deltaCursorEventId = storedPayload.deltaCursorEventId,
                deltaInitialized = storedPayload.deltaInitialized,
                dirtyProgressKeys = storedPayload.dirtyProgressKeys + progressKey,
            ),
        )
        return resolvedEntry
    }

    private fun resolveStoredProfileProgressIdentity(
        profileId: Int,
        entry: WatchProgressEntry,
    ): WatchProgressEntry {
        val payload = WatchProgressStorage.loadPayload(profileId).orEmpty().trim()
        val storedEntries = if (payload.isEmpty()) {
            emptyList()
        } else {
            WatchProgressCodec.decodePayload(payload).entries
        }
        return storedEntries.resolveIdentityForUpsert(entry)
    }

    private fun pushScrobbleToServer(entry: WatchProgressEntry, profileId: Int) {
        val operationGeneration = profileGeneration.takeIf { profileId == currentProfileId }
        accountScopeSnapshot().launch {
            runCatching {
                syncAdapter.push(profileId = profileId, entries = listOf(entry))
                recordSuccessfulPush(
                    profileId = profileId,
                    operationGeneration = operationGeneration,
                    entries = listOf(entry),
                )
            }.onFailure { e ->
                log.e(e) { "Failed to push watch progress scrobble" }
            }
        }
    }

    private fun pushDeleteToServer(entries: Collection<WatchProgressEntry>) {
        if (shouldUseTraktProgress()) return
        val profileId = currentProfileId
        accountScopeSnapshot().launch {
            runCatching {
                if (entries.isEmpty()) return@runCatching
                syncAdapter.delete(profileId = profileId, entries = entries)
            }.onFailure { e ->
                log.e(e) { "Failed to push watch progress delete" }
            }
        }
    }

    private fun publish() {
        val entries = currentEntries()
        val sortedEntries = entries.sortedByDescending { it.lastUpdatedEpochMs }
        val hasLoadedRemoteProgress = if (shouldUseTraktProgress()) {
            TraktProgressRepository.uiState.value.hasLoadedRemoteProgress
        } else {
            hasLoadedNuvioRemoteProgress
        }
        _uiState.value = WatchProgressUiState(
            entries = sortedEntries,
            hasLoadedRemoteProgress = hasLoadedRemoteProgress,
        )
    }

    private fun persist() {
        WatchProgressStorage.savePayload(
            currentProfileId,
            WatchProgressCodec.encodePayload(
                entries = localEntriesSnapshot(),
                lastSuccessfulPushEpochMs = lastSuccessfulPushEpochMs,
                deltaCursorEventId = deltaCursorEventId,
                deltaInitialized = deltaInitialized,
                dirtyProgressKeys = dirtyProgressKeysSnapshot(),
            ),
        )
    }

    private fun recordSuccessfulPush(
        profileId: Int,
        operationGeneration: Long?,
        entries: Collection<WatchProgressEntry>,
    ) {
        if (profileId != currentProfileId) {
            acknowledgeStoredProfilePush(profileId = profileId, pushedEntries = entries)
            return
        }
        if (operationGeneration != profileGeneration) return
        val dirtyChanged = acknowledgeCurrentProfilePush(entries)
        val latestPushed = entries
            .asSequence()
            .map { entry -> entry.lastUpdatedEpochMs }
            .maxOrNull()
            ?: 0L
        val watermarkChanged = latestPushed > lastSuccessfulPushEpochMs
        if (watermarkChanged) {
            lastSuccessfulPushEpochMs = latestPushed
        }
        if (dirtyChanged || watermarkChanged) persist()
    }

    private fun acknowledgeCurrentProfilePush(entries: Collection<WatchProgressEntry>): Boolean =
        synchronized(entriesLock) {
            var changed = false
            entries.forEach { pushed ->
                val key = pushed.resolvedProgressKey()
                val current = entriesByProgressKey[key]
                if (
                    (current == null || current.lastUpdatedEpochMs <= pushed.lastUpdatedEpochMs) &&
                    dirtyProgressKeys.remove(key)
                ) {
                    changed = true
                }
            }
            changed
        }

    private fun acknowledgeStoredProfilePush(
        profileId: Int,
        pushedEntries: Collection<WatchProgressEntry>,
    ) {
        val payload = WatchProgressStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isEmpty()) return
        val storedPayload = WatchProgressCodec.decodePayload(payload)
        val storedByKey = storedPayload.entries.newestByProgressKey()
        val acknowledgedKeys = pushedEntries.mapNotNullTo(mutableSetOf()) { pushed ->
            val key = pushed.resolvedProgressKey()
            val current = storedByKey[key]
            key.takeIf { current == null || current.lastUpdatedEpochMs <= pushed.lastUpdatedEpochMs }
        }
        val remainingDirtyKeys = storedPayload.dirtyProgressKeys - acknowledgedKeys
        val latestPushed = pushedEntries.maxOfOrNull(WatchProgressEntry::lastUpdatedEpochMs) ?: 0L
        if (
            remainingDirtyKeys == storedPayload.dirtyProgressKeys &&
            latestPushed <= storedPayload.lastSuccessfulPushEpochMs
        ) {
            return
        }
        WatchProgressStorage.savePayload(
            profileId,
            WatchProgressCodec.encodePayload(
                entries = storedPayload.entries,
                lastSuccessfulPushEpochMs = maxOf(storedPayload.lastSuccessfulPushEpochMs, latestPushed),
                deltaCursorEventId = storedPayload.deltaCursorEventId,
                deltaInitialized = storedPayload.deltaInitialized,
                dirtyProgressKeys = remainingDirtyKeys,
            ),
        )
    }

    private fun shouldUseTraktProgress(): Boolean =
        activeSource == WatchProgressSource.TRAKT

    private fun accountScopeSnapshot(): CoroutineScope = synchronized(accountScopeLock) {
        accountScope
    }

    private fun updateActiveSource(source: WatchProgressSource) {
        activeSource = source
        _activeSourceState.value = source
    }

    private fun WatchProgressEntry.shouldAttemptTraktPlaybackDelete(): Boolean =
        isTraktCompatibleId(parentMetaId)

    private fun removeStoredLocalEntries(entries: Collection<WatchProgressEntry>): List<WatchProgressEntry> =
        synchronized(entriesLock) {
            val targetKeys = entries.mapTo(mutableSetOf()) { entry -> entry.resolvedProgressKey() }
            val keysToRemove = entriesByProgressKey
                .filterValues { localEntry ->
                    localEntry.resolvedProgressKey() in targetKeys || entries.any { target ->
                        localEntry.parentMetaId == target.parentMetaId &&
                            localEntry.seasonNumber == target.seasonNumber &&
                            localEntry.episodeNumber == target.episodeNumber
                    }
                }
                .keys
                .toList()
            dirtyProgressKeys.removeAll(keysToRemove.toSet())
            keysToRemove.mapNotNull(entriesByProgressKey::remove)
        }

    private fun currentEntries(): List<WatchProgressEntry> {
        return if (shouldUseTraktProgress()) {
            // Merge Trakt remote progress with local-only entries that use
            // non-Trakt-compatible IDs (kitsu:, mal:, anilist:, etc.).
            // Trakt will never return these IDs, so they must come from local storage.
            val traktItems = TraktProgressRepository.uiState.value.entries
            val localNonTraktItems = localEntriesSnapshot().filter {
                !isTraktCompatibleId(it.parentMetaId)
            }
            if (localNonTraktItems.isEmpty()) {
                traktItems
            } else {
                val traktKeys = traktItems.mapTo(mutableSetOf()) { entry -> entry.resolvedProgressKey() }
                val merged = traktItems.toMutableList()
                localNonTraktItems.forEach { localItem ->
                    if (localItem.resolvedProgressKey() !in traktKeys) {
                        merged.add(localItem)
                    }
                }
                merged
            }
        } else {
            localEntriesSnapshot()
        }
    }

    private fun localEntriesSnapshot(): List<WatchProgressEntry> =
        synchronized(entriesLock) {
            entriesByProgressKey.values.toList()
        }

    private fun localEntry(progressKey: String): WatchProgressEntry? =
        synchronized(entriesLock) {
            entriesByProgressKey[progressKey]
        }

    private fun localEntryCount(): Int =
        synchronized(entriesLock) {
            entriesByProgressKey.size
        }

    private fun clearLocalEntries() {
        synchronized(entriesLock) {
            entriesByProgressKey.clear()
            dirtyProgressKeys.clear()
        }
    }

    private fun dirtyProgressKeysSnapshot(): Set<String> =
        synchronized(entriesLock) {
            dirtyProgressKeys.toSet()
        }

    private fun replaceDirtyProgressKeys(keys: Collection<String>) {
        synchronized(entriesLock) {
            dirtyProgressKeys = keys
                .filterTo(mutableSetOf()) { key -> key in entriesByProgressKey }
        }
    }

    private fun markProgressDirty(entry: WatchProgressEntry) {
        synchronized(entriesLock) {
            dirtyProgressKeys += entry.resolvedProgressKey()
        }
    }

    private fun clearProgressDirty(progressKey: String) {
        synchronized(entriesLock) {
            dirtyProgressKeys -= progressKey
        }
    }

    private fun migrateDirtyProgressKeys(migrations: Map<String, String>) {
        if (migrations.isEmpty()) return
        synchronized(entriesLock) {
            migrations.forEach { (oldKey, newKey) ->
                if (dirtyProgressKeys.remove(oldKey)) {
                    dirtyProgressKeys += newKey
                }
            }
        }
    }

    private fun acknowledgeDirtyProgressFromSnapshot(
        serverEntries: Collection<ProgressSyncRecord>,
        localEntriesBeforeApply: Collection<WatchProgressEntry>,
        dirtyKeysBeforeApply: Set<String>,
    ) {
        if (dirtyKeysBeforeApply.isEmpty()) return
        val localByKey = localEntriesBeforeApply.newestByProgressKey()
        val remoteByKey = linkedMapOf<String, WatchProgressEntry>()
        serverEntries.forEach { record ->
            val key = record.resolvedProgressKey()
            val candidate = record.toWatchProgressEntry(cached = localByKey[key])
            val existing = remoteByKey[key]
            if (existing == null || candidate.isFresherThan(existing)) {
                remoteByKey[key] = candidate
            }
        }
        synchronized(entriesLock) {
            dirtyKeysBeforeApply.forEach { key ->
                val local = localByKey[key]
                val remote = remoteByKey[key]
                if (remote != null && (local == null || !local.isFresherThan(remote))) {
                    dirtyProgressKeys -= key
                }
            }
        }
    }

    private fun replaceLocalEntries(entries: Collection<WatchProgressEntry>) {
        synchronized(entriesLock) {
            entriesByProgressKey = entries.newestByProgressKey().toMutableMap()
        }
    }

    private fun replaceLocalEntries(entries: Map<String, WatchProgressEntry>) {
        synchronized(entriesLock) {
            entriesByProgressKey = entries.values.newestByProgressKey().toMutableMap()
        }
    }

    private fun upsertLocalEntry(entry: WatchProgressEntry) {
        synchronized(entriesLock) {
            val resolvedEntry = entry.withResolvedProgressKey()
            entriesByProgressKey[resolvedEntry.resolvedProgressKey()] = resolvedEntry
        }
    }

    private fun removeLocalEntry(progressKey: String): WatchProgressEntry? =
        synchronized(entriesLock) {
            dirtyProgressKeys -= progressKey
            entriesByProgressKey.remove(progressKey)
        }

    private fun removeLocalEntriesForVideoIds(
        videoIds: Collection<String>,
        parentMetaId: String?,
    ): List<WatchProgressEntry> =
        synchronized(entriesLock) {
            if (videoIds.isEmpty()) return@synchronized emptyList()
            val ids = videoIds.toSet()
            val keysToRemove = entriesByProgressKey
                .filterValues { entry ->
                    entry.videoId in ids &&
                        (parentMetaId == null || entry.parentMetaId == parentMetaId)
                }
                .keys
                .toList()
            dirtyProgressKeys.removeAll(keysToRemove.toSet())
            keysToRemove.mapNotNull(entriesByProgressKey::remove)
        }

    fun isDroppedShow(contentId: String): Boolean {
        return shouldUseTraktProgress() && TraktProgressRepository.isShowHiddenFromProgress(contentId)
    }

    private fun AddonsUiState.metadataProviderReadiness(): MetadataProviderReadiness {
        val enabled = addons.enabledAddons()
        val providers = enabled
            .mapNotNull { addon -> addon.manifest }
            .filter { manifest -> manifest.hasMetaResource() }
        return MetadataProviderReadiness(
            providers = providers,
        )
    }

    private fun AddonManifest.hasMetaResource(): Boolean =
        resources.any { resource -> resource.name == "meta" }

}
