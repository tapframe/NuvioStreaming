package com.nuvio.app.features.watching.sync

import com.nuvio.app.features.watched.WatchedItem
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

data class WatchedDeltaEvent(
    val eventId: Long,
    val operation: String,
    val contentId: String,
    val contentType: String,
    val title: String,
    val season: Int?,
    val episode: Int?,
    val watchedAt: Long,
)

interface WatchedSyncAdapter {
    suspend fun pull(
        profileId: Int,
        pageSize: Int,
    ): List<WatchedItem>

    suspend fun pullFullyWatchedSeriesKeys(profileId: Int): Set<String>? = null

    /**
     * Returns extra watched keys that should be added to the watched keys set
     * without creating additional watched items (to avoid duplicates in CW).
     * Used by Simkl for anime alternate content IDs (MAL, AniDB, etc.).
     */
    suspend fun pullExtraWatchedKeys(profileId: Int): Set<String> = emptySet()

    /**
     * Returns a Flow of extra watched keys that updates reactively when the
     * provider's state changes (e.g. after mutations or syncs).
     * Default implementation emits the result of pullExtraWatchedKeys once.
     */
    fun observeExtraWatchedKeys(profileId: Int): Flow<Set<String>> = flowOf(emptySet())

    suspend fun getDeltaCursor(profileId: Int): Long? = null

    suspend fun pullDelta(
        profileId: Int,
        sinceEventId: Long,
        limit: Int,
    ): List<WatchedDeltaEvent> = emptyList()

    suspend fun push(
        profileId: Int,
        items: Collection<WatchedItem>,
    )

    suspend fun delete(
        profileId: Int,
        items: Collection<WatchedItem>,
    )
}
