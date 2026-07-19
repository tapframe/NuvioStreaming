package com.nuvio.app.features.watching.domain

import com.nuvio.app.core.time.EpisodeReleaseDatePlatform
import com.nuvio.app.core.time.daysUntilEpisodeRelease
import com.nuvio.app.core.time.isEpisodeReleaseAired
import com.nuvio.app.core.time.isoEpochDay as coreIsoEpochDay
import com.nuvio.app.core.time.parseEpisodeReleaseLocalDate

private const val CompletionThresholdFraction = 0.90
private const val ProgressStoreThresholdMs = 1_000L
private const val UpcomingNextSeasonWindowDays = 7

fun watchedKey(
    content: WatchingContentRef,
    seasonNumber: Int? = null,
    episodeNumber: Int? = null,
): String = "${content.type.trim()}:${content.id.trim()}:${seasonNumber ?: -1}:${episodeNumber ?: -1}"

fun shouldStoreProgress(
    positionMs: Long,
    durationMs: Long,
): Boolean = positionMs >= ProgressStoreThresholdMs

fun isProgressComplete(
    positionMs: Long,
    durationMs: Long,
    isEnded: Boolean,
): Boolean {
    if (isEnded) return true
    if (durationMs <= 0L) return false

    val watchedFraction = positionMs.toDouble() / durationMs.toDouble()
    return watchedFraction >= CompletionThresholdFraction
}

fun isReleasedBy(
    todayIsoDate: String,
    releasedDate: String?,
    available: Boolean = true,
    nowEpochMs: Long = EpisodeReleaseDatePlatform.nowEpochMs(),
): Boolean {
    if (!available) return false
    return isEpisodeReleaseAired(releasedDate, nowEpochMs) ?: true
}

internal fun shouldSurfaceNextEpisode(
    watchedSeasonNumber: Int?,
    candidateSeasonNumber: Int?,
    todayIsoDate: String,
    releasedDate: String?,
    showUnairedNextUp: Boolean,
    available: Boolean = true,
    nowEpochMs: Long = EpisodeReleaseDatePlatform.nowEpochMs(),
): Boolean {
    val isSeasonRollover = normalizeSeasonNumber(candidateSeasonNumber) != normalizeSeasonNumber(watchedSeasonNumber)
    if (!available) {
        val daysUntilRelease = daysUntilExplicitRelease(
            todayIsoDate = todayIsoDate,
            releasedDate = releasedDate,
        ) ?: return false
        if (!showUnairedNextUp || daysUntilRelease <= 0) return false
        return !isSeasonRollover || daysUntilRelease <= UpcomingNextSeasonWindowDays
    }
    if (!isSeasonRollover) {
        if (showUnairedNextUp) return true
        return isReleasedBy(
            todayIsoDate = todayIsoDate,
            releasedDate = releasedDate,
            nowEpochMs = nowEpochMs,
        )
    }

    if (isExplicitlyReleasedBy(releasedDate = releasedDate, nowEpochMs = nowEpochMs)) {
        return true
    }
    if (!showUnairedNextUp) {
        return false
    }

    val daysUntilRelease = daysUntilExplicitRelease(
        todayIsoDate = todayIsoDate,
        releasedDate = releasedDate,
    ) ?: return false
    return daysUntilRelease in 0..UpcomingNextSeasonWindowDays
}

private fun isExplicitlyReleasedBy(
    releasedDate: String?,
    nowEpochMs: Long,
): Boolean {
    return isEpisodeReleaseAired(releasedDate, nowEpochMs) ?: false
}

internal fun daysUntilExplicitRelease(
    todayIsoDate: String,
    releasedDate: String?,
): Int? {
    return daysUntilEpisodeRelease(todayIsoDate, releasedDate)
}

internal fun isoCalendarDateOrNull(value: String?): String? = parseEpisodeReleaseLocalDate(value)

