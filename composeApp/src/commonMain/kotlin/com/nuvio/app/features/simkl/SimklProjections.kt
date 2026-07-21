package com.nuvio.app.features.simkl

import com.nuvio.app.features.home.PosterShape
import com.nuvio.app.features.library.LibraryItem
import com.nuvio.app.features.tracking.TrackingEpisode
import com.nuvio.app.features.tracking.TrackingExternalIds
import com.nuvio.app.features.tracking.TrackingMediaKind
import com.nuvio.app.features.tracking.TrackingMediaReference
import com.nuvio.app.features.tracking.extractTrackingYear
import com.nuvio.app.features.tracking.parseTrackingExternalIds
import com.nuvio.app.features.tracking.trackingMediaKind
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.watchedItemKey
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.WatchProgressSourceSimklPlayback
import com.nuvio.app.features.watchprogress.buildPlaybackVideoId

internal const val SIMKL_WATCHLIST_KEY = "simkl:watchlist"
internal const val SIMKL_WATCHLIST_TITLE = "Simkl Watchlist"

internal data class SimklWatchedProjection(
    val items: List<WatchedItem>,
    val fullyWatchedSeriesKeys: Set<String>,
)

internal fun SimklSyncSnapshot.toSimklLibraryItems(): List<LibraryItem> =
    entries
        .asSequence()
        .filter { entry -> entry.status == SimklListStatus.PLAN_TO_WATCH }
        .mapNotNull { entry -> entry.toLibraryItem(lastSyncedAtEpochMs) }
        .sortedByDescending(LibraryItem::savedAtEpochMs)
        .toList()

internal fun SimklSyncSnapshot.toSimklWatchedProjection(): SimklWatchedProjection {
    val watchedItems = mutableListOf<WatchedItem>()
    val fullyWatched = linkedSetOf<String>()

    entries.forEach { entry ->
        val media = entry.media ?: return@forEach
        val contentId = media.canonicalContentId() ?: return@forEach
        val contentType = if (entry.mediaType == SimklMediaType.MOVIES) "movie" else "series"
        val title = media.title?.takeIf(String::isNotBlank) ?: contentId
        val poster = simklPosterUrl(media.poster)
        val lastWatchedAt = parseSimklUtcEpochMs(entry.lastWatchedAt)
            ?: parseSimklUtcEpochMs(entry.addedToWatchlistAt)
            ?: 0L

        if (entry.mediaType == SimklMediaType.MOVIES) {
            if (entry.lastWatchedAt != null || entry.status == SimklListStatus.COMPLETED) {
                watchedItems += WatchedItem(
                    id = contentId,
                    type = contentType,
                    name = title,
                    poster = poster,
                    releaseInfo = media.year?.toString(),
                    markedAtEpochMs = lastWatchedAt,
                )
            }
            return@forEach
        }

        var hasEpisodeHistory = false
        entry.seasons.forEach seasonLoop@{ season ->
            val seasonNumber = season.number ?: return@seasonLoop
            season.episodes.forEach episodeLoop@{ episode ->
                val episodeNumber = episode.number ?: return@episodeLoop
                val watchedAt = parseSimklUtcEpochMs(episode.watchedAt) ?: return@episodeLoop
                hasEpisodeHistory = true
                watchedItems += WatchedItem(
                    id = contentId,
                    type = contentType,
                    name = title,
                    poster = poster,
                    releaseInfo = media.year?.toString(),
                    season = seasonNumber,
                    episode = episodeNumber,
                    markedAtEpochMs = watchedAt,
                )
            }
        }

        if (entry.status == SimklListStatus.COMPLETED) {
            fullyWatched += watchedItemKey(contentType, contentId)
            if (!hasEpisodeHistory) {
                watchedItems += WatchedItem(
                    id = contentId,
                    type = contentType,
                    name = title,
                    poster = poster,
                    releaseInfo = media.year?.toString(),
                    markedAtEpochMs = lastWatchedAt,
                )
            }
        }
    }

    val newestByKey = watchedItems
        .groupBy { item -> watchedItemKey(item.type, item.id, item.season, item.episode) }
        .mapNotNull { (_, candidates) -> candidates.maxByOrNull(WatchedItem::markedAtEpochMs) }
        .sortedByDescending(WatchedItem::markedAtEpochMs)
    return SimklWatchedProjection(
        items = newestByKey,
        fullyWatchedSeriesKeys = fullyWatched,
    )
}

internal fun SimklSyncSnapshot.toSimklProgressEntries(): List<WatchProgressEntry> =
    playback
        .mapNotNull(SimklPlaybackSession::toWatchProgressEntry)
        .groupBy(WatchProgressEntry::progressKey)
        .mapNotNull { (_, candidates) -> candidates.maxByOrNull(WatchProgressEntry::lastUpdatedEpochMs) }
        .sortedByDescending(WatchProgressEntry::lastUpdatedEpochMs)

