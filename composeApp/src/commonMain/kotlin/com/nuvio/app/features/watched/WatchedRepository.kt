package com.nuvio.app.features.watched

import co.touchlab.kermit.Logger
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.WatchProgressSource
import com.nuvio.app.features.trakt.shouldUseTraktProgress
import com.nuvio.app.features.watching.sync.SupabaseWatchedSyncAdapter
import com.nuvio.app.features.watching.sync.TraktWatchedSyncAdapter
import com.nuvio.app.features.watching.sync.WatchedDeltaEvent
import com.nuvio.app.features.watching.sync.WatchedSyncAdapter
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
private data class StoredWatchedPayload(
    val items: List<WatchedItem> = emptyList(),
    val fullyWatchedSeriesKeys: Set<String> = emptySet(),
    val lastSuccessfulPushEpochMs: Long = 0L,
    val deltaCursorEventId: Long = 0L,
    val deltaInitialized: Boolean = false,
)

internal enum class WatchedTraktHistorySync {
    Mirror,
    Skip,
}

internal fun shouldMirrorWatchedMarkToTraktHistory(
    sync: WatchedTraktHistorySync,
    isTraktAuthenticated: Boolean,
): Boolean = sync == WatchedTraktHistorySync.Mirror && isTraktAuthenticated

internal data class WatchedSourceOperation(
    val source: WatchProgressSource,
    val generation: Long,
)

internal fun isWatchedSourceOperationCurrent(
    operation: WatchedSourceOperation,
    activeSource: WatchProgressSource,
    activeGeneration: Long,
): Boolean = operation.source == activeSource && operation.generation == activeGeneration

internal fun watchedItemsForSource(
    source: WatchProgressSource,
    nuvioItems: Collection<WatchedItem>,
    traktItems: Collection<WatchedItem>,
): Collection<WatchedItem> = when (source) {
    WatchProgressSource.NUVIO_SYNC -> nuvioItems
    WatchProgressSource.TRAKT -> traktItems
}

internal fun shouldPersistWatchedSource(source: WatchProgressSource): Boolean =
    source == WatchProgressSource.NUVIO_SYNC

internal fun replaceWatchedItemsForSource(
    source: WatchProgressSource,
    nuvioItems: MutableMap<String, WatchedItem>,
    traktItems: MutableMap<String, WatchedItem>,
    replacement: Map<String, WatchedItem>,
) {
    val target = when (source) {
        WatchProgressSource.NUVIO_SYNC -> nuvioItems
        WatchProgressSource.TRAKT -> traktItems
    }
    target.clear()
    target.putAll(replacement)
}

object WatchedRepository {
    private data class WatchedRefreshOperation(
        val profileId: Int,
        val profileGeneration: Long,
        val sourceOperation: WatchedSourceOperation,
    )

    private const val watchedItemsPageSize = 900
    private const val watchedItemsDeltaPageSize = 900
    private const val watchedDeltaOperationUpsert = "upsert"
    private const val watchedDeltaOperationDelete = "delete"

    private val accountScopeLock = SynchronizedObject()
    private var accountScopeJob: Job = SupervisorJob()
    private var accountScope = CoroutineScope(accountScopeJob + Dispatchers.Default)
    private val log = Logger.withTag("WatchedRepository")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(WatchedUiState())
    val uiState: StateFlow<WatchedUiState> = _uiState.asStateFlow()
    private val _fullyWatchedSeriesKeys = MutableStateFlow<Set<String>>(emptySet())
    val fullyWatchedSeriesKeys: StateFlow<Set<String>> = _fullyWatchedSeriesKeys.asStateFlow()

    private var hasLoaded = false
    private var currentProfileId: Int = 1
    private var profileGeneration: Long = 0L
    private var activeSource: WatchProgressSource = WatchProgressSource.NUVIO_SYNC
    private var sourceGeneration: Long = 0L
    private var nuvioItemsByKey: MutableMap<String, WatchedItem> = mutableMapOf()
    private var traktItemsByKey: MutableMap<String, WatchedItem> = mutableMapOf()
    private var nuvioFullyWatchedSeriesKeys: Set<String> = emptySet()
    private var traktFullyWatchedSeriesKeys: Set<String> = emptySet()
    private var nuvioHasLoaded: Boolean = false
    private var traktHasLoaded: Boolean = false
    private var lastSuccessfulPushEpochMs: Long = 0L
    private var deltaCursorEventId: Long = 0L
    private var deltaInitialized: Boolean = false
    internal var syncAdapter: WatchedSyncAdapter = SupabaseWatchedSyncAdapter
    internal var traktSyncAdapter: WatchedSyncAdapter = TraktWatchedSyncAdapter

