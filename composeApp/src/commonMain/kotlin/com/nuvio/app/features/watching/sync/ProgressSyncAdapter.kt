package com.nuvio.app.features.watching.sync

import com.nuvio.app.features.watchprogress.WatchProgressEntry

data class ProgressSyncRecord(
    val contentId: String,
    val contentType: String,
    val videoId: String,
    val season: Int? = null,
    val episode: Int? = null,
    val position: Long = 0L,
    val duration: Long = 0L,
    val lastWatched: Long = 0L,
)

interface ProgressSyncAdapter {
    suspend fun pull(
        profileId: Int,
        sinceLastWatched: Long? = null,
        limit: Int? = null,
    ): List<ProgressSyncRecord>

    suspend fun push(
        profileId: Int,
        entries: Collection<WatchProgressEntry>,
    )

    suspend fun delete(
        profileId: Int,
        entries: Collection<WatchProgressEntry>,
    )
}
