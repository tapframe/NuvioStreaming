package com.nuvio.app.features.watching.domain

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
): Boolean {
    val isoDate = releasedDate
        ?.substringBefore('T')
        ?.takeIf { it.length == 10 }
        ?: return true
    return isoDate <= todayIsoDate
}

internal fun shouldSurfaceNextEpisode(
    watchedSeasonNumber: Int?,
    candidateSeasonNumber: Int?,
    todayIsoDate: String,
    releasedDate: String?,
    showUnairedNextUp: Boolean,
): Boolean {
    val isSeasonRollover = normalizeSeasonNumber(candidateSeasonNumber) != normalizeSeasonNumber(watchedSeasonNumber)
    if (!isSeasonRollover) {
        if (showUnairedNextUp) return true
        return isReleasedBy(todayIsoDate = todayIsoDate, releasedDate = releasedDate)
    }

    if (isExplicitlyReleasedBy(todayIsoDate = todayIsoDate, releasedDate = releasedDate)) {
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
    todayIsoDate: String,
    releasedDate: String?,
): Boolean {
    val isoDate = isoCalendarDateOrNull(releasedDate) ?: return false
    return isoDate <= todayIsoDate
}

private fun daysUntilExplicitRelease(
    todayIsoDate: String,
    releasedDate: String?,
): Int? {
    val startDate = isoCalendarDateOrNull(todayIsoDate) ?: return null
    val targetDate = isoCalendarDateOrNull(releasedDate) ?: return null
    return (isoEpochDay(targetDate) - isoEpochDay(startDate)).toInt()
}

private fun isoCalendarDateOrNull(value: String?): String? {
    val datePart = value
        ?.trim()
        ?.substringBefore('T')
        ?.takeIf { it.length == 10 }
        ?: return null
    val parts = datePart.split('-')
    if (parts.size != 3) return null
    val year = parts[0].toIntOrNull() ?: return null
    val month = parts[1].toIntOrNull()?.takeIf { it in 1..12 } ?: return null
    val day = parts[2].toIntOrNull()?.takeIf { it in 1..31 } ?: return null
    val normalizedYear = year.toString().padStart(4, '0')
    val normalizedMonth = month.toString().padStart(2, '0')
    val normalizedDay = day.toString().padStart(2, '0')
    return "$normalizedYear-$normalizedMonth-$normalizedDay"
}

private fun isoEpochDay(date: String): Long {
    val year = date.substring(0, 4).toLong()
    val month = date.substring(5, 7).toLong()
    val day = date.substring(8, 10).toLong()

    val adjustedYear = year - if (month <= 2L) 1L else 0L
    val era = if (adjustedYear >= 0L) adjustedYear / 400L else (adjustedYear - 399L) / 400L
    val yearOfEra = adjustedYear - era * 400L
    val adjustedMonth = month + if (month > 2L) -3L else 9L
    val dayOfYear = (153L * adjustedMonth + 2L) / 5L + day - 1L
    val dayOfEra = yearOfEra * 365L + yearOfEra / 4L - yearOfEra / 100L + dayOfYear
    return era * 146_097L + dayOfEra - 719_468L
}

fun releasedEpisodes(
    episodes: List<WatchingReleasedEpisode>,
    todayIsoDate: String,
): List<WatchingReleasedEpisode> = episodes.filter { episode ->
    isReleasedBy(todayIsoDate = todayIsoDate, releasedDate = episode.releasedDate)
}

fun releasedMainSeasonEpisodes(
    episodes: List<WatchingReleasedEpisode>,
    todayIsoDate: String,
): List<WatchingReleasedEpisode> = releasedEpisodes(
    episodes = episodes,
    todayIsoDate = todayIsoDate,
).filter { episode ->
    normalizeSeasonNumber(episode.seasonNumber) > 0
}

fun hasWatchedAllMainSeasonEpisodes(
    episodes: List<WatchingReleasedEpisode>,
    todayIsoDate: String,
    isEpisodeWatched: (WatchingReleasedEpisode) -> Boolean,
): Boolean {
    val mainSeasonEpisodes = releasedMainSeasonEpisodes(
        episodes = episodes,
        todayIsoDate = todayIsoDate,
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