    fun ensureLoaded() {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        if (!hasLoaded) {
            loadFromDisk(ProfileRepository.activeProfileId)
            activateEffectiveSource(
                effectiveWatchedSource(
                    requestedSource = TraktSettingsRepository.uiState.value.watchProgressSource,
                    isTraktAuthenticated = TraktAuthRepository.isAuthenticated.value,
                ),
            )
        }
    }

    fun onProfileChanged(profileId: Int) {
        if (profileId == currentProfileId && hasLoaded) return
        loadFromDisk(profileId)
    }

    fun clearLocalState() {
        val previousAccountJob = synchronized(accountScopeLock) {
            accountScopeJob.also {
                accountScopeJob = SupervisorJob()
                accountScope = CoroutineScope(accountScopeJob + Dispatchers.Default)
            }
        }
        previousAccountJob.cancel()
        hasLoaded = false
        currentProfileId = 1
        profileGeneration += 1L
        activeSource = WatchProgressSource.NUVIO_SYNC
        sourceGeneration += 1L
        nuvioItemsByKey.clear()
        traktItemsByKey.clear()
        nuvioFullyWatchedSeriesKeys = emptySet()
        traktFullyWatchedSeriesKeys = emptySet()
        nuvioHasLoaded = false
        traktHasLoaded = false
        lastSuccessfulPushEpochMs = 0L
        deltaCursorEventId = 0L
        deltaInitialized = false
        _fullyWatchedSeriesKeys.value = emptySet()
        _uiState.value = WatchedUiState()
    }

    private fun loadFromDisk(profileId: Int) {
        currentProfileId = profileId
        profileGeneration += 1L
        activeSource = WatchProgressSource.NUVIO_SYNC
        sourceGeneration += 1L
        hasLoaded = true
        nuvioItemsByKey.clear()
        traktItemsByKey.clear()
        nuvioFullyWatchedSeriesKeys = emptySet()
        traktFullyWatchedSeriesKeys = emptySet()
        nuvioHasLoaded = true
        traktHasLoaded = false

        val payload = WatchedStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isNotEmpty()) {
            val storedPayload = runCatching {
                json.decodeFromString<StoredWatchedPayload>(payload)
            }.getOrDefault(StoredWatchedPayload())
            lastSuccessfulPushEpochMs = storedPayload.lastSuccessfulPushEpochMs
            deltaCursorEventId = storedPayload.deltaCursorEventId
            deltaInitialized = storedPayload.deltaInitialized
            nuvioItemsByKey = storedPayload.items
                .map(WatchedItem::normalizedMarkedAt)
                .associateBy { watchedItemKey(it.type, it.id, it.season, it.episode) }
                .toMutableMap()
            nuvioFullyWatchedSeriesKeys = storedPayload.fullyWatchedSeriesKeys
        } else {
            lastSuccessfulPushEpochMs = 0L
            deltaCursorEventId = 0L
            deltaInitialized = false
            nuvioFullyWatchedSeriesKeys = emptySet()
        }

