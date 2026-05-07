package com.nuvio.app.features.watching.sync

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetTextWithHeaders
import com.nuvio.app.features.addons.httpPostJsonWithHeaders
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktEpisodeMappingService
import com.nuvio.app.features.trakt.TraktPlatformClock
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.normalizeWatchedMarkedAtEpochMs
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val BASE_URL = "https://api.trakt.tv"


object TraktWatchedSyncAdapter : WatchedSyncAdapter {
    private val log = Logger.withTag("TraktWatchedSync")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
        explicitNulls = false
    }

    // ── pull ────────────────────────────────────────────────────────────
    override suspend fun pull(
        profileId: Int,
        pageSize: Int,
    ): List<WatchedItem> {
        val headers = TraktAuthRepository.authorizedHeaders() ?: return emptyList()

        val (moviesPayload, showsPayload) = coroutineScope {
            val movies = async {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/watched/movies",
                    headers = headers,
                )
            }
            val shows = async {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/watched/shows",
                    headers = headers,
                )
            }
            movies.await() to shows.await()
        }

        val movieItems = runCatching {
            json.decodeFromString<List<TraktWatchedMovieDto>>(moviesPayload)
        }.getOrDefault(emptyList())

        val showItems = runCatching {
            json.decodeFromString<List<TraktWatchedShowDto>>(showsPayload)
        }.getOrDefault(emptyList())

        val result = mutableListOf<WatchedItem>()

        movieItems.forEach { item ->
            val movie = item.movie ?: return@forEach
            val id = normalizeId(movie.ids) ?: return@forEach
            result += WatchedItem(
                id = id,
                type = "movie",
                name = movie.title ?: id,
                season = null,
                episode = null,
                markedAtEpochMs = rankedTimestamp(item.lastWatchedAt),
            )
        }

        showItems.forEach { item ->
            val show = item.show ?: return@forEach
            val showId = normalizeId(show.ids) ?: return@forEach
            val showName = show.title ?: showId

            // Add per-episode watched entries
            item.seasons.orEmpty().forEach seasonLoop@{ season ->
                val seasonNumber = season.number ?: return@seasonLoop
                season.episodes.orEmpty().forEach episodeLoop@{ episode ->
                    val episodeNumber = episode.number ?: return@episodeLoop
                    result += WatchedItem(
                        id = showId,
                        type = "series",
                        name = showName,
                        season = seasonNumber,
                        episode = episodeNumber,
                        markedAtEpochMs = rankedTimestamp(episode.lastWatchedAt ?: item.lastWatchedAt),
                    )
                }
            }
        }

        // Apply reverse mapping for anime: if Trakt uses absolute numbering (S1E1..S1EN)
        // but addon uses multi-season, remap pulled episodes to addon numbering.
        val remappedResult = mutableListOf<WatchedItem>()
        for (item in result) {
            if (item.season == null || item.episode == null || item.type != "series") {
                remappedResult += item
                continue
            }
            val mapped = runCatching {
                TraktEpisodeMappingService.resolveAddonEpisodeMapping(
                    contentId = item.id,
                    contentType = item.type,
                    season = item.season,
                    episode = item.episode,
                )
            }.getOrNull()
            if (mapped != null && (mapped.season != item.season || mapped.episode != item.episode)) {
                remappedResult += item.copy(season = mapped.season, episode = mapped.episode)
            } else {
                remappedResult += item
            }
        }

        return remappedResult
    }

    // ── push (add to history) ───────────────────────────────────────────
    override suspend fun push(
        profileId: Int,
        items: Collection<WatchedItem>,
    ) {
        if (items.isEmpty()) return
        val headers = TraktAuthRepository.authorizedHeaders() ?: return

        val movies = mutableListOf<TraktHistoryMovieRequestDto>()
        val shows = mutableListOf<TraktHistoryShowRequestDto>()

        items.forEach { item ->
            if (!item.shouldSyncToTraktHistory()) return@forEach

            val ids = parseIds(item.id) ?: return@forEach
            val normalizedType = item.type.trim().lowercase()

            if (normalizedType == "movie" || normalizedType == "film") {
                movies += TraktHistoryMovieRequestDto(
                    title = item.name.takeIf { it.isNotBlank() },
                    year = parseYear(item.releaseInfo),
                    ids = ids,
                    watchedAt = if (item.markedAtEpochMs > 0) epochMsToIso(item.markedAtEpochMs) else null,
                )
            } else if (item.season != null && item.episode != null) {
                // Episode-level mark → attach to show with specific season/episode
                val existing = shows.firstOrNull { it.ids == ids }
                if (existing != null) {
                    // Append episode to existing show entry
                    val seasonDto = existing.seasons?.firstOrNull { it.number == item.season }
                    if (seasonDto != null) {
                        (seasonDto.episodes as? MutableList)?.add(
                            TraktHistoryEpisodeRequestDto(
                                number = item.episode,
                                watchedAt = if (item.markedAtEpochMs > 0) epochMsToIso(item.markedAtEpochMs) else null,
                            ),
                        )
                    } else {
                        (existing.seasons as? MutableList)?.add(
                            TraktHistorySeasonRequestDto(
                                number = item.season,
                                episodes = mutableListOf(
                                    TraktHistoryEpisodeRequestDto(
                                        number = item.episode,
                                        watchedAt = if (item.markedAtEpochMs > 0) epochMsToIso(item.markedAtEpochMs) else null,
                                    ),
                                ),
                            ),
                        )
                    }
                } else {
                    shows += TraktHistoryShowRequestDto(
                        title = item.name.takeIf { it.isNotBlank() },
                        year = parseYear(item.releaseInfo),
                        ids = ids,
                        seasons = mutableListOf(
                            TraktHistorySeasonRequestDto(
                                number = item.season,
                                episodes = mutableListOf(
                                    TraktHistoryEpisodeRequestDto(
                                        number = item.episode,
                                        watchedAt = if (item.markedAtEpochMs > 0) epochMsToIso(item.markedAtEpochMs) else null,
                                    ),
                                ),
                            ),
                        ),
                    )
                }
            }
        }

        if (movies.isEmpty() && shows.isEmpty()) return

        val body = json.encodeToString(
            TraktHistoryAddRequestDto(
                movies = movies.takeIf { it.isNotEmpty() },
                shows = shows.takeIf { it.isNotEmpty() },
            ),
        )

        val responseText = runCatching {
            httpPostJsonWithHeaders(
                url = "$BASE_URL/sync/history",
                body = body,
                headers = headers,
            )
        }.onFailure { e ->
            if (e is CancellationException) throw e
            log.w { "Failed to push watched items to Trakt: ${e.message}" }
        }.getOrNull()

        // Retry with remapped numbering for episodes that Trakt didn't recognize
        // (anime with different season structures between addon and Trakt).
        if (responseText != null && shows.isNotEmpty()) {
            val episodeItems = items.filter {
                it.season != null && it.episode != null &&
                    it.type.trim().lowercase() !in listOf("movie", "film")
            }
            if (episodeItems.isNotEmpty()) {
                retryWithRemappedEpisodes(headers, episodeItems)
            }
        }
    }

    private suspend fun retryWithRemappedEpisodes(
        headers: Map<String, String>,
        items: Collection<WatchedItem>,
    ) {
        val remappedShows = mutableListOf<TraktHistoryShowRequestDto>()

        for (item in items) {
            val season = item.season ?: continue
            val episode = item.episode ?: continue
            val mapped = TraktEpisodeMappingService.resolveEpisodeMapping(
                contentId = item.id,
                contentType = item.type,
                videoId = null,
                season = season,
                episode = episode,
            ) ?: continue
            if (mapped.season == season && mapped.episode == episode) continue

            val ids = parseIds(item.id) ?: continue
            val existing = remappedShows.firstOrNull { it.ids == ids }
            if (existing != null) {
                val seasonDto = existing.seasons?.firstOrNull { it.number == mapped.season }
                if (seasonDto != null) {
                    (seasonDto.episodes as? MutableList)?.add(
                        TraktHistoryEpisodeRequestDto(
                            number = mapped.episode,
                            watchedAt = if (item.markedAtEpochMs > 0) epochMsToIso(item.markedAtEpochMs) else null,
                        ),
                    )
                } else {
                    (existing.seasons as? MutableList)?.add(
                        TraktHistorySeasonRequestDto(
                            number = mapped.season,
                            episodes = mutableListOf(
                                TraktHistoryEpisodeRequestDto(
                                    number = mapped.episode,
                                    watchedAt = if (item.markedAtEpochMs > 0) epochMsToIso(item.markedAtEpochMs) else null,
                                ),
                            ),
                        ),
                    )
                }
            } else {
                remappedShows += TraktHistoryShowRequestDto(
                    title = item.name.takeIf { it.isNotBlank() },
                    year = parseYear(item.releaseInfo),
                    ids = ids,
                    seasons = mutableListOf(
                        TraktHistorySeasonRequestDto(
                            number = mapped.season,
                            episodes = mutableListOf(
                                TraktHistoryEpisodeRequestDto(
                                    number = mapped.episode,
                                    watchedAt = if (item.markedAtEpochMs > 0) epochMsToIso(item.markedAtEpochMs) else null,
                                ),
                            ),
                        ),
                    ),
                )
            }
        }

        if (remappedShows.isEmpty()) return

        val retryBody = json.encodeToString(
            TraktHistoryAddRequestDto(
                movies = null,
                shows = remappedShows,
            ),
        )

        runCatching {
            httpPostJsonWithHeaders(
                url = "$BASE_URL/sync/history",
                body = retryBody,
                headers = headers,
            )
        }.onFailure { e ->
            if (e is CancellationException) throw e
            log.w { "Failed to push remapped episodes to Trakt: ${e.message}" }
        }
    }

    // ── delete (remove from history) ────────────────────────────────────
    override suspend fun delete(
        profileId: Int,
        items: Collection<WatchedItem>,
    ) {
        if (items.isEmpty()) return
        val headers = TraktAuthRepository.authorizedHeaders() ?: return

        val movies = mutableListOf<TraktHistoryMovieRequestDto>()
        val shows = mutableListOf<TraktHistoryShowRequestDto>()

        items.forEach { item ->
            if (!item.shouldSyncToTraktHistory()) return@forEach

            val ids = parseIds(item.id) ?: return@forEach
            val normalizedType = item.type.trim().lowercase()

            if (normalizedType == "movie" || normalizedType == "film") {
                movies += TraktHistoryMovieRequestDto(
                    title = item.name.takeIf { it.isNotBlank() },
                    year = parseYear(item.releaseInfo),
                    ids = ids,
                )
            } else if (item.season != null && item.episode != null) {
                shows += TraktHistoryShowRequestDto(
                    title = item.name.takeIf { it.isNotBlank() },
                    year = parseYear(item.releaseInfo),
                    ids = ids,
                    seasons = listOf(
                        TraktHistorySeasonRequestDto(
                            number = item.season,
                            episodes = listOf(
                                TraktHistoryEpisodeRequestDto(number = item.episode),
                            ),
                        ),
                    ),
                )
            }
        }

        if (movies.isEmpty() && shows.isEmpty()) return

        val body = json.encodeToString(
            TraktHistoryRemoveRequestDto(
                movies = movies.takeIf { it.isNotEmpty() },
                shows = shows.takeIf { it.isNotEmpty() },
            ),
        )

        runCatching {
            httpPostJsonWithHeaders(
                url = "$BASE_URL/sync/history/remove",
                body = body,
                headers = headers,
            )
        }.onFailure { e ->
            if (e is CancellationException) throw e
            log.w { "Failed to remove watched items from Trakt: ${e.message}" }
        }

        // Retry removal with remapped numbering for anime cases
        val episodeItems = items.filter {
            it.season != null && it.episode != null &&
                it.type.trim().lowercase() !in listOf("movie", "film")
        }
        if (episodeItems.isNotEmpty()) {
            retryDeleteWithRemappedEpisodes(headers, episodeItems)
        }
    }

    private suspend fun retryDeleteWithRemappedEpisodes(
        headers: Map<String, String>,
        items: Collection<WatchedItem>,
    ) {
        val remappedShowDtos = mutableListOf<TraktHistoryShowRequestDto>()

        for (item in items) {
            val season = item.season ?: continue
            val episode = item.episode ?: continue
            val mapped = TraktEpisodeMappingService.resolveEpisodeMapping(
                contentId = item.id,
                contentType = item.type,
                videoId = null,
                season = season,
                episode = episode,
            ) ?: continue
            if (mapped.season == season && mapped.episode == episode) continue

            val ids = parseIds(item.id) ?: continue
            remappedShowDtos += TraktHistoryShowRequestDto(
                title = item.name.takeIf { it.isNotBlank() },
                year = parseYear(item.releaseInfo),
                ids = ids,
                seasons = listOf(
                    TraktHistorySeasonRequestDto(
                        number = mapped.season,
                        episodes = listOf(
                            TraktHistoryEpisodeRequestDto(number = mapped.episode),
                        ),
                    ),
                ),
            )
        }

        if (remappedShowDtos.isEmpty()) return

        val retryBody = json.encodeToString(
            TraktHistoryRemoveRequestDto(
                movies = null,
                shows = remappedShowDtos,
            ),
        )

        runCatching {
            httpPostJsonWithHeaders(
                url = "$BASE_URL/sync/history/remove",
                body = retryBody,
                headers = headers,
            )
        }.onFailure { e ->
            if (e is CancellationException) throw e
            log.w { "Failed to remove remapped episodes from Trakt: ${e.message}" }
        }
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private fun normalizeId(ids: TraktSyncIdsDto?): String? {
        if (ids == null) return null
        ids.imdb?.takeIf { it.isNotBlank() }?.let { return it }
        ids.tmdb?.let { return "tmdb:$it" }
        ids.trakt?.let { return "trakt:$it" }
        return null
    }

    private fun parseIds(rawId: String): TraktSyncIdsDto? {
        val trimmed = rawId.trim()
        if (trimmed.isBlank()) return null

        if (trimmed.startsWith("tt")) {
            return TraktSyncIdsDto(imdb = trimmed.substringBefore(':'))
        }
        if (trimmed.startsWith("tmdb:", ignoreCase = true)) {
            val value = trimmed.substringAfter(':').toIntOrNull() ?: return null
            return TraktSyncIdsDto(tmdb = value)
        }
        if (trimmed.startsWith("trakt:", ignoreCase = true)) {
            val value = trimmed.substringAfter(':').toIntOrNull() ?: return null
            return TraktSyncIdsDto(trakt = value)
        }

        val numeric = trimmed.substringBefore(':').toIntOrNull()
        if (numeric != null) {
            return TraktSyncIdsDto(trakt = numeric)
        }

        return null
    }

    private val yearRegex = Regex("(19|20)\\d{2}")
    private fun parseYear(value: String?): Int? {
        if (value.isNullOrBlank()) return null
        return yearRegex.find(value)?.value?.toIntOrNull()
    }

    private fun rankedTimestamp(isoDate: String?): Long {
        return isoDate
            ?.takeIf { it.isNotBlank() }
            ?.let(TraktPlatformClock::parseIsoDateTimeToEpochMs)
            ?: 0L
    }

    private fun epochMsToIso(epochMs: Long): String {
        val normalizedEpochMs = normalizeWatchedMarkedAtEpochMs(epochMs)
        if (normalizedEpochMs <= 0L) return "unknown"
        if (normalizedEpochMs < 10_000_000_000L) return "unknown"
        // Real epoch ms → simple ISO via arithmetic
        val totalSeconds = normalizedEpochMs / 1000
        val s = (totalSeconds % 60).toInt()
        val m = ((totalSeconds / 60) % 60).toInt()
        val h = ((totalSeconds / 3600) % 24).toInt()
        var days = (totalSeconds / 86400).toInt()

        // Simple Gregorian conversion
        var year = 1970
        while (true) {
            val daysInYear = if (isLeapYear(year)) 366 else 365
            if (days < daysInYear) break
            days -= daysInYear
            year++
        }
        val monthDays = if (isLeapYear(year)) {
            intArrayOf(31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        } else {
            intArrayOf(31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        }
        var month = 0
        while (month < 12 && days >= monthDays[month]) {
            days -= monthDays[month]
            month++
        }
        month += 1
        val day = days + 1

        return "${year.pad4()}-${month.pad2()}-${day.pad2()}T${h.pad2()}:${m.pad2()}:${s.pad2()}.000Z"
    }

    private fun isLeapYear(y: Int): Boolean = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
    private fun Int.pad2(): String = if (this < 10) "0$this" else "$this"
    private fun Int.pad4(): String = "$this".padStart(4, '0')
}

internal fun WatchedItem.shouldSyncToTraktHistory(): Boolean {
    val normalizedType = type.trim().lowercase()
    return normalizedType == "movie" ||
        normalizedType == "film" ||
        (season != null && episode != null)
}

// ── DTOs for pull (GET /sync/watched) ───────────────────────────────────

@Serializable
private data class TraktWatchedMovieDto(
    @SerialName("plays") val plays: Int? = null,
    @SerialName("last_watched_at") val lastWatchedAt: String? = null,
    @SerialName("movie") val movie: TraktSyncMediaDto? = null,
)

@Serializable
private data class TraktWatchedShowDto(
    @SerialName("plays") val plays: Int? = null,
    @SerialName("last_watched_at") val lastWatchedAt: String? = null,
    @SerialName("show") val show: TraktSyncMediaDto? = null,
    @SerialName("seasons") val seasons: List<TraktWatchedSeasonDto>? = null,
)

@Serializable
private data class TraktWatchedSeasonDto(
    @SerialName("number") val number: Int? = null,
    @SerialName("episodes") val episodes: List<TraktWatchedEpisodeDto>? = null,
)

@Serializable
private data class TraktWatchedEpisodeDto(
    @SerialName("number") val number: Int? = null,
    @SerialName("plays") val plays: Int? = null,
    @SerialName("last_watched_at") val lastWatchedAt: String? = null,
)

@Serializable
private data class TraktSyncMediaDto(
    @SerialName("title") val title: String? = null,
    @SerialName("year") val year: Int? = null,
    @SerialName("ids") val ids: TraktSyncIdsDto? = null,
)

@Serializable
private data class TraktSyncIdsDto(
    @SerialName("trakt") val trakt: Int? = null,
    @SerialName("slug") val slug: String? = null,
    @SerialName("imdb") val imdb: String? = null,
    @SerialName("tmdb") val tmdb: Int? = null,
    @SerialName("tvdb") val tvdb: Int? = null,
)

// ── DTOs for push (POST /sync/history) ──────────────────────────────────

@Serializable
private data class TraktHistoryAddRequestDto(
    @SerialName("movies") val movies: List<TraktHistoryMovieRequestDto>? = null,
    @SerialName("shows") val shows: List<TraktHistoryShowRequestDto>? = null,
)

@Serializable
private data class TraktHistoryMovieRequestDto(
    @SerialName("title") val title: String? = null,
    @SerialName("year") val year: Int? = null,
    @SerialName("ids") val ids: TraktSyncIdsDto,
    @SerialName("watched_at") val watchedAt: String? = null,
)

@Serializable
private data class TraktHistoryShowRequestDto(
    @SerialName("title") val title: String? = null,
    @SerialName("year") val year: Int? = null,
    @SerialName("ids") val ids: TraktSyncIdsDto,
    @SerialName("seasons") val seasons: List<TraktHistorySeasonRequestDto>? = null,
)

@Serializable
private data class TraktHistorySeasonRequestDto(
    @SerialName("number") val number: Int,
    @SerialName("episodes") val episodes: List<TraktHistoryEpisodeRequestDto>? = null,
)

@Serializable
private data class TraktHistoryEpisodeRequestDto(
    @SerialName("number") val number: Int,
    @SerialName("watched_at") val watchedAt: String? = null,
)

// ── DTOs for delete (POST /sync/history/remove) ─────────────────────────

@Serializable
private data class TraktHistoryRemoveRequestDto(
    @SerialName("movies") val movies: List<TraktHistoryMovieRequestDto>? = null,
    @SerialName("shows") val shows: List<TraktHistoryShowRequestDto>? = null,
)
