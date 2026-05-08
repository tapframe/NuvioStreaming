package com.nuvio.app.features.details

import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.normalizeWatchedMarkedAtEpochMs
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watching.domain.WatchingCompletedEpisode
import com.nuvio.app.features.watching.domain.WatchingContentRef
import com.nuvio.app.features.watching.domain.WatchingProgressRecord
import com.nuvio.app.features.watching.domain.WatchingReleasedEpisode
import com.nuvio.app.features.watching.domain.WatchingSeriesPrimaryAction
import com.nuvio.app.features.watching.domain.WatchingWatchedRecord
import com.nuvio.app.features.watching.domain.buildPlaybackVideoId
import com.nuvio.app.features.watching.domain.decideSeriesPrimaryAction
import com.nuvio.app.features.watching.domain.isReleasedBy
import com.nuvio.app.features.watching.domain.latestCompletedSeriesEpisode
import com.nuvio.app.features.watching.domain.playLabel
import com.nuvio.app.features.watching.domain.resumeLabel
import com.nuvio.app.features.watching.domain.shouldSurfaceNextEpisode
import com.nuvio.app.features.watching.domain.upNextLabel

internal fun MetaDetails.sortedPlayableEpisodes(): List<MetaVideo> =
    videos
        .filter { it.season != null || it.episode != null }
        .sortedWith(metaVideoSeasonEpisodeComparator)

internal fun List<MetaVideo>.filterUnavailableFutureSeasons(
    todayIsoDate: String,
): List<MetaVideo> {
    val unavailableSeasons = groupBy { episode -> normalizeSeasonNumber(episode.season) }
        .filter { (seasonNumber, episodes) ->
            if (seasonNumber <= 0) return@filter false
            val firstEpisode = episodes.minWithOrNull(
                compareBy<MetaVideo>({ it.episode ?: Int.MAX_VALUE }, { it.released.orEmpty() }),
            ) ?: return@filter false
            !isReleasedBy(todayIsoDate = todayIsoDate, releasedDate = firstEpisode.released)
        }
        .keys

    return if (unavailableSeasons.isEmpty()) {
        this
    } else {
        filter { episode -> normalizeSeasonNumber(episode.season) !in unavailableSeasons }
    }
}

internal fun MetaDetails.firstPlayableEpisode(): MetaVideo? =
    sortedPlayableEpisodes().firstOrNull()

internal fun MetaDetails.firstReleasedPlayableEpisode(todayIsoDate: String): MetaVideo? =
    sortedPlayableEpisodes().firstOrNull { video ->
        isReleasedBy(todayIsoDate = todayIsoDate, releasedDate = video.released)
    }

internal fun MetaDetails.nextReleasedEpisodeAfter(
    completedEntry: WatchProgressEntry,
    todayIsoDate: String,
): MetaVideo? =
    nextReleasedEpisodeAfter(
        seasonNumber = completedEntry.seasonNumber,
        episodeNumber = completedEntry.episodeNumber,
        todayIsoDate = todayIsoDate,
    )

internal fun MetaDetails.nextReleasedEpisodeAfter(
    seasonNumber: Int?,
    episodeNumber: Int?,
    todayIsoDate: String,
): MetaVideo? {
    return nextReleasedEpisodeAfter(
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        todayIsoDate = todayIsoDate,
        showUnairedNextUp = false,
    )
}

internal fun MetaDetails.nextReleasedEpisodeAfter(
    seasonNumber: Int?,
    episodeNumber: Int?,
    todayIsoDate: String,
    showUnairedNextUp: Boolean,
): MetaVideo? {
    val sortedEpisodes = sortedPlayableEpisodes()
    val watchedVideoId = buildPlaybackVideoId(
        content = WatchingContentRef(type = type, id = id),
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
    )
    var watchedIndex = sortedEpisodes.indexOfFirst { episode ->
        buildPlaybackVideoId(
            content = WatchingContentRef(type = type, id = id),
            seasonNumber = episode.season,
            episodeNumber = episode.episode,
            fallbackVideoId = episode.id,
        ) == watchedVideoId
    }

    // Fallback: if the seed wasn't found by season+episode (anime with absolute
    // numbering on Trakt vs multi-season on addon), try global index matching.
    if (watchedIndex < 0 && seasonNumber != null && episodeNumber != null) {
        val addonSeasons = sortedEpisodes.mapTo(mutableSetOf()) { it.season }
        if (seasonNumber == 1 && addonSeasons.size > 1 && episodeNumber > 0) {
            val globalIndex = episodeNumber - 1
            if (globalIndex in sortedEpisodes.indices) {
                watchedIndex = globalIndex
            }
        }
    }

    if (watchedIndex < 0) return null

    val watchedEpisodeSeason = sortedEpisodes[watchedIndex].season
    val candidates = sortedEpisodes
        .drop(watchedIndex + 1)
        .filter { episode ->
            shouldSurfaceNextEpisode(
                watchedSeasonNumber = watchedEpisodeSeason,
                candidateSeasonNumber = episode.season,
                todayIsoDate = todayIsoDate,
                releasedDate = episode.released,
                showUnairedNextUp = showUnairedNextUp,
            )
        }
    return candidates.firstOrNull { normalizeSeasonNumber(it.season) > 0 }
}

