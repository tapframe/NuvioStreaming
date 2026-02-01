package com.nuvio.tv.domain.model

/**
 * Represents the watch progress for a content item (movie or episode).
 */
data class WatchProgress(
    val contentId: String,           // IMDB ID of the movie/series
    val contentType: String,         // "movie" or "series"
    val name: String,                // Movie or series name
    val poster: String?,             // Poster URL
    val backdrop: String?,           // Backdrop URL
    val logo: String?,               // Logo URL
    val videoId: String,             // Specific video/episode ID being watched
    val season: Int?,                // Season number (null for movies)
    val episode: Int?,               // Episode number (null for movies)
    val episodeTitle: String?,       // Episode title (null for movies)
    val position: Long,              // Current playback position in ms
    val duration: Long,              // Total duration in ms
    val lastWatched: Long,           // Timestamp when last watched
    val addonBaseUrl: String? = null // Addon that was used to play
) {
    /**
     * Progress percentage (0.0 to 1.0)
     */
    val progressPercentage: Float
        get() = if (duration > 0) (position.toFloat() / duration.toFloat()).coerceIn(0f, 1f) else 0f

    /**
     * Returns true if the content has been watched past the threshold (typically 90%)
     */
    fun isCompleted(threshold: Float = 0.90f): Boolean = progressPercentage >= threshold

    /**
     * Returns true if the content has been started but not completed
     */
    fun isInProgress(startThreshold: Float = 0.02f, endThreshold: Float = 0.90f): Boolean =
        progressPercentage >= startThreshold && progressPercentage < endThreshold

    /**
     * Returns the remaining time in milliseconds
     */
    val remainingTime: Long
        get() = (duration - position).coerceAtLeast(0)

    /**
     * Display string for the episode (e.g., "S1E2")
     */
    val episodeDisplayString: String?
        get() = if (season != null && episode != null) "S${season}E${episode}" else null
}

/**
 * Represents the next item to watch for a series or a movie to resume.
 */
data class NextToWatch(
    val watchProgress: WatchProgress?,  // Null if nothing has been watched yet
    val isResume: Boolean,              // True if resuming current item, false if next episode
    val nextVideoId: String?,           // Video ID to play next
    val nextSeason: Int?,               // Next season number
    val nextEpisode: Int?,              // Next episode number
    val displayText: String             // Text to show on button (e.g., "Resume S1E2", "Play S1E3")
)