internal fun isoEpochDay(date: String): Long = coreIsoEpochDay(date)

fun releasedEpisodes(
    episodes: List<WatchingReleasedEpisode>,
    todayIsoDate: String,
    nowEpochMs: Long = EpisodeReleaseDatePlatform.nowEpochMs(),
): List<WatchingReleasedEpisode> = episodes.filter { episode ->
    isReleasedBy(
        todayIsoDate = todayIsoDate,
        releasedDate = episode.releasedDate,
        available = episode.available,
        nowEpochMs = nowEpochMs,
    )
}

fun releasedMainSeasonEpisodes(
    episodes: List<WatchingReleasedEpisode>,
    todayIsoDate: String,
    nowEpochMs: Long = EpisodeReleaseDatePlatform.nowEpochMs(),
): List<WatchingReleasedEpisode> = releasedEpisodes(
    episodes = episodes,
    todayIsoDate = todayIsoDate,
    nowEpochMs = nowEpochMs,
).filter { episode ->
    normalizeSeasonNumber(episode.seasonNumber) > 0
}

fun hasWatchedAllMainSeasonEpisodes(
    episodes: List<WatchingReleasedEpisode>,
    todayIsoDate: String,
    nowEpochMs: Long = EpisodeReleaseDatePlatform.nowEpochMs(),
    isEpisodeWatched: (WatchingReleasedEpisode) -> Boolean,
): Boolean {
    val mainSeasonEpisodes = releasedMainSeasonEpisodes(
        episodes = episodes,
        todayIsoDate = todayIsoDate,
        nowEpochMs = nowEpochMs,
    )
    return mainSeasonEpisodes.isNotEmpty() && mainSeasonEpisodes.all(isEpisodeWatched)
}

fun latestCompletedSeriesEpisode(
    content: WatchingContentRef,
    progressRecords: List<WatchingProgressRecord>,
    watchedRecords: List<WatchingWatchedRecord>,
    preferFurthestEpisode: Boolean = true,
): WatchingCompletedEpisode? {
    val ordering = if (preferFurthestEpisode) {
        compareBy<WatchingCompletedEpisode>(
            { normalizeSeasonNumber(it.seasonNumber) },
            { it.episodeNumber },
            { it.markedAtEpochMs },
        )
    } else {
        compareBy<WatchingCompletedEpisode>(
            { it.markedAtEpochMs },
            { normalizeSeasonNumber(it.seasonNumber) },
            { it.episodeNumber },
        )
    }
    val allMarkers = buildList {
        progressRecords
            .asSequence()
            .filter { record ->
                record.content == content &&
                    record.isCompleted &&
                    record.seasonNumber != null &&
                    record.episodeNumber != null
            }
            .mapNotNullTo(this) { record ->
                val seasonNumber = record.seasonNumber ?: return@mapNotNullTo null
                val episodeNumber = record.episodeNumber ?: return@mapNotNullTo null
                WatchingCompletedEpisode(
                    seasonNumber = seasonNumber,
                    episodeNumber = episodeNumber,
                    markedAtEpochMs = record.lastUpdatedEpochMs,
                )
            }
        watchedRecords
            .asSequence()
            .filter { record ->
                record.content == content &&
                    record.seasonNumber != null &&
                    record.episodeNumber != null
            }
            .mapNotNullTo(this) { record ->
                val seasonNumber = record.seasonNumber ?: return@mapNotNullTo null
                val episodeNumber = record.episodeNumber ?: return@mapNotNullTo null
                WatchingCompletedEpisode(
                    seasonNumber = seasonNumber,
                    episodeNumber = episodeNumber,
                    markedAtEpochMs = record.markedAtEpochMs,
                )
            }
    }
    return allMarkers.maxWithOrNull(ordering)
}

fun normalizeSeasonNumber(seasonNumber: Int?): Int = seasonNumber?.coerceAtLeast(0) ?: 0
