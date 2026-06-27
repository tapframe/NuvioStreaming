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
import com.nuvio.app.features.trakt.isTraktCompatibleId
import com.nuvio.app.features.trakt.resolveEffectiveContentId
import com.nuvio.app.features.trakt.shouldUseTraktProgress as shouldUseTraktProgressSource
import com.nuvio.app.features.watching.application.WatchingActions
import com.nuvio.app.features.watching.sync.ProgressDeltaEvent
import com.nuvio.app.features.watching.sync.ProgressSyncRecord
import com.nuvio.app.features.watching.sync.ProgressSyncAdapter
import com.nuvio.app.features.watching.sync.SupabaseProgressSyncAdapter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withTimeoutOrNull

private const val WATCH_PROGRESS_METADATA_RESOLUTION_CONCURRENCY = 4
private const val WATCH_PROGRESS_METADATA_RESOLUTION_LIMIT = 64
private const val WATCH_PROGRESS_DELTA_PAGE_SIZE = 900
private const val WATCH_PROGRESS_DELTA_OPERATION_UPSERT = "upsert"
private const val WATCH_PROGRESS_DELTA_OPERATION_DELETE = "delete"

private data class RemoteMetadataResolutionResult(
    val key: Pair<String, String>,
    val entries: List<WatchProgressEntry>,
    val meta: MetaDetails?,
)

private data class MetadataProviderReadiness(
    val providers: List<AddonManifest>,
    val isRefreshing: Boolean,
) {
    val fingerprint: String
        get() = providers.map(AddonManifest::transportUrl).sorted().joinToString(separator = "|")

    val isReady: Boolean
        get() = providers.isNotEmpty() && !isRefreshing

    val isSettledWithoutProviders: Boolean
        get() = !isRefreshing && providers.isEmpty()
}

private data class WatchProgressDeltaApplyResult(
    val appliedUpserts: Int,
    val appliedDeletes: Int,
    val preservedLocalItems: Boolean,
    val changed: Boolean,
)

object WatchProgressRepository {
    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("WatchProgressRepository")

    private val _uiState = MutableStateFlow(WatchProgressUiState())
    val uiState: StateFlow<WatchProgressUiState> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var currentProfileId: Int = 1
    private var profileGeneration: Long = 0L
    private val entriesLock = SynchronizedObject()
    private var entriesByVideoId: MutableMap<String, WatchProgressEntry> = mutableMapOf()
    private var metadataResolutionJob: Job? = null
    private var isPullingNuvioSyncFromServer = false
    private var lastSuccessfulPushEpochMs = 0L
    private var deltaCursorEventId = 0L
    private var deltaInitialized = false
    private var lastAddonMetadataReadyFingerprint: String? = null
    internal var syncAdapter: ProgressSyncAdapter = SupabaseProgressSyncAdapter

    init {
        syncScope.launch {
            TraktAuthRepository.isAuthenticated.collectLatest { authenticated ->
                if (shouldUseTraktProgressSource(
                        isAuthenticated = authenticated,
                        source = TraktSettingsRepository.uiState.value.watchProgressSource,
                    )
                ) {
                    runCatching { TraktProgressRepository.refreshNow() }
                        .onFailure { error ->
                            if (error is CancellationException) throw error
                            log.w { "Failed to refresh Trakt progress after auth: ${error.message}" }
                        }
                }
                publish()
            }
        }

        syncScope.launch {
            TraktSettingsRepository.uiState.collectLatest { settings ->
                if (shouldUseTraktProgressSource(
                        isAuthenticated = TraktAuthRepository.isAuthenticated.value,
                        source = settings.watchProgressSource,
                    )
                ) {
                    runCatching { TraktProgressRepository.refreshNow() }
                        .onFailure { error ->
                            if (error is CancellationException) throw error
                            log.w { "Failed to refresh Trakt progress after source change: ${error.message}" }
                        }
                }
                publish()
            }
        }

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
        if (hasLoaded) return
        loadFromDisk(ProfileRepository.activeProfileId)
        if (shouldUseTraktProgress()) {
            TraktProgressRepository.refreshAsync()
        }
    }

