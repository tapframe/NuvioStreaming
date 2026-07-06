package com.nuvio.app.features.watching.domain

data class WatchingContentRef(
    val type: String,
    val id: String,
)

data class WatchingEpisodeRef(
    val content: WatchingContentRef,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
)

data class WatchingWatchedRecord(
    val content: WatchingContentRef,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val markedAtEpochMs: Long,
)

data class WatchingProgressRecord(
    val content: WatchingContentRef,
    val videoId: String,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val lastUpdatedEpochMs: Long,
    val lastPositionMs: Long = 0L,
    val isCompleted: Boolean = false,
    val episodeTitle: String? = null,
    val episodeThumbnail: String? = null,
)

data class WatchingReleasedEpisode(
    val videoId: String,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val title: String? = null,
    val thumbnail: String? = null,
    val releasedDate: String? = null,
    val available: Boolean = true,
)

data class WatchingCompletedEpisode(
    val seasonNumber: Int,
    val episodeNumber: Int,
    val markedAtEpochMs: Long,
)

data class WatchingSeriesPrimaryAction(
    val label: String,
    val videoId: String,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val episodeTitle: String?,
    val episodeThumbnail: String?,
    val resumePositionMs: Long?,
)