internal data class SeriesPrimaryAction(
    val label: String,
    val videoId: String,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val episodeTitle: String?,
    val episodeThumbnail: String?,
    val resumePositionMs: Long?,
)

internal fun MetaDetails.seriesPrimaryAction(
    entries: List<WatchProgressEntry>,
    watchedItems: List<WatchedItem>,
    todayIsoDate: String,
    preferFurthestEpisode: Boolean = true,
): SeriesPrimaryAction? =
    decideSeriesPrimaryAction(
        content = WatchingContentRef(type = type, id = id),
        episodes = videos.map(MetaVideo::toDomainReleasedEpisode),
        progressRecords = entries.map(WatchProgressEntry::toDomainProgressRecord),
        watchedRecords = watchedItems.map(WatchedItem::toDomainWatchedRecord),
        todayIsoDate = todayIsoDate,
        preferFurthestEpisode = preferFurthestEpisode,
    )?.toLegacySeriesPrimaryAction()

internal fun MetaVideo.playLabel(): String =
    playLabel(seasonNumber = season, episodeNumber = episode)

internal fun MetaVideo.upNextLabel(): String =
    upNextLabel(seasonNumber = season, episodeNumber = episode)

internal fun WatchProgressEntry.resumeLabel(): String =
    resumeLabel(seasonNumber = seasonNumber, episodeNumber = episodeNumber)

internal fun MetaVideo.isReleasedBy(todayIsoDate: String): Boolean =
    isReleasedBy(todayIsoDate = todayIsoDate, releasedDate = released)

internal data class CompletedSeriesEpisode(
    val seasonNumber: Int,
    val episodeNumber: Int,
    val markedAtEpochMs: Long,
)

internal fun latestCompletedSeriesEpisode(
    parentMetaId: String,
    parentMetaType: String,
    progressEntries: List<WatchProgressEntry>,
    watchedItems: List<WatchedItem>,
): CompletedSeriesEpisode? =
    latestCompletedSeriesEpisode(
        content = WatchingContentRef(type = parentMetaType, id = parentMetaId),
        progressRecords = progressEntries.map(WatchProgressEntry::toDomainProgressRecord),
        watchedRecords = watchedItems.map(WatchedItem::toDomainWatchedRecord),
    )?.toLegacyCompletedEpisode()

private fun MetaVideo.toDomainReleasedEpisode(): WatchingReleasedEpisode =
    WatchingReleasedEpisode(
        videoId = id,
        seasonNumber = season,
        episodeNumber = episode,
        title = title,
        thumbnail = thumbnail,
        releasedDate = released,
    )

private fun WatchProgressEntry.toDomainProgressRecord(): WatchingProgressRecord =
    WatchingProgressRecord(
        content = WatchingContentRef(type = parentMetaType, id = parentMetaId),
        videoId = videoId,
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        lastUpdatedEpochMs = lastUpdatedEpochMs,
        lastPositionMs = lastPositionMs,
        isCompleted = isCompleted,
        episodeTitle = episodeTitle,
        episodeThumbnail = episodeThumbnail,
    )

private fun WatchedItem.toDomainWatchedRecord(): WatchingWatchedRecord =
    WatchingWatchedRecord(
        content = WatchingContentRef(type = type, id = id),
        seasonNumber = season,
        episodeNumber = episode,
        markedAtEpochMs = normalizeWatchedMarkedAtEpochMs(markedAtEpochMs),
    )

private fun WatchingSeriesPrimaryAction.toLegacySeriesPrimaryAction(): SeriesPrimaryAction =
    SeriesPrimaryAction(
        label = label,
        videoId = videoId,
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        episodeTitle = episodeTitle,
        episodeThumbnail = episodeThumbnail,
        resumePositionMs = resumePositionMs,
    )

private fun WatchingCompletedEpisode.toLegacyCompletedEpisode(): CompletedSeriesEpisode =
    CompletedSeriesEpisode(
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        markedAtEpochMs = markedAtEpochMs,
    )
