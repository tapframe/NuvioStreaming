package com.nuvio.app.features.simkl

import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watchprogress.WatchProgressEntry

internal fun SimklSyncSnapshot.reconcileWatchedPlayback(): SimklSyncSnapshot {
    if (entries.isEmpty() || playback.isEmpty()) return this
    val watchedItems = toSimklWatchedProjection().items
    if (watchedItems.isEmpty()) return this
    val retainedPlayback = playback.filterNot { session ->
        session.toWatchProgressEntry()?.let { progress ->
            watchedItems.any { watched -> watched.supersedes(progress) }
        } == true
    }
    return if (retainedPlayback.size == playback.size) this else copy(playback = retainedPlayback)
}

private fun WatchedItem.supersedes(progress: WatchProgressEntry): Boolean {
    if (!type.equals(progress.contentType, ignoreCase = true)) return false
    if (season != progress.seasonNumber || episode != progress.episodeNumber) return false
    val sameProviderItem = trackingProviderItemId
        ?.takeIf(String::isNotBlank)
        ?.equals(progress.trackingProviderItemId, ignoreCase = true) == true
    val sameContent = id.equals(progress.parentMetaId, ignoreCase = true)
    return (sameProviderItem || sameContent) && markedAtEpochMs >= progress.lastUpdatedEpochMs
}