internal fun SimklSyncSnapshot.mediaReference(
    contentId: String,
    contentType: String,
    title: String? = null,
    releaseInfo: String? = null,
    season: Int? = null,
    episode: Int? = null,
    episodeTitle: String? = null,
): TrackingMediaReference {
    val entry = entries.firstOrNull { candidate -> candidate.matchesContentId(contentId) }
    val media = entry?.media
    val parsedIds = parseTrackingExternalIds(contentId)
    val ids = media?.toTrackingExternalIds()?.mergeMissing(parsedIds) ?: parsedIds
    val kind = when (entry?.mediaType) {
        SimklMediaType.MOVIES -> TrackingMediaKind.MOVIE
        SimklMediaType.ANIME -> TrackingMediaKind.ANIME
        SimklMediaType.SHOWS -> TrackingMediaKind.SHOW
        null -> trackingMediaKind(contentType, ids)
    }
    return TrackingMediaReference(
        kind = kind,
        title = media?.title?.takeIf(String::isNotBlank) ?: title?.takeIf(String::isNotBlank),
        year = media?.year ?: extractTrackingYear(releaseInfo),
        ids = ids,
        episode = episode?.let { number ->
            TrackingEpisode(season = season, number = number, title = episodeTitle)
        },
    )
}

internal fun SimklMedia.toTrackingExternalIds(): TrackingExternalIds = TrackingExternalIds(
    simkl = ids.simklIdValue()?.toLongOrNull(),
    imdb = ids.idValue("imdb"),
    tmdb = ids.idValue("tmdb")?.toLongOrNull(),
    tvdb = ids.idValue("tvdb"),
    mal = ids.idValue("mal")?.toLongOrNull(),
    anidb = ids.idValue("anidb")?.toLongOrNull(),
    anilist = ids.idValue("anilist")?.toLongOrNull(),
    kitsu = ids.idValue("kitsu")?.toLongOrNull(),
)

internal fun SimklMedia.canonicalContentId(): String? = when {
    !ids.idValue("imdb").isNullOrBlank() -> ids.idValue("imdb")
    !ids.idValue("tmdb").isNullOrBlank() -> "tmdb:${ids.idValue("tmdb")}"
    !ids.idValue("tvdb").isNullOrBlank() -> "tvdb:${ids.idValue("tvdb")}"
    !ids.idValue("mal").isNullOrBlank() -> "mal:${ids.idValue("mal")}"
    !ids.idValue("anidb").isNullOrBlank() -> "anidb:${ids.idValue("anidb")}"
    !ids.idValue("anilist").isNullOrBlank() -> "anilist:${ids.idValue("anilist")}"
    !ids.idValue("kitsu").isNullOrBlank() -> "kitsu:${ids.idValue("kitsu")}"
    !ids.simklIdValue().isNullOrBlank() -> "simkl:${ids.simklIdValue()}"
    else -> null
}

internal fun simklPosterUrl(path: String?): String? =
    path
        ?.trim()
        ?.trim('/')
        ?.takeIf(String::isNotBlank)
        ?.let { normalized -> "https://wsrv.nl/?url=https://simkl.in/posters/${normalized}_w.webp&q=90" }

internal fun buildSimklSourceUrl(mediaType: SimklMediaType, media: SimklMedia): String? {
    val id = media.ids.simklIdValue()?.toLongOrNull()?.takeIf { it > 0L } ?: return null
    val category = when (mediaType) {
        SimklMediaType.MOVIES -> "movies"
        SimklMediaType.SHOWS -> "tv"
        SimklMediaType.ANIME -> "anime"
    }
    val slug = media.ids.idValue("slug")
        ?.trim()
        ?.trim('/')
        ?.takeIf { value -> value.isNotBlank() && value.all { it.isLetterOrDigit() || it in "-_." } }
    return if (slug == null) {
        "https://simkl.com/$category/$id"
    } else {
        "https://simkl.com/$category/$id/$slug"
    }
}

internal fun parseSimklUtcEpochMs(value: String?): Long? {
    val match = value?.trim()?.let(SIMKL_UTC_PATTERN::matchEntire) ?: return null
    val year = match.groupValues[1].toIntOrNull() ?: return null
    val month = match.groupValues[2].toIntOrNull() ?: return null
    val day = match.groupValues[3].toIntOrNull() ?: return null
    val hour = match.groupValues[4].toIntOrNull() ?: return null
    val minute = match.groupValues[5].toIntOrNull() ?: return null
    val second = match.groupValues[6].toIntOrNull() ?: return null
    val millis = match.groupValues[7].padEnd(3, '0').take(3).toIntOrNull() ?: 0
    if (year < 1970 || month !in 1..12 || hour !in 0..23 || minute !in 0..59 || second !in 0..59) return null
    val monthDays = daysInMonths(year)
    if (day !in 1..monthDays[month - 1]) return null

    var days = 0L
    for (currentYear in 1970 until year) days += if (currentYear.isLeapYear()) 366L else 365L
    for (monthIndex in 0 until month - 1) days += monthDays[monthIndex]
    days += day - 1L
    return (((days * 24L + hour) * 60L + minute) * 60L + second) * 1_000L + millis
}

