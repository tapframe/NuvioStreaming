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
    private var itemsByKey: MutableMap<String, WatchedItem> = mutableMapOf()
    private var lastSuccessfulPushEpochMs: Long = 0L
    internal var syncAdapter: WatchedSyncAdapter = SupabaseWatchedSyncAdapter

    private fun activePullSyncAdapter(): WatchedSyncAdapter =
        if (shouldUseTraktWatchedSync()) TraktWatchedSyncAdapter else syncAdapter

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
        itemsByKey.clear()
        lastSuccessfulPushEpochMs = 0L
        _uiState.value = WatchedUiState()
    }

    private fun loadFromDisk(profileId: Int) {
        currentProfileId = profileId
        hasLoaded = true
        itemsByKey.clear()

        val payload = WatchedStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isNotEmpty()) {
            val storedPayload = runCatching {
                json.decodeFromString<StoredWatchedPayload>(payload)
            }.getOrDefault(StoredWatchedPayload())
            lastSuccessfulPushEpochMs = storedPayload.lastSuccessfulPushEpochMs
            itemsByKey = storedPayload.items
                .map(WatchedItem::normalizedMarkedAt)
                .associateBy { watchedItemKey(it.type, it.id, it.season, it.episode) }
                .toMutableMap()
        } else {
            lastSuccessfulPushEpochMs = 0L
        }

        publish()
    }

    suspend fun pullFromServer(profileId: Int) {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        currentProfileId = profileId
        val pullStartedEpochMs = WatchedClock.nowEpochMs()
        val localBeforePull = itemsByKey.values
            .map(WatchedItem::normalizedMarkedAt)
            .toList()
        val lastPushEpochMs = lastSuccessfulPushEpochMs
        runCatching {
            val serverItems = activePullSyncAdapter().pull(
                profileId = profileId,
                pageSize = watchedItemsPageSize,
            )

            itemsByKey = mergeWatchedItemsPreservingUnsynced(
                serverItems = serverItems,
                localItems = localBeforePull,
                lastSuccessfulPushEpochMs = lastPushEpochMs,
                pullStartedEpochMs = pullStartedEpochMs,
            ).toMutableMap()
            hasLoaded = true
            publish()
            persist()
        }.onFailure { e ->
            log.e(e) { "Failed to pull watched items from server" }
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

    internal fun markWatchedFromPlaybackCompletion(item: WatchedItem) {
        markWatched(items = listOf(item), traktHistorySync = WatchedTraktHistorySync.Skip)
    }

    private fun markWatched(
        items: Collection<WatchedItem>,
        traktHistorySync: WatchedTraktHistorySync,
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
        pushMarksToServer(timestampedItems, traktHistorySync)
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
        syncScope.launch {
            runCatching {
                if (items.isEmpty()) return@runCatching
                val profileId = ProfileRepository.activeProfileId
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
        syncScope.launch {
            runCatching {
                if (items.isEmpty()) return@runCatching
                val profileId = ProfileRepository.activeProfileId
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
            val markedAt = localItem.markedAtEpochMs
            val wasMarkedAfterLastPush = lastSuccessfulPushEpochMs > 0L && markedAt > lastSuccessfulPushEpochMs
            val wasMarkedDuringPull = pullStartedEpochMs > 0L && markedAt >= pullStartedEpochMs
            if (wasMarkedAfterLastPush || wasMarkedDuringPull) {
                merged[key] = localItem
            }
        }

    return merged
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
