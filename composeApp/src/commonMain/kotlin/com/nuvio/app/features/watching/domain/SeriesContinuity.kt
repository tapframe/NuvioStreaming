package com.nuvio.app.features.watching.domain

import com.nuvio.app.core.i18n.localizedPlayLabel
import com.nuvio.app.core.i18n.localizedResumeLabel
import com.nuvio.app.core.i18n.localizedUpNextLabel

const val DefaultContinueWatchingLimit = 20

fun resumeProgressForSeries(
    content: WatchingContentRef,
    progressRecords: List<WatchingProgressRecord>,
): WatchingProgressRecord? = progressRecords
    .filter { record -> record.content == content && !record.isCompleted }
    .maxByOrNull { record -> record.lastUpdatedEpochMs }

fun continueWatchingProgressEntries(
    progressRecords: List<WatchingProgressRecord>,
    limit: Int = DefaultContinueWatchingLimit,
): List<WatchingProgressRecord> {
    val inProgress = progressRecords.filterNot { record -> record.isCompleted }
    val (episodes, nonEpisodes) = inProgress.partition { record ->
        record.seasonNumber != null && record.episodeNumber != null
    }
    val latestPerSeries = episodes
        .sortedByDescending { record -> record.lastUpdatedEpochMs }
        .distinctBy { record -> record.content.id }
    return (nonEpisodes + latestPerSeries)
        .sortedByDescending { record -> record.lastUpdatedEpochMs }
        .take(limit)
}

fun shouldPreferResume(
    resumeRecord: WatchingProgressRecord?,
    latestCompletedEpisode: WatchingCompletedEpisode?,
): Boolean = resumeRecord != null &&
    (latestCompletedEpisode == null || resumeRecord.lastUpdatedEpochMs > latestCompletedEpisode.markedAtEpochMs)

fun nextReleasedEpisodeAfter(
    content: WatchingContentRef,
    episodes: List<WatchingReleasedEpisode>,
    seasonNumber: Int?,
    episodeNumber: Int?,
    todayIsoDate: String,
): WatchingReleasedEpisode? {
    val sortedEpisodes = episodes.sortedWith(
        compareBy<WatchingReleasedEpisode>({ normalizeSeasonNumber(it.seasonNumber) }, { it.episodeNumber ?: 0 }),
    )
    val watchedVideoId = buildPlaybackVideoId(content, seasonNumber, episodeNumber)
    val candidates = sortedEpisodes
        .dropWhile { episode -> buildPlaybackVideoId(content, episode.seasonNumber, episode.episodeNumber, episode.videoId) != watchedVideoId }
        .drop(1)
        .filter { episode ->
            shouldSurfaceNextEpisode(
                watchedSeasonNumber = seasonNumber,
                candidateSeasonNumber = episode.seasonNumber,
                todayIsoDate = todayIsoDate,
                releasedDate = episode.releasedDate,
                showUnairedNextUp = false,
            )
        }
    return candidates.firstOrNull { normalizeSeasonNumber(it.seasonNumber) > 0 }
}

fun decideSeriesPrimaryAction(
    content: WatchingContentRef,
    episodes: List<WatchingReleasedEpisode>,
    progressRecords: List<WatchingProgressRecord>,
    watchedRecords: List<WatchingWatchedRecord>,
    todayIsoDate: String,
    preferFurthestEpisode: Boolean = true,
): WatchingSeriesPrimaryAction? {
    val resumeRecord = resumeProgressForSeries(
        content = content,
        progressRecords = progressRecords,
    )
    val latestCompletedEpisode = latestCompletedSeriesEpisode(
        content = content,
        progressRecords = progressRecords,
        watchedRecords = watchedRecords,
        preferFurthestEpisode = preferFurthestEpisode,
    )

    if (shouldPreferResume(resumeRecord = resumeRecord, latestCompletedEpisode = latestCompletedEpisode)) {
        return resumeRecord?.toResumeAction()
    }

    val nextEpisode = if (latestCompletedEpisode != null) {
        nextReleasedEpisodeAfter(
            content = content,
            episodes = episodes,
            seasonNumber = latestCompletedEpisode.seasonNumber,
            episodeNumber = latestCompletedEpisode.episodeNumber,
            todayIsoDate = todayIsoDate,
        )
    } else {
        val sorted = episodes
            .sortedWith(compareBy<WatchingReleasedEpisode>({ normalizeSeasonNumber(it.seasonNumber) }, { it.episodeNumber ?: 0 }))
        val released = sorted.filter { episode -> isReleasedBy(todayIsoDate = todayIsoDate, releasedDate = episode.releasedDate) }
        released.firstOrNull { normalizeSeasonNumber(it.seasonNumber) > 0 } ?: released.firstOrNull()
    }

    return nextEpisode?.let { episode ->
        WatchingSeriesPrimaryAction(
            label = if (latestCompletedEpisode != null) {
                upNextLabel(episode.seasonNumber, episode.episodeNumber)
            } else {
                playLabel(episode.seasonNumber, episode.episodeNumber)
            },
            videoId = buildPlaybackVideoId(
                content = content,
                seasonNumber = episode.seasonNumber,
                episodeNumber = episode.episodeNumber,
                fallbackVideoId = episode.videoId,
            ),
            seasonNumber = episode.seasonNumber,
            episodeNumber = episode.episodeNumber,
            episodeTitle = episode.title,
            episodeThumbnail = episode.thumbnail,
            resumePositionMs = null,
        )
    }
}

fun buildPlaybackVideoId(
    content: WatchingContentRef,
    seasonNumber: Int?,
    episodeNumber: Int?,
    fallbackVideoId: String? = null,
): String =
    if (seasonNumber != null && episodeNumber != null) {
        "${content.id}:$seasonNumber:$episodeNumber"
    } else {
        fallbackVideoId?.takeIf { it.isNotBlank() } ?: content.id
    }

fun playLabel(seasonNumber: Int?, episodeNumber: Int?): String =
    localizedPlayLabel(seasonNumber = seasonNumber, episodeNumber = episodeNumber)

fun upNextLabel(seasonNumber: Int?, episodeNumber: Int?): String =
    localizedUpNextLabel(seasonNumber = seasonNumber, episodeNumber = episodeNumber)

fun resumeLabel(seasonNumber: Int?, episodeNumber: Int?): String =
    localizedResumeLabel(seasonNumber = seasonNumber, episodeNumber = episodeNumber)

private fun WatchingProgressRecord.toResumeAction(): WatchingSeriesPrimaryAction =
    WatchingSeriesPrimaryAction(
        label = resumeLabel(seasonNumber = seasonNumber, episodeNumber = episodeNumber),
        videoId = videoId,
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        episodeTitle = episodeTitle,
        episodeThumbnail = episodeThumbnail,
        resumePositionMs = lastPositionMs,
    )