        publish()
    }

    internal fun activateSource(source: WatchProgressSource): WatchProgressSource {
        if (!hasLoaded) {
            loadFromDisk(ProfileRepository.activeProfileId)
        }
        return activateEffectiveSource(source)
    }

    private fun activateEffectiveSource(source: WatchProgressSource): WatchProgressSource {
        if (activeSource == source) return source
        if (source == WatchProgressSource.TRAKT) {
            traktItemsByKey.clear()
            traktFullyWatchedSeriesKeys = emptySet()
            traktHasLoaded = false
        }
        activeSource = source
        sourceGeneration += 1L
        publish()
        return source
    }

    private fun newRefreshOperation(profileId: Int): WatchedRefreshOperation? {
        if (ProfileRepository.activeProfileId != profileId) return null
        if (!hasLoaded || currentProfileId != profileId) return null
        return WatchedRefreshOperation(
            profileId = profileId,
            profileGeneration = profileGeneration,
            sourceOperation = WatchedSourceOperation(
                source = activeSource,
                generation = sourceGeneration,
            ),
        )
    }

    private fun isActiveOperation(operation: WatchedRefreshOperation): Boolean =
        currentProfileId == operation.profileId &&
            profileGeneration == operation.profileGeneration &&
            ProfileRepository.activeProfileId == operation.profileId &&
            isWatchedSourceOperationCurrent(
                operation = operation.sourceOperation,
                activeSource = activeSource,
                activeGeneration = sourceGeneration,
            )

    suspend fun pullFromServer(profileId: Int) {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        refreshForSource(
            profileId = profileId,
            source = effectiveWatchedSource(
                requestedSource = TraktSettingsRepository.uiState.value.watchProgressSource,
                isTraktAuthenticated = TraktAuthRepository.isAuthenticated.value,
            ),
            forceSnapshot = false,
        )
    }

    suspend fun forceSnapshotRefreshFromServer(profileId: Int) {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        refreshForSource(
            profileId = profileId,
            source = effectiveWatchedSource(
                requestedSource = TraktSettingsRepository.uiState.value.watchProgressSource,
                isTraktAuthenticated = TraktAuthRepository.isAuthenticated.value,
            ),
            forceSnapshot = true,
        )
    }

    internal suspend fun refreshForSource(
        profileId: Int,
        source: WatchProgressSource,
        forceSnapshot: Boolean = true,
    ): Boolean {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        if (ProfileRepository.activeProfileId != profileId) {
            log.d { "Skipping watched refresh for inactive profile $profileId" }
            return false
        }
        if (!hasLoaded || currentProfileId != profileId) {
            loadFromDisk(profileId)
        }

        val effectiveSource = activateEffectiveSource(source)
        val operation = newRefreshOperation(profileId) ?: return false
        val pullStartedEpochMs = WatchedClock.nowEpochMs()
        return try {
            if (effectiveSource == WatchProgressSource.TRAKT) {
                pullSnapshotFromAdapter(
                    adapter = traktSyncAdapter,
                    operation = operation,
                    profileId = profileId,
                    lastPushEpochMs = 0L,
                    pullStartedEpochMs = pullStartedEpochMs,
                    resetDeltaState = true,
                )
            } else if (forceSnapshot) {
                refreshNuvioSnapshot(
                    operation = operation,
                    profileId = profileId,
                    pullStartedEpochMs = pullStartedEpochMs,
                )
            } else {
                pullSupabaseDeltaFromServer(
                    operation = operation,
                    profileId = profileId,
                    pullStartedEpochMs = pullStartedEpochMs,
                )
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.e(error) { "Failed to refresh watched items from $effectiveSource" }
            false
        }
    }

    private suspend fun refreshNuvioSnapshot(
        operation: WatchedRefreshOperation,
        profileId: Int,
        pullStartedEpochMs: Long,
    ): Boolean {
        val cursorBeforeSnapshot = try {
            syncAdapter.getDeltaCursor(profileId)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            null
        }
        if (!isActiveOperation(operation)) return false

        val applied = pullSnapshotFromAdapter(
            adapter = syncAdapter,
            operation = operation,
            profileId = profileId,
            lastPushEpochMs = lastSuccessfulPushEpochMs,
            pullStartedEpochMs = pullStartedEpochMs,
            resetDeltaState = cursorBeforeSnapshot == null,
        )
        if (!applied || !isActiveOperation(operation)) return false
        if (cursorBeforeSnapshot != null) {
            deltaCursorEventId = cursorBeforeSnapshot
            deltaInitialized = true
            persistNuvio()
        }
        return true
    }

    private suspend fun pullSnapshotFromAdapter(
        adapter: WatchedSyncAdapter,
        operation: WatchedRefreshOperation,
        profileId: Int,
        lastPushEpochMs: Long,
        pullStartedEpochMs: Long,
        resetDeltaState: Boolean,
    ): Boolean {
        val serverItems = adapter.pull(
            profileId = profileId,
            pageSize = watchedItemsPageSize,
        )
        if (!isActiveOperation(operation)) return false
        val localAtApply = itemsForSource(operation.sourceOperation.source).values.toList()

        val mergedItems = mergeWatchedItemsPreservingUnsynced(
            serverItems = serverItems,
            localItems = localAtApply,
            lastSuccessfulPushEpochMs = lastPushEpochMs,
            pullStartedEpochMs = pullStartedEpochMs,
            preserveWhenNoSuccessfulPush = operation.sourceOperation.source == WatchProgressSource.NUVIO_SYNC,
        ).toMutableMap()
        replaceWatchedItemsForSource(
            source = operation.sourceOperation.source,
            nuvioItems = nuvioItemsByKey,
            traktItems = traktItemsByKey,
            replacement = mergedItems,
        )
        when (operation.sourceOperation.source) {
            WatchProgressSource.NUVIO_SYNC -> {
                nuvioHasLoaded = true
                if (resetDeltaState) {
                    deltaCursorEventId = 0L
                    deltaInitialized = false
                }
            }
            WatchProgressSource.TRAKT -> {
                traktHasLoaded = true
            }
        }
        publish()
        if (shouldPersistWatchedSource(operation.sourceOperation.source)) {
            persistNuvio()
        }
        return true
    }

    private suspend fun pullSupabaseDeltaFromServer(
        operation: WatchedRefreshOperation,
        profileId: Int,
        pullStartedEpochMs: Long,
    ): Boolean {
        if (!isActiveOperation(operation)) return false
        if (!deltaInitialized) {
            val cursorBeforeSnapshot = syncAdapter.getDeltaCursor(profileId) ?: return false
            if (!isActiveOperation(operation)) return false
            val applied = pullSnapshotFromAdapter(
                adapter = syncAdapter,
                operation = operation,
                profileId = profileId,
                lastPushEpochMs = lastSuccessfulPushEpochMs,
                pullStartedEpochMs = pullStartedEpochMs,
                resetDeltaState = false,
            )
            if (!applied || !isActiveOperation(operation)) return false
            deltaCursorEventId = cursorBeforeSnapshot
            deltaInitialized = true
            persistNuvio()
            return true
        }

        var cursor = deltaCursorEventId
        var changed = false

        while (true) {
            val events = syncAdapter.pullDelta(
                profileId = profileId,
                sinceEventId = cursor,
                limit = watchedItemsDeltaPageSize,
            )
            if (!isActiveOperation(operation)) return false
            if (events.isEmpty()) break

            applyWatchedDeltaEvents(
                targetItems = nuvioItemsByKey,
                events = events,
                pullStartedEpochMs = pullStartedEpochMs,
            )
            cursor = maxOf(cursor, events.maxOf { it.eventId })
            deltaCursorEventId = cursor
            deltaInitialized = true
            changed = true

            if (events.size < watchedItemsDeltaPageSize) break
        }

        if (!isActiveOperation(operation)) return false
        nuvioHasLoaded = true
        if (changed) {
            publish()
            persistNuvio()
        }
        return true
    }

    private fun applyWatchedDeltaEvents(
        targetItems: MutableMap<String, WatchedItem>,
        events: Collection<WatchedDeltaEvent>,
        pullStartedEpochMs: Long,
    ) {
        var upsertCount = 0
        var deleteCount = 0
        var removedCount = 0
        var removedByFallbackKeyCount = 0
        var preservedDuringPullCount = 0
        var ignoredCount = 0

        events.forEach { event ->
            val key = watchedItemKey(event.contentType, event.contentId, event.season, event.episode)
            when (event.operation.lowercase()) {
                watchedDeltaOperationUpsert -> {
                    upsertCount += 1
                    targetItems[key] = WatchedItem(
                        id = event.contentId,
                        type = event.contentType,
                        name = event.title,
                        season = event.season,
                        episode = event.episode,
                        markedAtEpochMs = normalizeWatchedMarkedAtEpochMs(event.watchedAt),
                    )
                }
                watchedDeltaOperationDelete -> {
                    deleteCount += 1
                    val localItem = targetItems[key]
                    if (localItem != null && wasWatchedItemMarkedDuringPull(localItem, pullStartedEpochMs)) {
                        preservedDuringPullCount += 1
                        return@forEach
                    }
                    val removedItem = targetItems.remove(key)
                    if (removedItem != null) {
                        removedCount += 1
                    } else if (
                        removeWatchedItemByStableDeleteKey(
                            targetItems = targetItems,
                            contentId = event.contentId,
                            contentType = event.contentType,
                            season = event.season,
                            episode = event.episode,
                        )
                    ) {
                        removedCount += 1
                        removedByFallbackKeyCount += 1
                    }
                }
                else -> {
                    ignoredCount += 1
                }
            }
        }

        log.i {
            "Applied watched delta events total=${events.size} upserts=$upsertCount deletes=$deleteCount " +
                "removed=$removedCount removedByFallbackKey=$removedByFallbackKeyCount " +
                "preservedDuringPull=$preservedDuringPullCount ignored=$ignoredCount"
        }
    }

    private fun removeWatchedItemByStableDeleteKey(
        targetItems: MutableMap<String, WatchedItem>,
        contentId: String,
        contentType: String,
        season: Int?,
        episode: Int?,
    ): Boolean {
        val fallbackKey = targetItems.entries.firstOrNull { (_, item) ->
            item.id == contentId &&
                watchedDeleteTypesCompatible(remoteType = contentType, localType = item.type) &&
                item.season == season &&
                item.episode == episode
        }?.key ?: return false

        targetItems.remove(fallbackKey)
        log.w {
            "Removed watched delta delete with fallback key contentId=$contentId contentType=$contentType " +
                "season=$season episode=$episode matchedKey=$fallbackKey"
        }
        return true
    }

    private fun watchedDeleteTypesCompatible(remoteType: String, localType: String): Boolean {
        if (remoteType.equals(localType, ignoreCase = true)) return true
        return remoteType.isSeriesLikeWatchedType() && localType.isSeriesLikeWatchedType()
    }

    private fun itemsForSource(source: WatchProgressSource): MutableMap<String, WatchedItem> =
        when (source) {
            WatchProgressSource.NUVIO_SYNC -> nuvioItemsByKey
            WatchProgressSource.TRAKT -> traktItemsByKey
        }

    private fun fullyWatchedSeriesKeysForSource(source: WatchProgressSource): Set<String> =
        when (source) {
            WatchProgressSource.NUVIO_SYNC -> nuvioFullyWatchedSeriesKeys
            WatchProgressSource.TRAKT -> traktFullyWatchedSeriesKeys
        }

    private fun setFullyWatchedSeriesKeysForSource(
        source: WatchProgressSource,
        keys: Set<String>,
    ) {
        when (source) {
            WatchProgressSource.NUVIO_SYNC -> nuvioFullyWatchedSeriesKeys = keys
            WatchProgressSource.TRAKT -> traktFullyWatchedSeriesKeys = keys
        }
    }

    private fun hasLoadedSource(source: WatchProgressSource): Boolean =
        when (source) {
            WatchProgressSource.NUVIO_SYNC -> nuvioHasLoaded
            WatchProgressSource.TRAKT -> traktHasLoaded
        }

    fun toggleWatched(item: WatchedItem) {
        ensureLoaded()
        val source = activeSource
        val targetItems = itemsForSource(source)
        val key = watchedItemKey(item.type, item.id, item.season, item.episode)
        if (targetItems.containsKey(key)) {
            unmarkWatched(item)
        } else {
            markWatched(item)
        }
    }

    fun markWatched(item: WatchedItem) {
        markWatched(listOf(item))
    }

    fun markWatched(items: Collection<WatchedItem>) {
        markWatched(items = items, traktHistorySync = WatchedTraktHistorySync.Mirror)
    }

    internal fun markWatchedFromPlaybackCompletion(item: WatchedItem, syncRemote: Boolean = true) {
        markWatched(items = listOf(item), traktHistorySync = WatchedTraktHistorySync.Skip, syncRemote = syncRemote)
    }

    private fun markWatched(
        items: Collection<WatchedItem>,
        traktHistorySync: WatchedTraktHistorySync,
        syncRemote: Boolean = true,
    ) {
        ensureLoaded()
        if (items.isEmpty()) return
        val source = activeSource
        val targetItems = itemsForSource(source)
        val markedAt = WatchedClock.nowEpochMs()
        val timestampedItems = items.map { watchedItem ->
            watchedItem.copy(markedAtEpochMs = markedAt)
        }
        timestampedItems.forEach { watchedItem ->
            val key = watchedItemKey(watchedItem.type, watchedItem.id, watchedItem.season, watchedItem.episode)
            targetItems[key] = watchedItem
        }
        publish()
        if (shouldPersistWatchedSource(source)) {
            persistNuvio()
        }
        if (syncRemote) {
            pushMarksToServer(
                items = timestampedItems,
                traktHistorySync = traktHistorySync,
                source = source,
            )
        }
    }

    fun unmarkWatched(item: WatchedItem) {
        unmarkWatched(listOf(item))
    }

    fun unmarkWatched(
        id: String,
        type: String,
        season: Int? = null,
        episode: Int? = null,
    ) {
        unmarkWatched(
            listOf(
                WatchedItem(
                    id = id,
                    type = type,
                    name = "",
                    season = season,
                    episode = episode,
                    markedAtEpochMs = 0L,
                ),
            ),
        )
    }

    fun unmarkWatched(items: Collection<WatchedItem>) {
        ensureLoaded()
        if (items.isEmpty()) return
        val source = activeSource
        val targetItems = itemsForSource(source)
        val removedItems = items.mapNotNull { watchedItem ->
            targetItems.remove(watchedItemKey(watchedItem.type, watchedItem.id, watchedItem.season, watchedItem.episode))
        }
        if (removedItems.isNotEmpty()) {
            publish()
            if (shouldPersistWatchedSource(source)) {
                persistNuvio()
            }
            pushDeleteToServer(items = removedItems, source = source)
        }
    }

    fun isWatched(
        id: String,
        type: String,
        season: Int? = null,
        episode: Int? = null,
    ): Boolean {
        ensureLoaded()
        return itemsForSource(activeSource).containsKey(watchedItemKey(type, id, season, episode))
    }

    fun reconcileSeriesWatchedState(
        meta: MetaDetails,
        todayIsoDate: String,
        isEpisodeCompleted: (com.nuvio.app.features.details.MetaVideo) -> Boolean = { false },
    ) {
        if (!meta.type.isSeriesLikeWatchedType()) return

        ensureLoaded()
        val shouldMarkSeriesWatched = reconcileFullyWatchedSeriesState(
            meta = meta,
            todayIsoDate = todayIsoDate,
            isEpisodeCompleted = isEpisodeCompleted,
        )
        val seriesWatchedItem = meta.toSeriesWatchedItem()
        val hasSeriesWatchedMarker = isWatched(id = meta.id, type = meta.type)
        if (shouldMarkSeriesWatched) {
            if (!hasSeriesWatchedMarker) {
                markWatched(seriesWatchedItem)
            }
        } else if (hasSeriesWatchedMarker) {
            unmarkWatched(seriesWatchedItem)
        }
    }

    fun reconcileFullyWatchedSeriesState(
        meta: MetaDetails,
        todayIsoDate: String,
        isEpisodeWatched: (MetaVideo) -> Boolean = { episode ->
            isWatched(
                id = meta.id,
                type = meta.type,
                season = episode.season,
                episode = episode.episode,
            )
        },
        isEpisodeCompleted: (MetaVideo) -> Boolean = { false },
    ): Boolean {
        if (!meta.type.isSeriesLikeWatchedType()) return false

        ensureLoaded()
        val shouldMarkSeriesWatched = meta.hasWatchedAllMainSeasonEpisodes(todayIsoDate) { episode ->
            isEpisodeWatched(episode) || isEpisodeCompleted(episode)
        }
        updateFullyWatchedSeriesKey(
            key = watchedItemKey(meta.type, meta.id),
            isFullyWatched = shouldMarkSeriesWatched,
        )
        return shouldMarkSeriesWatched
    }

    fun updateFullyWatchedSeries(
        id: String,
        type: String,
        isFullyWatched: Boolean,
    ) {
        if (!type.isSeriesLikeWatchedType()) return
        ensureLoaded()
        updateFullyWatchedSeriesKey(
            key = watchedItemKey(type, id),
            isFullyWatched = isFullyWatched,
        )
    }

    private fun updateFullyWatchedSeriesKey(
        key: String,
        isFullyWatched: Boolean,
    ) {
        val source = activeSource
        val current = fullyWatchedSeriesKeysForSource(source)
        val updated = if (isFullyWatched) current + key else current - key
        if (updated == current) return
        setFullyWatchedSeriesKeysForSource(source = source, keys = updated)
        publish()
        if (shouldPersistWatchedSource(source)) {
            persistNuvio()
        }
    }

    private fun pushMarksToServer(
        items: Collection<WatchedItem>,
        traktHistorySync: WatchedTraktHistorySync,
        source: WatchProgressSource,
    ) {
        val profileId = currentProfileId
        val operationGeneration = profileGeneration
        accountScopeSnapshot().launch {
            runCatching {
                if (items.isEmpty()) return@runCatching
                val pushed = pushToTargetsForSource(
                    profileId = profileId,
                    items = items,
                    traktHistorySync = traktHistorySync,
                    source = source,
                )
                if (pushed && shouldPersistWatchedSource(source)) {
                    recordSuccessfulPush(
                        profileId = profileId,
                        operationGeneration = operationGeneration,
                        items = items,
                    )
                }
            }.onFailure { e ->
                log.e(e) { "Failed to push watched items" }
            }
        }
    }

    private fun pushDeleteToServer(
        items: Collection<WatchedItem>,
        source: WatchProgressSource,
    ) {
        val profileId = currentProfileId
        accountScopeSnapshot().launch {
            runCatching {
                if (items.isEmpty()) return@runCatching
                deleteFromTargetsForSource(
                    profileId = profileId,
                    items = items,
                    source = source,
                )
            }.onFailure { e ->
                log.e(e) { "Failed to push watched item delete" }
            }
        }
    }

    private fun publish() {
        val items = watchedItemsForSource(
            source = activeSource,
            nuvioItems = nuvioItemsByKey.values,
            traktItems = traktItemsByKey.values,
        )
            .map(WatchedItem::normalizedMarkedAt)
            .sortedByDescending { it.markedAtEpochMs }
        _fullyWatchedSeriesKeys.value = fullyWatchedSeriesKeysForSource(activeSource)
        _uiState.value = WatchedUiState(
            items = items,
            watchedKeys = items.mapTo(linkedSetOf()) {
                watchedItemKey(it.type, it.id, it.season, it.episode)
            },
            isLoaded = hasLoadedSource(activeSource),
        )
    }

    private fun persistNuvio() {
        WatchedStorage.savePayload(
            currentProfileId,
            json.encodeToString(
                StoredWatchedPayload(
                    items = nuvioItemsByKey.values
                        .map(WatchedItem::normalizedMarkedAt)
                        .sortedByDescending { it.markedAtEpochMs },
                    fullyWatchedSeriesKeys = nuvioFullyWatchedSeriesKeys,
                    lastSuccessfulPushEpochMs = lastSuccessfulPushEpochMs,
                    deltaCursorEventId = deltaCursorEventId,
                    deltaInitialized = deltaInitialized,
                ),
            ),
        )
    }

    private fun recordSuccessfulPush(
        profileId: Int,
        operationGeneration: Long,
        items: Collection<WatchedItem>,
    ) {
        if (profileId != currentProfileId || operationGeneration != profileGeneration) return
        val latestPushed = items
            .asSequence()
            .map { item -> normalizeWatchedMarkedAtEpochMs(item.markedAtEpochMs) }
            .maxOrNull()
            ?: return
        if (latestPushed <= lastSuccessfulPushEpochMs) return
        lastSuccessfulPushEpochMs = latestPushed
        persistNuvio()
    }

    private suspend fun pushToTargetsForSource(
        profileId: Int,
        items: Collection<WatchedItem>,
        traktHistorySync: WatchedTraktHistorySync,
        source: WatchProgressSource,
    ): Boolean {
        val shouldMirrorToTrakt = shouldMirrorWatchedMarkToTraktHistory(
            sync = traktHistorySync,
            isTraktAuthenticated = TraktAuthRepository.isAuthenticated.value,
        )

        if (source == WatchProgressSource.TRAKT) {
            if (!shouldMirrorToTrakt) return false
            traktSyncAdapter.push(profileId = profileId, items = items)
            return true
        }

        syncAdapter.push(profileId = profileId, items = items)
        if (shouldMirrorToTrakt) {
            traktSyncAdapter.push(profileId = profileId, items = items)
        }
        return true
    }

    private suspend fun deleteFromTargetsForSource(
        profileId: Int,
        items: Collection<WatchedItem>,
        source: WatchProgressSource,
    ) {
        if (source == WatchProgressSource.TRAKT) {
            traktSyncAdapter.delete(profileId = profileId, items = items)
            return
        }

        syncAdapter.delete(profileId = profileId, items = items)
        if (TraktAuthRepository.isAuthenticated.value) {
            traktSyncAdapter.delete(profileId = profileId, items = items)
        }
    }

    private fun accountScopeSnapshot(): CoroutineScope =
        synchronized(accountScopeLock) {
            accountScope
        }
}