    fun onProfileChanged(profileId: Int) {
        if (profileId == currentProfileId && hasLoaded) return
        TraktSettingsRepository.onProfileChanged()
        loadFromDisk(profileId)
        TraktProgressRepository.onProfileChanged()
        if (shouldUseTraktProgress()) {
            TraktProgressRepository.refreshAsync()
        }
    }

    fun clearLocalState() {
        metadataResolutionJob?.cancel()
        hasLoaded = false
        currentProfileId = 1
        profileGeneration += 1L
        lastAddonMetadataReadyFingerprint = null
        clearLocalEntries()
        lastSuccessfulPushEpochMs = 0L
        deltaCursorEventId = 0L
        deltaInitialized = false
        TraktProgressRepository.clearLocalState()
        TraktSettingsRepository.clearLocalState()
        _uiState.value = WatchProgressUiState()
    }

    private fun loadFromDisk(profileId: Int) {
        metadataResolutionJob?.cancel()
        currentProfileId = profileId
        profileGeneration += 1L
        hasLoaded = true
        lastAddonMetadataReadyFingerprint = null
        clearLocalEntries()

        val payload = WatchProgressStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isNotEmpty()) {
            val storedPayload = WatchProgressCodec.decodePayload(payload)
            lastSuccessfulPushEpochMs = storedPayload.lastSuccessfulPushEpochMs
            deltaCursorEventId = storedPayload.deltaCursorEventId
            deltaInitialized = storedPayload.deltaInitialized
            replaceLocalEntries(storedPayload.entries)
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
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        TraktProgressRepository.ensureLoaded()
        val operationGeneration = activeOperationGeneration(profileId) ?: run {
            log.d { "Skipping watch progress pull for inactive profile $profileId" }
            return
        }

        val useTraktProgress = shouldUseTraktProgress()

        if (!useTraktProgress && isPullingNuvioSyncFromServer) {
            log.d { "Skipping watch progress pull for profile $profileId because a Nuvio sync pull is already running" }
            return
        }
        if (!useTraktProgress) {
            isPullingNuvioSyncFromServer = true
        }

        try {
            if (useTraktProgress) {
                log.d { "Pulling Trakt watch progress for profile $profileId" }
                runCatching { TraktProgressRepository.refreshNow() }
                    .onFailure { e ->
                        if (e is CancellationException) throw e
                        log.e(e) { "Failed to pull Trakt progress" }
                    }
                if (isActiveOperation(profileId, operationGeneration)) {
                    publish()
                }
                return
            }

            runCatching {
                log.d { "Pulling Nuvio watch progress for profile $profileId" }
                pullSupabaseDeltaFromServer(
                    profileId = profileId,
                    pullStartedEpochMs = WatchProgressClock.nowEpochMs(),
                    operationGeneration = operationGeneration,
                )
            }.onFailure { e ->
                if (e is CancellationException) throw e
                log.e(e) { "Failed to pull watch progress from server" }
            }
        } finally {
            if (!useTraktProgress) {
                isPullingNuvioSyncFromServer = false
            }
        }
    }

