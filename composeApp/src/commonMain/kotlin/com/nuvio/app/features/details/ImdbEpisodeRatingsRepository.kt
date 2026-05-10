package com.nuvio.app.features.details

import co.touchlab.kermit.Logger
import com.nuvio.app.features.library.LibraryClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

object ImdbEpisodeRatingsRepository {
    private data class CacheEntry(
        val ratings: Map<Pair<Int, Int>, Double>,
        val expiresAtMs: Long,
    )

    private val log = Logger.withTag("ImdbEpisodeRatingsRepo")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()
    private val cache = mutableMapOf<String, CacheEntry>()
    private val inFlight = mutableMapOf<String, Deferred<Map<Pair<Int, Int>, Double>>>()

    suspend fun getEpisodeRatings(
        imdbId: String?,
        tmdbId: Int?,
    ): Map<Pair<Int, Int>, Double> {
        val normalizedImdbId = normalizeImdbId(imdbId)
        val normalizedTmdbId = tmdbId?.takeIf { it > 0 }
        if (normalizedImdbId == null && normalizedTmdbId == null) return emptyMap()

        val cacheKey = normalizedImdbId?.let { "imdb:$it" } ?: "tmdb:$normalizedTmdbId"
        val now = currentTimeMs()
        mutex.withLock {
            cache[cacheKey]?.let { cached ->
                if (cached.expiresAtMs > now) return cached.ratings
                cache.remove(cacheKey)
            }
        }

        val deferred = mutex.withLock {
            inFlight[cacheKey] ?: scope.async {
                try {
                    fetchEpisodeRatings(
                        imdbId = normalizedImdbId,
                        tmdbId = normalizedTmdbId,
                    ).also { ratings ->
                        mutex.withLock {
                            cache[cacheKey] = CacheEntry(
                                ratings = ratings,
                                expiresAtMs = currentTimeMs() + CACHE_TTL_MS,
                            )
                        }
                    }
                } finally {
                    mutex.withLock {
                        inFlight.remove(cacheKey)
                    }
                }
            }.also { created ->
                inFlight[cacheKey] = created
            }
        }

        return deferred.await()
    }

    fun clearCache() {
        cache.clear()
        inFlight.clear()
    }

    private suspend fun fetchEpisodeRatings(
        imdbId: String?,
        tmdbId: Int?,
    ): Map<Pair<Int, Int>, Double> {
        if (!imdbId.isNullOrBlank()) {
            val primary = toRatingsMap(ImdbTapframeApi.getSeasonRatings(imdbId))
            if (primary.isNotEmpty()) return primary
            log.w { "Primary episode ratings empty for imdbId=$imdbId, trying fallback" }
        }

        if (tmdbId != null) {
            return toRatingsMap(SeriesGraphApi.getSeasonRatings(tmdbId))
        }

        return emptyMap()
    }

    private fun toRatingsMap(payload: List<SeriesGraphSeasonRatingsDto>): Map<Pair<Int, Int>, Double> =
        buildMap {
            payload.forEach { season ->
                season.episodes.orEmpty().forEach { episode ->
                    val seasonNumber = episode.seasonNumber ?: return@forEach
                    val episodeNumber = episode.episodeNumber ?: return@forEach
                    val voteAverage = episode.voteAverage?.takeIf { it > 0.0 } ?: return@forEach
                    put(seasonNumber to episodeNumber, voteAverage)
                }
            }
        }

    private fun normalizeImdbId(value: String?): String? =
        value
            ?.trim()
            ?.substringBefore(':')
            ?.takeIf { it.startsWith("tt", ignoreCase = true) }

    private fun currentTimeMs(): Long = LibraryClock.nowEpochMs()

    private const val CACHE_TTL_MS = 30L * 60L * 1000L
}