internal fun mergeWatchedItemsPreservingUnsynced(
    serverItems: Collection<WatchedItem>,
    localItems: Collection<WatchedItem>,
    lastSuccessfulPushEpochMs: Long,
    pullStartedEpochMs: Long,
    preserveWhenNoSuccessfulPush: Boolean = true,
): Map<String, WatchedItem> {
    val merged = serverItems
        .map(WatchedItem::normalizedMarkedAt)
        .associateBy { watchedItemKey(it.type, it.id, it.season, it.episode) }
        .toMutableMap()

    localItems
        .map(WatchedItem::normalizedMarkedAt)
        .forEach { localItem ->
            val key = watchedItemKey(localItem.type, localItem.id, localItem.season, localItem.episode)
            if (key in merged) return@forEach
            if (
                shouldPreserveLocalWatchedItem(
                    localItem = localItem,
                    lastSuccessfulPushEpochMs = lastSuccessfulPushEpochMs,
                    pullStartedEpochMs = pullStartedEpochMs,
                    preserveWhenNoSuccessfulPush = preserveWhenNoSuccessfulPush,
                )
            ) {
                merged[key] = localItem
            }
        }

    return merged
}

internal fun shouldPreserveLocalWatchedItem(
    localItem: WatchedItem,
    lastSuccessfulPushEpochMs: Long,
    pullStartedEpochMs: Long,
    preserveWhenNoSuccessfulPush: Boolean = true,
): Boolean {
    val markedAt = normalizeWatchedMarkedAtEpochMs(localItem.markedAtEpochMs)
    val wasMarkedAfterLastPush =
        (preserveWhenNoSuccessfulPush && lastSuccessfulPushEpochMs <= 0L) ||
            (lastSuccessfulPushEpochMs > 0L && markedAt > lastSuccessfulPushEpochMs)
    val wasMarkedDuringPull = pullStartedEpochMs > 0L && markedAt >= pullStartedEpochMs
    return wasMarkedAfterLastPush || wasMarkedDuringPull
}

internal fun wasWatchedItemMarkedDuringPull(
    localItem: WatchedItem,
    pullStartedEpochMs: Long,
): Boolean {
    val markedAt = normalizeWatchedMarkedAtEpochMs(localItem.markedAtEpochMs)
    return pullStartedEpochMs > 0L && markedAt >= pullStartedEpochMs
}

internal fun shouldUseTraktWatchedSync(
    isAuthenticated: Boolean,
    source: WatchProgressSource,
): Boolean = shouldUseTraktProgress(
    isAuthenticated = isAuthenticated,
    source = source,
)

internal fun effectiveWatchedSource(
    requestedSource: WatchProgressSource,
    isTraktAuthenticated: Boolean,
): WatchProgressSource =
    if (shouldUseTraktWatchedSync(isAuthenticated = isTraktAuthenticated, source = requestedSource)) {
        WatchProgressSource.TRAKT
    } else {
        WatchProgressSource.NUVIO_SYNC
    }

private fun String.isSeriesLikeWatchedType(): Boolean =
    trim().lowercase() in setOf("series", "show", "tv", "tvshow")
