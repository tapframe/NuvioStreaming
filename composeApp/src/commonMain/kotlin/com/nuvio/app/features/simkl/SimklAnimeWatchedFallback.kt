package com.nuvio.app.features.simkl

/**
 * Provides a fallback watched check for anime franchise-parent content IDs.
 *
 * When meta.id is a franchise parent (e.g. "mal:49233") that doesn't exist in
 * Simkl's snapshot, episodes can't be resolved through watchedKeys alone.
 * This fallback parses the video ID (e.g. "mal:32615:1") and checks the
 * Simkl snapshot directly.
 *
 * Optimistic removals are tracked — after unmark, the videoId is blacklisted
 * until the snapshot refreshes and confirms the removal.
 */
object SimklAnimeWatchedFallback {
    private val optimisticallyRemoved = mutableSetOf<String>()

    fun isWatched(videoId: String, episode: Int): Boolean {
        if (videoId in optimisticallyRemoved) return false
        return isWatchedByAnimeVideoId(
            snapshot = SimklSyncRepository.state.value.snapshot,
            videoId = videoId,
            episode = episode,
        )
    }

    fun markOptimisticallyRemoved(videoId: String) {
        optimisticallyRemoved += videoId
    }

    /**
     * Called when snapshot refreshes — clear optimistic removals since
     * the snapshot now reflects the true state.
     */
    fun clearOptimisticRemovals() {
        optimisticallyRemoved.clear()
    }
}