private fun SimklLibraryEntry.toLibraryItem(lastSyncedAtEpochMs: Long?): LibraryItem? {
    val media = media ?: return null
    val contentId = media.canonicalContentId() ?: return null
    val simklId = media.ids.simklIdValue()?.toLongOrNull()
    return LibraryItem(
        id = contentId,
        type = if (mediaType == SimklMediaType.MOVIES) "movie" else "series",
        name = media.title?.takeIf(String::isNotBlank) ?: contentId,
        poster = simklPosterUrl(media.poster),
        releaseInfo = media.year?.toString(),
        posterShape = PosterShape.Poster,
        listKeys = setOf(SIMKL_WATCHLIST_KEY),
        imdbId = media.ids.idValue("imdb"),
        tmdbId = media.ids.idValue("tmdb")?.toIntOrNull(),
        trackingProviderId = "simkl",
        trackingProviderItemId = simklId?.let { "simkl:$it" },
        trackingSourceUrl = buildSimklSourceUrl(mediaType, media),
        savedAtEpochMs = parseSimklUtcEpochMs(addedToWatchlistAt)
            ?: lastSyncedAtEpochMs
            ?: 0L,
    )
}

private fun SimklPlaybackSession.toWatchProgressEntry(): WatchProgressEntry? {
    val media = media ?: return null
    val parentId = media.canonicalContentId() ?: return null
    val isMovie = mediaType == SimklMediaType.MOVIES
    val season = episode?.tvdbSeason ?: episode?.season
    val episodeNumber = episode?.tvdbNumber ?: episode?.number
    if (!isMovie && episodeNumber == null) return null
    val videoId = if (isMovie) {
        parentId
    } else {
        buildPlaybackVideoId(
            parentMetaId = parentId,
            seasonNumber = season,
            episodeNumber = episodeNumber,
        )
    }
    val normalizedProgress = progress.coerceIn(0.0, 100.0)
    val durationMs = media.runtime?.takeIf { it > 0 }?.toLong()?.times(60_000L) ?: 0L
    val positionMs = if (durationMs > 0L) (durationMs * normalizedProgress / 100.0).toLong() else 0L
    val updatedAt = parseSimklUtcEpochMs(pausedAt)
        ?: parseSimklUtcEpochMs(watchedAt)
        ?: 0L
    return WatchProgressEntry(
        contentType = if (isMovie) "movie" else "series",
        parentMetaId = parentId,
        parentMetaType = if (isMovie) "movie" else "series",
        videoId = videoId,
        title = media.title?.takeIf(String::isNotBlank) ?: parentId,
        poster = simklPosterUrl(media.poster),
        seasonNumber = season,
        episodeNumber = episodeNumber,
        episodeTitle = episode?.title,
        lastPositionMs = positionMs,
        durationMs = durationMs,
        lastUpdatedEpochMs = updatedAt,
        isCompleted = normalizedProgress >= SIMKL_WATCHED_THRESHOLD_PERCENT,
        progressPercent = normalizedProgress.toFloat(),
        source = WatchProgressSourceSimklPlayback,
        progressKey = id?.let { "simkl-playback:$it" }
            ?: "simkl-playback:$parentId:${season ?: -1}:${episodeNumber ?: -1}",
    )
}

private fun SimklLibraryEntry.matchesContentId(contentId: String): Boolean {
    val media = media ?: return false
    if (media.canonicalContentId().equals(contentId, ignoreCase = true)) return true
    val parsed = parseTrackingExternalIds(contentId)
    val candidateIds = media.toTrackingExternalIds()
    return (parsed.simkl != null && parsed.simkl == candidateIds.simkl) ||
        (!parsed.imdb.isNullOrBlank() && parsed.imdb.equals(candidateIds.imdb, ignoreCase = true)) ||
        (parsed.tmdb != null && parsed.tmdb == candidateIds.tmdb) ||
        (!parsed.tvdb.isNullOrBlank() && parsed.tvdb.equals(candidateIds.tvdb, ignoreCase = true)) ||
        (parsed.mal != null && parsed.mal == candidateIds.mal) ||
        (parsed.anidb != null && parsed.anidb == candidateIds.anidb) ||
        (parsed.anilist != null && parsed.anilist == candidateIds.anilist) ||
        (parsed.kitsu != null && parsed.kitsu == candidateIds.kitsu)
}

private fun Int.isLeapYear(): Boolean = (this % 4 == 0 && this % 100 != 0) || this % 400 == 0

private fun daysInMonths(year: Int): IntArray = if (year.isLeapYear()) {
    intArrayOf(31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
} else {
    intArrayOf(31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
}

private val SIMKL_UTC_PATTERN = Regex(
    "^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,9}))?Z$",
    RegexOption.IGNORE_CASE,
)

private const val SIMKL_WATCHED_THRESHOLD_PERCENT = 80.0