    suspend fun forceSnapshotRefreshFromServer(profileId: Int) {
        ensureLoaded()
        if (currentProfileId != profileId) {
            loadFromDisk(profileId)
        }

        if (shouldUseTraktProgress()) {
            log.d { "Force refreshing Trakt watch progress for profile $profileId" }
            runCatching { TraktProgressRepository.refreshNow() }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    log.e(error) { "Failed to force refresh Trakt progress" }
                }
            publish()
            return
        }

        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) {
            log.d { "Skipping force watch progress refresh because Nuvio Sync is not authenticated" }
            return
        }

        deltaCursorEventId = 0L
        deltaInitialized = false
        persist()
        pullFromServer(profileId)
    }

    private suspend fun pullSupabaseDeltaFromServer(
        profileId: Int,
        pullStartedEpochMs: Long,
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
                    pullStartedEpochMs = pullStartedEpochMs,
                    resetDeltaState = true,
                    operationGeneration = operationGeneration,
                )
                return
            }

            log.d { "Watch progress delta cursor before snapshot for profile $profileId is $cursorBeforeSnapshot" }
            pullFullFromAdapter(
                profileId = profileId,
                pullStartedEpochMs = pullStartedEpochMs,
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
                    pullStartedEpochMs = pullStartedEpochMs,
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

            val pageResult = applyWatchProgressDeltaEvents(
                events = events,
                pullStartedEpochMs = pullStartedEpochMs,
            )
            changed = pageResult.changed || changed
            totalUpserts += pageResult.appliedUpserts
            totalDeletes += pageResult.appliedDeletes
            preservedLocalItems = preservedLocalItems || pageResult.preservedLocalItems
            cursor = maxOf(cursor, events.maxOf { it.eventId })
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
        if (changed) {
            publish()
            persist()
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
        pullStartedEpochMs: Long,
        resetDeltaState: Boolean,
        operationGeneration: Long,
    ) {
        val serverEntries = syncAdapter.pull(profileId = profileId)
        if (!isActiveOperation(profileId, operationGeneration)) return
        log.d {
            "Watch progress snapshot fetched ${serverEntries.size} entries for profile $profileId " +
                "resetDeltaState=$resetDeltaState"
        }
        replaceLocalEntries(
            mergeWatchProgressEntriesPreservingUnsynced(
            serverEntries = serverEntries,
            localEntries = localEntriesSnapshot(),
            lastSuccessfulPushEpochMs = lastSuccessfulPushEpochMs,
            pullStartedEpochMs = pullStartedEpochMs,
            ),
        )
        if (resetDeltaState) {
            deltaCursorEventId = 0L
            deltaInitialized = false
        }
        hasLoaded = true
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
        pullStartedEpochMs: Long,
    ): WatchProgressDeltaApplyResult {
        var changed = false
        var appliedUpserts = 0
        var appliedDeletes = 0
        var preservedLocalItems = false
        events.forEach { event ->
            if (event.videoId.isBlank()) return@forEach
            when (event.operation.lowercase()) {
                WATCH_PROGRESS_DELTA_OPERATION_UPSERT -> {
                    val current = localEntry(event.videoId)
                    val updated = event.toProgressSyncRecord().toWatchProgressEntry(cached = current)
                    if (current != updated) {
                        upsertLocalEntry(updated)
                        changed = true
                        appliedUpserts += 1
                    }
                }
                WATCH_PROGRESS_DELTA_OPERATION_DELETE -> {
                    val localEntry = localEntry(event.videoId)
                    if (
                        localEntry != null &&
                        shouldPreserveLocalWatchProgressEntry(
                            localEntry = localEntry,
                            lastSuccessfulPushEpochMs = lastSuccessfulPushEpochMs,
                            pullStartedEpochMs = pullStartedEpochMs,
                        )
                    ) {
                        preservedLocalItems = true
                        return@forEach
                    }
                    if (removeLocalEntry(event.videoId) != null) {
                        changed = true
                        appliedDeletes += 1
                    }
                }
            }
        }
        return WatchProgressDeltaApplyResult(
            appliedUpserts = appliedUpserts,
            appliedDeletes = appliedDeletes,
            preservedLocalItems = preservedLocalItems,
            changed = changed,
        )
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
        )

    private fun ProgressDeltaEvent.toProgressSyncRecord(): ProgressSyncRecord =
        ProgressSyncRecord(
            contentId = contentId,
            contentType = contentType,
            videoId = videoId,
            season = season,
            episode = episode,
            position = position,
            duration = duration,
            lastWatched = lastWatched,
        )

    private fun mergeWatchProgressEntriesPreservingUnsynced(
        serverEntries: Collection<ProgressSyncRecord>,
        localEntries: Collection<WatchProgressEntry>,
        lastSuccessfulPushEpochMs: Long,
        pullStartedEpochMs: Long,
    ): Map<String, WatchProgressEntry> {
        val localByVideoId = localEntries.associateBy { entry -> entry.videoId }
        val merged = serverEntries.associate { record ->
            record.videoId to record.toWatchProgressEntry(cached = localByVideoId[record.videoId])
        }.toMutableMap()

        localByVideoId.forEach { (videoId, localEntry) ->
            val remoteEntry = merged[videoId]
            val shouldPreserve = shouldPreserveLocalWatchProgressEntry(
                localEntry = localEntry,
                lastSuccessfulPushEpochMs = lastSuccessfulPushEpochMs,
                pullStartedEpochMs = pullStartedEpochMs,
            )
            if (!shouldPreserve) return@forEach
            if (remoteEntry == null || localEntry.lastUpdatedEpochMs > remoteEntry.lastUpdatedEpochMs) {
                merged[videoId] = localEntry
            }
        }

        return merged
    }

    private fun shouldPreserveLocalWatchProgressEntry(
        localEntry: WatchProgressEntry,
        lastSuccessfulPushEpochMs: Long,
        pullStartedEpochMs: Long,
    ): Boolean {
        val updatedAt = localEntry.lastUpdatedEpochMs
        val wasUpdatedAfterLastPush = lastSuccessfulPushEpochMs > 0L && updatedAt > lastSuccessfulPushEpochMs
        val wasUpdatedDuringPull = pullStartedEpochMs > 0L && updatedAt >= pullStartedEpochMs
        return wasUpdatedAfterLastPush || wasUpdatedDuringPull
    }

    private fun retryMetadataResolutionWhenAddonMetaProvidersReady(state: AddonsUiState) {
        if (!hasLoaded || shouldUseTraktProgress()) return

        val readiness = state.metadataProviderReadiness()
        if (!readiness.isReady) return

        val fingerprint = readiness.fingerprint
        if (fingerprint == lastAddonMetadataReadyFingerprint) return
        lastAddonMetadataReadyFingerprint = fingerprint

        if (metadataResolutionJob?.isActive == true) return
        resolveRemoteMetadata()
    }

    private fun resolveRemoteMetadata() {
        val targetProfileId = currentProfileId
        val targetGeneration = profileGeneration
        val missingMetadataEntries = localEntriesSnapshot()
            .filter { it.poster.isNullOrBlank() || it.background.isNullOrBlank() }
        val entriesToResolve = missingMetadataEntries.continueWatchingEntries(
            limit = WATCH_PROGRESS_METADATA_RESOLUTION_LIMIT,
        )
        val needsResolution = entriesToResolve
            .groupBy { it.parentMetaId to it.contentType }

        if (needsResolution.isEmpty()) return

        metadataResolutionJob?.cancel()
        metadataResolutionJob = syncScope.launch {
            val providerReadiness = awaitReadyMetadataProviders() ?: return@launch
            if (!isActiveOperation(targetProfileId, targetGeneration)) return@launch
            lastAddonMetadataReadyFingerprint = providerReadiness.fingerprint

            val supportedNeedsResolution = needsResolution.filter { (key, _) ->
                val (metaId, metaType) = key
                providerReadiness.providers.any { provider ->
                    provider.supportsMetaRequest(type = metaType, id = metaId)
                }
            }
            if (supportedNeedsResolution.isEmpty()) return@launch

            var resolvedEntries = 0
            val semaphore = Semaphore(WATCH_PROGRESS_METADATA_RESOLUTION_CONCURRENCY)
            val resolutionResults = coroutineScope {
                supportedNeedsResolution.map { (key, entries) ->
                    async {
                        semaphore.withPermit {
                            fetchRemoteMetadataGroup(key = key, entries = entries)
                        }
                    }
                }.awaitAll()
            }

            for (result in resolutionResults) {
                ensureActive()
                if (!isActiveOperation(targetProfileId, targetGeneration)) return@launch
                val meta = result.meta
                if (meta == null) {
                    continue
                }

                var appliedEntries = 0
                for (entry in result.entries) {
                    val current = localEntry(entry.videoId) ?: continue
                    val episodeVideo = if (current.seasonNumber != null && current.episodeNumber != null) {
                        meta.videos.find { v ->
                            v.season == current.seasonNumber && v.episode == current.episodeNumber
                        }
                    } else null

                    upsertLocalEntry(
                        current.copy(
                            title = meta.name,
                            poster = meta.poster,
                            background = meta.background,
                            logo = meta.logo,
                            episodeTitle = episodeVideo?.title ?: current.episodeTitle,
                            episodeThumbnail = episodeVideo?.thumbnail ?: current.episodeThumbnail,
                            pauseDescription = episodeVideo?.overview
                                ?: meta.description
                                ?: current.pauseDescription,
                        ),
                    )
                    appliedEntries += 1
                }
                if (appliedEntries == 0) {
                    continue
                }

                resolvedEntries += appliedEntries
            }
            if (resolvedEntries > 0) {
                if (isActiveOperation(targetProfileId, targetGeneration)) {
                    publish()
                    persist()
                }
            }
        }
    }

    private suspend fun fetchRemoteMetadataGroup(
        key: Pair<String, String>,
        entries: List<WatchProgressEntry>,
    ): RemoteMetadataResolutionResult {
        val (metaId, metaType) = key
        val meta = try {
            MetaDetailsRepository.fetch(metaType, metaId)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            null
        }
        return RemoteMetadataResolutionResult(
            key = key,
            entries = entries,
            meta = meta,
        )
    }

    private suspend fun awaitReadyMetadataProviders(): MetadataProviderReadiness? {
        val current = AddonRepository.uiState.value.metadataProviderReadiness()
        if (current.isReady) return current
        if (current.isSettledWithoutProviders) return null

        val settled = withTimeoutOrNull(30_000L) {
            AddonRepository.uiState.first { state ->
                val readiness = state.metadataProviderReadiness()
                readiness.isReady || readiness.isSettledWithoutProviders
            }.metadataProviderReadiness()
        }
        return settled?.takeIf { it.isReady }
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

    fun clearProgress(videoId: String) {
        clearProgress(listOf(videoId))
    }

    fun clearProgress(videoIds: Collection<String>) {
        ensureLoaded()
        if (videoIds.isEmpty()) return

        val useTraktProgress = shouldUseTraktProgress()
        if (useTraktProgress) {
            val entriesToRemove = currentEntries().filter { entry -> entry.videoId in videoIds }
            val locallyRemovedEntries = removeStoredLocalEntries(entriesToRemove)
            videoIds.forEach(TraktProgressRepository::applyOptimisticRemoval)
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

        val removedEntries = videoIds.mapNotNull { videoId ->
            removeLocalEntry(videoId)
        }
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
            removeLocalEntry(entry.videoId)
        }
        publish()
        persist()
        pushDeleteToServer(entriesToRemove)
    }

    fun progressForVideo(videoId: String): WatchProgressEntry? {
        ensureLoaded()
        return if (shouldUseTraktProgress()) {
            TraktProgressRepository.uiState.value.entries
        } else {
            localEntriesSnapshot()
        }.firstOrNull { it.videoId == videoId }
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

        val entry = WatchProgressEntry(
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
            if (persist) {
                upsertStoredProfileProgress(profileId = targetProfileId, entry = entry)
            }
            if (syncRemote) {
                pushScrobbleToServer(entry = entry, profileId = targetProfileId)
            }
            return
        }

        if (entry.parentMetaType.equals("series", ignoreCase = true)) {
            ContinueWatchingPreferencesRepository.removeDismissedNextUpKeysForContent(entry.parentMetaId)
        }

        upsertLocalEntry(entry)
        if (useTraktProgress) {
            TraktProgressRepository.applyOptimisticProgress(entry)
        }
        publish()
        if (persist) persist()
        if (entry.poster.isNullOrBlank() || entry.background.isNullOrBlank()) {
            resolveRemoteMetadata()
        }
        if (syncRemote) {
            pushScrobbleToServer(entry = entry, profileId = targetProfileId)
        }
        if (shouldCascadeCompletedProgressToWatchedHistory(entry, useTraktProgress)) {
            WatchingActions.onProgressEntryUpdated(entry, syncRemote = syncRemote)
        }
    }

    private fun upsertStoredProfileProgress(profileId: Int, entry: WatchProgressEntry) {
        val payload = WatchProgressStorage.loadPayload(profileId).orEmpty().trim()
        val storedPayload = if (payload.isNotEmpty()) {
            WatchProgressCodec.decodePayload(payload)
        } else {
            StoredWatchProgressPayload()
        }
        val updatedEntries = storedPayload.entries
            .filterNot { it.videoId == entry.videoId } + entry
        WatchProgressStorage.savePayload(
            profileId,
            WatchProgressCodec.encodePayload(
                entries = updatedEntries,
                lastSuccessfulPushEpochMs = storedPayload.lastSuccessfulPushEpochMs,
                deltaCursorEventId = storedPayload.deltaCursorEventId,
                deltaInitialized = storedPayload.deltaInitialized,
            ),
        )
    }

    private fun pushScrobbleToServer(entry: WatchProgressEntry, profileId: Int) {
        syncScope.launch {
            runCatching {
                syncAdapter.push(profileId = profileId, entries = listOf(entry))
                recordSuccessfulPush(profileId = profileId, entries = listOf(entry))
            }.onFailure { e ->
                log.e(e) { "Failed to push watch progress scrobble" }
            }
        }
    }

    private fun pushDeleteToServer(entries: Collection<WatchProgressEntry>) {
        if (shouldUseTraktProgress()) return
        val profileId = currentProfileId
        syncScope.launch {
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
            hasLoaded
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
            ),
        )
    }

    private fun recordSuccessfulPush(profileId: Int, entries: Collection<WatchProgressEntry>) {
        if (profileId != currentProfileId) return
        val latestPushed = entries
            .asSequence()
            .map { entry -> entry.lastUpdatedEpochMs }
            .maxOrNull()
            ?: return
        if (latestPushed <= lastSuccessfulPushEpochMs) return
        lastSuccessfulPushEpochMs = latestPushed
        persist()
    }

    private fun shouldUseTraktProgress(): Boolean =
        shouldUseTraktProgressSource(
            isAuthenticated = TraktAuthRepository.isAuthenticated.value,
            source = TraktSettingsRepository.uiState.value.watchProgressSource,
        )

    private fun WatchProgressEntry.shouldAttemptTraktPlaybackDelete(): Boolean =
        isTraktCompatibleId(parentMetaId)

    private fun removeStoredLocalEntries(entries: Collection<WatchProgressEntry>): List<WatchProgressEntry> =
        synchronized(entriesLock) {
            entries.mapNotNull { entry ->
                entriesByVideoId.remove(entry.videoId)
            }
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
                val traktKeys = traktItems.map { it.videoId }.toSet()
                val merged = traktItems.toMutableList()
                localNonTraktItems.forEach { localItem ->
                    if (localItem.videoId !in traktKeys) {
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
            entriesByVideoId.values.toList()
        }

    private fun localEntry(videoId: String): WatchProgressEntry? =
        synchronized(entriesLock) {
            entriesByVideoId[videoId]
        }

    private fun localEntryCount(): Int =
        synchronized(entriesLock) {
            entriesByVideoId.size
        }

    private fun clearLocalEntries() {
        synchronized(entriesLock) {
            entriesByVideoId.clear()
        }
    }

    private fun replaceLocalEntries(entries: Collection<WatchProgressEntry>) {
        synchronized(entriesLock) {
            entriesByVideoId = entries
                .associateBy { it.videoId }
                .toMutableMap()
        }
    }

    private fun replaceLocalEntries(entries: Map<String, WatchProgressEntry>) {
        synchronized(entriesLock) {
            entriesByVideoId = entries.toMutableMap()
        }
    }

    private fun upsertLocalEntry(entry: WatchProgressEntry) {
        synchronized(entriesLock) {
            entriesByVideoId[entry.videoId] = entry
        }
    }

    private fun removeLocalEntry(videoId: String): WatchProgressEntry? =
        synchronized(entriesLock) {
            entriesByVideoId.remove(videoId)
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
            isRefreshing = enabled.any { addon -> addon.isRefreshing },
        )
    }

    private fun AddonManifest.hasMetaResource(): Boolean =
        resources.any { resource -> resource.name == "meta" }

    private fun AddonManifest.supportsMetaRequest(type: String, id: String): Boolean =
        resources.any { resource ->
            resource.name == "meta" &&
                resource.types.contains(type) &&
                (resource.idPrefixes.isEmpty() || resource.idPrefixes.any { prefix -> id.startsWith(prefix) })
        }
}
