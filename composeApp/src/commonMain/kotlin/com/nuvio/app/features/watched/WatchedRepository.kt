package com.nuvio.app.features.watched

import co.touchlab.kermit.Logger
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.WatchProgressSource
import com.nuvio.app.features.trakt.shouldUseTraktProgress
import com.nuvio.app.features.watching.sync.SupabaseWatchedSyncAdapter
import com.nuvio.app.features.watching.sync.TraktWatchedSyncAdapter
import com.nuvio.app.features.watching.sync.WatchedDeltaEvent
import com.nuvio.app.features.watching.sync.WatchedSyncAdapter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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

object WatchedRepository {
    private const val watchedItemsPageSize = 900
    private const val watchedItemsDeltaPageSize = 900
    private const val watchedDeltaOperationUpsert = "upsert"
    private const val watchedDeltaOperationDelete = "delete"

    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("WatchedRepository")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(WatchedUiState())
    val uiState: StateFlow<WatchedUiState> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var currentProfileId: Int = 1
    private var profileGeneration: Long = 0L
    private var itemsByKey: MutableMap<String, WatchedItem> = mutableMapOf()
    private var lastSuccessfulPushEpochMs: Long = 0L
    private var deltaCursorEventId: Long = 0L
    private var deltaInitialized: Boolean = false
    internal var syncAdapter: WatchedSyncAdapter = SupabaseWatchedSyncAdapter

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk(ProfileRepository.activeProfileId)
    }

    fun onProfileChanged(profileId: Int) {
        if (profileId == currentProfileId && hasLoaded) return
        loadFromDisk(profileId)
    }

    fun clearLocalState() {
        hasLoaded = false
        currentProfileId = 1
        profileGeneration += 1L
        itemsByKey.clear()
        lastSuccessfulPushEpochMs = 0L
        deltaCursorEventId = 0L
        deltaInitialized = false
        _uiState.value = WatchedUiState()
    }

    private fun loadFromDisk(profileId: Int) {
        currentProfileId = profileId
        profileGeneration += 1L
        hasLoaded = true
        itemsByKey.clear()

        val payload = WatchedStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isNotEmpty()) {
            val storedPayload = runCatching {
                json.decodeFromString<StoredWatchedPayload>(payload)
            }.getOrDefault(StoredWatchedPayload())
            lastSuccessfulPushEpochMs = storedPayload.lastSuccessfulPushEpochMs
            deltaCursorEventId = storedPayload.deltaCursorEventId
            deltaInitialized = storedPayload.deltaInitialized
            itemsByKey = storedPayload.items
                .map(WatchedItem::normalizedMarkedAt)
                .associateBy { watchedItemKey(it.type, it.id, it.season, it.episode) }
                .toMutableMap()
        } else {
            lastSuccessfulPushEpochMs = 0L
            deltaCursorEventId = 0L
            deltaInitialized = false
        }

        publish()
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
        val operationGeneration = activeOperationGeneration(profileId) ?: run {
            log.d { "Skipping watched pull for inactive profile $profileId" }
            return
        }
        val pullStartedEpochMs = WatchedClock.nowEpochMs()
        val localBeforePull = itemsByKey.values
            .map(WatchedItem::normalizedMarkedAt)
            .toList()
        val lastPushEpochMs = lastSuccessfulPushEpochMs
        runCatching {
            if (shouldUseTraktWatchedSync()) {
                pullFullFromAdapter(
                    adapter = TraktWatchedSyncAdapter,
                    profileId = profileId,
                    localBeforePull = localBeforePull,
                    lastPushEpochMs = lastPushEpochMs,
                    pullStartedEpochMs = pullStartedEpochMs,
                    resetDeltaState = true,
                    operationGeneration = operationGeneration,
                )
            } else {
                pullSupabaseDeltaFromServer(
                    profileId = profileId,
                    localBeforePull = localBeforePull,
                    lastPushEpochMs = lastPushEpochMs,
                    pullStartedEpochMs = pullStartedEpochMs,
                    operationGeneration = operationGeneration,
                )
            }
        }.onFailure { e ->
            log.e(e) { "Failed to pull watched items from server" }
        }
    }

    private suspend fun pullFullFromAdapter(
        adapter: WatchedSyncAdapter,
        profileId: Int,
        localBeforePull: List<WatchedItem>,
        lastPushEpochMs: Long,
        pullStartedEpochMs: Long,
        resetDeltaState: Boolean,
        operationGeneration: Long,
    ) {
        val serverItems = adapter.pull(
            profileId = profileId,
            pageSize = watchedItemsPageSize,
        )
        if (!isActiveOperation(profileId, operationGeneration)) return

        itemsByKey = mergeWatchedItemsPreservingUnsynced(
            serverItems = serverItems,
            localItems = localBeforePull,
            lastSuccessfulPushEpochMs = lastPushEpochMs,
            pullStartedEpochMs = pullStartedEpochMs,
        ).toMutableMap()
        if (resetDeltaState) {
            deltaCursorEventId = 0L
            deltaInitialized = false
        }
        hasLoaded = true
        publish()
        persist()
    }

    private suspend fun pullSupabaseDeltaFromServer(
        profileId: Int,
        localBeforePull: List<WatchedItem>,
        lastPushEpochMs: Long,
        pullStartedEpochMs: Long,
        operationGeneration: Long,
    ) {
        if (!isActiveOperation(profileId, operationGeneration)) return
        if (!deltaInitialized) {
            val cursorBeforeSnapshot = syncAdapter.getDeltaCursor(profileId) ?: return
            pullFullFromAdapter(
                adapter = syncAdapter,
                profileId = profileId,
                localBeforePull = localBeforePull,
                lastPushEpochMs = lastPushEpochMs,
                pullStartedEpochMs = pullStartedEpochMs,
                resetDeltaState = false,
                operationGeneration = operationGeneration,
            )
            if (!isActiveOperation(profileId, operationGeneration)) return
            deltaCursorEventId = cursorBeforeSnapshot
            deltaInitialized = true
            persist()
            return
        }

        var cursor = deltaCursorEventId
        var changed = false

        while (true) {
            val events = syncAdapter.pullDelta(
                profileId = profileId,
                sinceEventId = cursor,
                limit = watchedItemsDeltaPageSize,
            )
            if (!isActiveOperation(profileId, operationGeneration)) return
            if (events.isEmpty()) break

            applyWatchedDeltaEvents(
                events = events,
                lastPushEpochMs = lastPushEpochMs,
                pullStartedEpochMs = pullStartedEpochMs,
            )
            cursor = maxOf(cursor, events.maxOf { it.eventId })
            deltaCursorEventId = cursor
            deltaInitialized = true
            changed = true

            if (events.size < watchedItemsDeltaPageSize) break
        }

        hasLoaded = true
        if (changed) {
            publish()
            persist()
        }
    }

    private fun applyWatchedDeltaEvents(
        events: Collection<WatchedDeltaEvent>,
        lastPushEpochMs: Long,
        pullStartedEpochMs: Long,
    ) {
        events.forEach { event ->
            val key = watchedItemKey(event.contentType, event.contentId, event.season, event.episode)
            when (event.operation.lowercase()) {
                watchedDeltaOperationUpsert -> {
                    itemsByKey[key] = WatchedItem(
                        id = event.contentId,
                        type = event.contentType,
                        name = event.title,
                        season = event.season,
                        episode = event.episode,
                        markedAtEpochMs = normalizeWatchedMarkedAtEpochMs(event.watchedAt),
                    )
                }
                watchedDeltaOperationDelete -> {
                    val localItem = itemsByKey[key]
                    if (localItem != null && shouldPreserveLocalWatchedItem(localItem, lastPushEpochMs, pullStartedEpochMs)) {
                        return@forEach
                    }
                    itemsByKey.remove(key)
                }
            }
        }
    }

    fun toggleWatched(item: WatchedItem) {
        ensureLoaded()
        val key = watchedItemKey(item.type, item.id, item.season, item.episode)
        if (itemsByKey.containsKey(key)) {
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
        val markedAt = WatchedClock.nowEpochMs()
        val timestampedItems = items.map { watchedItem ->
            watchedItem.copy(markedAtEpochMs = markedAt)
        }
        timestampedItems.forEach { watchedItem ->
            val key = watchedItemKey(watchedItem.type, watchedItem.id, watchedItem.season, watchedItem.episode)
            itemsByKey[key] = watchedItem
        }
        publish()
        persist()
        if (syncRemote) {
            pushMarksToServer(timestampedItems, traktHistorySync)
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
        val removedItems = items.mapNotNull { watchedItem ->
            itemsByKey.remove(watchedItemKey(watchedItem.type, watchedItem.id, watchedItem.season, watchedItem.episode))
        }
        if (removedItems.isNotEmpty()) {
            publish()
            persist()
            pushDeleteToServer(removedItems)
        }
    }

    fun isWatched(
        id: String,
        type: String,
        season: Int? = null,
        episode: Int? = null,
    ): Boolean {
        ensureLoaded()
        return itemsByKey.containsKey(watchedItemKey(type, id, season, episode))
    }

    fun reconcileSeriesWatchedState(
        meta: MetaDetails,
        todayIsoDate: String,
        isEpisodeCompleted: (com.nuvio.app.features.details.MetaVideo) -> Boolean = { false },
    ) {
        if (!meta.type.isSeriesLikeWatchedType()) return

        ensureLoaded()
        val shouldMarkSeriesWatched = meta.hasWatchedAllMainSeasonEpisodes(todayIsoDate) { episode ->
            isWatched(
                id = meta.id,
                type = meta.type,
                season = episode.season,
                episode = episode.episode,
            ) || isEpisodeCompleted(episode)
        }
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

    private fun pushMarksToServer(
        items: Collection<WatchedItem>,
        traktHistorySync: WatchedTraktHistorySync,
    ) {
        val profileId = currentProfileId
        syncScope.launch {
            runCatching {
                if (items.isEmpty()) return@runCatching
                val pushed = pushToActiveTargets(
                    profileId = profileId,
                    items = items,
                    traktHistorySync = traktHistorySync,
                )
                if (pushed) {
                    recordSuccessfulPush(profileId = profileId, items = items)
                }
            }.onFailure { e ->
                log.e(e) { "Failed to push watched items" }
            }
        }
    }

    private fun pushDeleteToServer(items: Collection<WatchedItem>) {
        val profileId = currentProfileId
        syncScope.launch {
            runCatching {
                if (items.isEmpty()) return@runCatching
                deleteFromActiveTargets(profileId = profileId, items = items)
            }.onFailure { e ->
                log.e(e) { "Failed to push watched item delete" }
            }
        }
    }

    private fun publish() {
        val items = itemsByKey.values
            .map(WatchedItem::normalizedMarkedAt)
            .sortedByDescending { it.markedAtEpochMs }
        _uiState.value = WatchedUiState(
            items = items,
            watchedKeys = items.mapTo(linkedSetOf()) {
                watchedItemKey(it.type, it.id, it.season, it.episode)
            },
            isLoaded = true,
        )
    }

    private fun persist() {
        WatchedStorage.savePayload(
            currentProfileId,
            json.encodeToString(
                StoredWatchedPayload(
                    items = itemsByKey.values
                        .map(WatchedItem::normalizedMarkedAt)
                        .sortedByDescending { it.markedAtEpochMs },
                    lastSuccessfulPushEpochMs = lastSuccessfulPushEpochMs,
                    deltaCursorEventId = deltaCursorEventId,
                    deltaInitialized = deltaInitialized,
                ),
            ),
        )
    }

    private fun recordSuccessfulPush(profileId: Int, items: Collection<WatchedItem>) {
        if (profileId != currentProfileId) return
        val latestPushed = items
            .asSequence()
            .map { item -> normalizeWatchedMarkedAtEpochMs(item.markedAtEpochMs) }
            .maxOrNull()
            ?: return
        if (latestPushed <= lastSuccessfulPushEpochMs) return
        lastSuccessfulPushEpochMs = latestPushed
        persist()
    }

    private fun shouldUseTraktWatchedSync(): Boolean =
        shouldUseTraktWatchedSync(
            isAuthenticated = TraktAuthRepository.isAuthenticated.value,
            source = TraktSettingsRepository.uiState.value.watchProgressSource,
        )

    private suspend fun pushToActiveTargets(
        profileId: Int,
        items: Collection<WatchedItem>,
        traktHistorySync: WatchedTraktHistorySync,
    ): Boolean {
        val shouldMirrorToTrakt = shouldMirrorWatchedMarkToTraktHistory(
            sync = traktHistorySync,
            isTraktAuthenticated = TraktAuthRepository.isAuthenticated.value,
        )

        if (shouldUseTraktWatchedSync()) {
            if (!shouldMirrorToTrakt) return false
            TraktWatchedSyncAdapter.push(profileId = profileId, items = items)
            return true
        }

        syncAdapter.push(profileId = profileId, items = items)
        if (shouldMirrorToTrakt) {
            TraktWatchedSyncAdapter.push(profileId = profileId, items = items)
        }
        return true
    }

    private suspend fun deleteFromActiveTargets(
        profileId: Int,
        items: Collection<WatchedItem>,
    ) {
        if (shouldUseTraktWatchedSync()) {
            TraktWatchedSyncAdapter.delete(profileId = profileId, items = items)
            return
        }

        syncAdapter.delete(profileId = profileId, items = items)
        if (TraktAuthRepository.isAuthenticated.value) {
            TraktWatchedSyncAdapter.delete(profileId = profileId, items = items)
        }
    }
}

internal fun mergeWatchedItemsPreservingUnsynced(
    serverItems: Collection<WatchedItem>,
    localItems: Collection<WatchedItem>,
    lastSuccessfulPushEpochMs: Long,
    pullStartedEpochMs: Long,
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
            if (shouldPreserveLocalWatchedItem(localItem, lastSuccessfulPushEpochMs, pullStartedEpochMs)) {
                merged[key] = localItem
            }
        }

    return merged
}

internal fun shouldPreserveLocalWatchedItem(
    localItem: WatchedItem,
    lastSuccessfulPushEpochMs: Long,
    pullStartedEpochMs: Long,
): Boolean {
    val markedAt = localItem.markedAtEpochMs
    val wasMarkedAfterLastPush = lastSuccessfulPushEpochMs > 0L && markedAt > lastSuccessfulPushEpochMs
    val wasMarkedDuringPull = pullStartedEpochMs > 0L && markedAt >= pullStartedEpochMs
    return wasMarkedAfterLastPush || wasMarkedDuringPull
}

internal fun shouldUseTraktWatchedSync(
    isAuthenticated: Boolean,
    source: WatchProgressSource,
): Boolean = shouldUseTraktProgress(
    isAuthenticated = isAuthenticated,
    source = source,
)

private fun String.isSeriesLikeWatchedType(): Boolean =
    trim().lowercase() in setOf("series", "show", "tv", "tvshow")
