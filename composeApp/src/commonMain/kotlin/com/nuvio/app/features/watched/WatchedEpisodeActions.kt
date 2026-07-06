package com.nuvio.app.features.watched

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.details.normalizeSeasonNumber
import com.nuvio.app.features.details.sortedPlayableEpisodes
import com.nuvio.app.features.watching.domain.WatchingContentRef
import com.nuvio.app.features.watching.domain.WatchingReleasedEpisode
import com.nuvio.app.features.watching.domain.buildPlaybackVideoId
import com.nuvio.app.features.watching.domain.hasWatchedAllMainSeasonEpisodes as domainHasWatchedAllMainSeasonEpisodes
import com.nuvio.app.features.watching.domain.releasedEpisodes
import com.nuvio.app.features.watching.domain.releasedMainSeasonEpisodes as domainReleasedMainSeasonEpisodes

fun MetaDetails.toSeriesWatchedItem(markedAtEpochMs: Long = 0L): WatchedItem =
    WatchedItem(
        id = id,
        type = type,
        name = name,
        poster = poster,
        releaseInfo = releaseInfo,
        markedAtEpochMs = markedAtEpochMs,
    )

fun MetaDetails.toEpisodeWatchedItem(
    video: MetaVideo,
    markedAtEpochMs: Long = 0L,
): WatchedItem =
    WatchedItem(
        id = id,
        type = type,
        name = video.title.ifBlank { name },
        poster = video.thumbnail ?: background ?: poster,
        releaseInfo = releaseInfo,
        season = video.season,
        episode = video.episode,
        markedAtEpochMs = markedAtEpochMs,
    )

fun MetaDetails.releasedPlayableEpisodes(todayIsoDate: String): List<MetaVideo> {
    val domainEpisodes = releasedEpisodes(
        episodes = sortedPlayableEpisodes().map(MetaVideo::toDomainReleasedEpisode),
        todayIsoDate = todayIsoDate,
    )
    val releasedIds = domainEpisodes.mapTo(linkedSetOf()) { episode -> episode.videoId }
    return sortedPlayableEpisodes().filter { episode -> episode.id in releasedIds }
}

fun MetaDetails.releasedMainSeasonEpisodes(todayIsoDate: String): List<MetaVideo> =
    run {
        val domainEpisodes = domainReleasedMainSeasonEpisodes(
            episodes = sortedPlayableEpisodes().map(MetaVideo::toDomainReleasedEpisode),
            todayIsoDate = todayIsoDate,
        )
        val releasedIds = domainEpisodes.mapTo(linkedSetOf()) { episode -> episode.videoId }
        sortedPlayableEpisodes().filter { episode -> episode.id in releasedIds }
    }

fun MetaDetails.previousReleasedEpisodesBefore(
    target: MetaVideo,
    todayIsoDate: String,
): List<MetaVideo> {
    val targetVideoId = episodePlaybackId(target)
    return releasedPlayableEpisodes(todayIsoDate)
        .takeWhile { episode -> episodePlaybackId(episode) != targetVideoId }
}

fun MetaDetails.releasedEpisodesForSeason(
    seasonNumber: Int?,
    todayIsoDate: String,
): List<MetaVideo> {
    val normalizedSeason = normalizeSeasonNumber(seasonNumber)
    return releasedPlayableEpisodes(todayIsoDate)
        .filter { episode -> normalizeSeasonNumber(episode.season) == normalizedSeason }
}

fun MetaDetails.hasWatchedAllMainSeasonEpisodes(
    todayIsoDate: String,
    isEpisodeWatched: (MetaVideo) -> Boolean,
): Boolean = domainHasWatchedAllMainSeasonEpisodes(
    episodes = sortedPlayableEpisodes().map(MetaVideo::toDomainReleasedEpisode),
    todayIsoDate = todayIsoDate,
    isEpisodeWatched = { domainEpisode ->
        sortedPlayableEpisodes().firstOrNull { episode -> episode.id == domainEpisode.videoId }?.let(isEpisodeWatched) == true
    },
)

fun MetaDetails.episodePlaybackId(video: MetaVideo): String =
    buildPlaybackVideoId(
        content = WatchingContentRef(type = type, id = id),
        seasonNumber = video.season,
        episodeNumber = video.episode,
        fallbackVideoId = video.id,
    )

private fun MetaVideo.toDomainReleasedEpisode(): WatchingReleasedEpisode =
    WatchingReleasedEpisode(
        videoId = id,
        seasonNumber = season,
        episodeNumber = episode,
        title = title,
        thumbnail = thumbnail,
        releasedDate = released,
        available = available,
    )
