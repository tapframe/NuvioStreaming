package com.nuvio.app.features.watching.sync

import com.nuvio.app.features.watched.WatchedItem

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
