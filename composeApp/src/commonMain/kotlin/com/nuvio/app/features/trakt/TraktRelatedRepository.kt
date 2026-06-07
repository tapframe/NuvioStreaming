package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.home.PosterShape
import com.nuvio.app.features.tmdb.TmdbService
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.math.roundToInt

private const val BASE_URL = "https://api.trakt.tv"
private const val RELATED_LIMIT = 20
private const val RELATED_CACHE_TTL_MS = 10 * 60_000L

object TraktRelatedRepository {
    private val log = Logger.withTag("TraktRelated")
    private val json = Json { ignoreUnknownKeys = true }
    private val cacheMutex = Mutex()
    private val cache = mutableMapOf<String, TimedCache>()

    suspend fun getRelated(
        meta: MetaDetails,
        fallbackItemId: String? = null,
        fallbackItemType: String? = null,
        forceRefresh: Boolean = false,
    ): List<MetaPreview> {
        val headers = TraktAuthRepository.authorizedHeaders() ?: return emptyList()
        val target = resolveRelatedTarget(
            meta = meta,
            fallbackItemId = fallbackItemId,
            fallbackItemType = fallbackItemType,
            headers = headers,
        ) ?: return emptyList()
        val cacheKey = "${target.type.apiValue}|${target.pathId}"

        if (forceRefresh) {
            cacheMutex.withLock { cache.remove(cacheKey) }
        }

        if (!forceRefresh) {
            cacheMutex.withLock {
                cache[cacheKey]?.let { cached ->
                    if (TraktPlatformClock.nowEpochMs() - cached.updatedAtMs <= RELATED_CACHE_TTL_MS) {
                        return cached.items
                    }
                }
            }
        }

        val items = fetchRelated(target = target, headers = headers)
            .distinctBy { it.stableRelatedKey() }
            .take(RELATED_LIMIT)

        cacheMutex.withLock {
            cache[cacheKey] = TimedCache(
                items = items,
                updatedAtMs = TraktPlatformClock.nowEpochMs(),
            )
        }
        return items
    }

    fun clearCache() {
        cache.clear()
    }

    private suspend fun fetchRelated(
        target: ResolvedRelatedTarget,
        headers: Map<String, String>,
    ): List<MetaPreview> {
        val endpoint = when (target.type) {
            TraktRelatedType.MOVIE -> "movies"
            TraktRelatedType.SHOW -> "shows"
        }
        val response = httpRequestRaw(
            method = "GET",
            url = buildTraktUrl("$endpoint/${target.pathId}/related", mapOf("extended" to "full,images")),
            headers = jsonHeaders(headers),
            body = "",
        )

        if (response.status == 404) return emptyList()
        if (response.status !in 200..299) {
            error("Failed to load Trakt related titles (${response.status})")
        }

        return when (target.type) {
            TraktRelatedType.MOVIE -> json.decodeFromString<List<TraktRelatedMovieDto>>(response.body)
                .mapNotNull { it.toMetaPreview() }
            TraktRelatedType.SHOW -> json.decodeFromString<List<TraktRelatedShowDto>>(response.body)
                .mapNotNull { it.toMetaPreview() }
        }
    }

    private suspend fun resolveRelatedTarget(
        meta: MetaDetails,
        fallbackItemId: String?,
        fallbackItemType: String?,
        headers: Map<String, String>,
    ): ResolvedRelatedTarget? {
        val type = resolveRelatedType(meta = meta, fallbackItemType = fallbackItemType) ?: return null
        resolveDirectPathId(meta.id)?.let { return ResolvedRelatedTarget(type, it) }
        resolveDirectPathId(fallbackItemId)?.let { return ResolvedRelatedTarget(type, it) }

        val tmdbId = resolveTmdbCandidate(meta.id)
            ?: resolveTmdbCandidate(fallbackItemId)
            ?: TmdbService.ensureTmdbId(meta.id, meta.type)?.toIntOrNull()
            ?: fallbackItemId?.let { TmdbService.ensureTmdbId(it, fallbackItemType ?: meta.type) }?.toIntOrNull()
            ?: return null

        return resolveViaTraktSearch(type = type, tmdbId = tmdbId, headers = headers)
    }

    private fun resolveRelatedType(meta: MetaDetails, fallbackItemType: String?): TraktRelatedType? {
        return when (normalizeRelatedType(meta.type)) {
            TraktRelatedType.MOVIE -> TraktRelatedType.MOVIE
            TraktRelatedType.SHOW -> TraktRelatedType.SHOW
            null -> normalizeRelatedType(fallbackItemType)
        }
    }

    private fun normalizeRelatedType(value: String?): TraktRelatedType? =
        when (value?.trim()?.lowercase()) {
            "movie", "film" -> TraktRelatedType.MOVIE
            "series", "show", "tv", "tvshow" -> TraktRelatedType.SHOW
            else -> null
        }

    private fun resolveDirectPathId(value: String?): String? {
        val raw = value?.trim().orEmpty()
        if (raw.isBlank()) return null
        extractImdbId(raw)?.let { return it }
        parseTraktContentIds(raw).trakt?.let { return it.toString() }
        return raw
            .takeIf { !it.startsWith("tmdb:", ignoreCase = true) }
            ?.takeIf { it.all(Char::isDigit) }
    }

    private fun resolveTmdbCandidate(value: String?): Int? =
        parseTraktContentIds(value).tmdb ?: extractTmdbId(value)

    private suspend fun resolveViaTraktSearch(
        type: TraktRelatedType,
        tmdbId: Int,
        headers: Map<String, String>,
    ): ResolvedRelatedTarget? {
        val response = runCatching {
            httpRequestRaw(
                method = "GET",
                url = buildTraktUrl(
                    endpoint = "search/tmdb/$tmdbId",
                    query = mapOf("type" to type.apiValue),
                ),
                headers = jsonHeaders(headers),
                body = "",
            )
        }.onFailure { error ->
            log.w(error) { "TMDB to Trakt lookup failed for tmdbId=$tmdbId" }
        }.getOrNull() ?: return null

        if (response.status == 404) return null
        if (response.status !in 200..299) {
            log.w { "Failed to resolve Trakt id for tmdbId=$tmdbId (${response.status})" }
            return null
        }

        val results = runCatching {
            json.decodeFromString<List<TraktRelatedSearchResultDto>>(response.body)
        }.getOrDefault(emptyList())
        val match = results.firstOrNull { it.type.equals(type.apiValue, ignoreCase = true) }
        val ids = when (type) {
            TraktRelatedType.MOVIE -> match?.movie?.ids
            TraktRelatedType.SHOW -> match?.show?.ids
        }
        return ids?.bestPathId()?.let { ResolvedRelatedTarget(type, it) }
    }

    private fun buildTraktUrl(endpoint: String, query: Map<String, String> = emptyMap()): String {
        val queryString = (query + mapOf("page" to "1", "limit" to RELATED_LIMIT.toString()))
            .entries
            .filter { (_, value) -> value.isNotBlank() }
            .joinToString("&") { (key, value) ->
                "${key.encodeURLParameter()}=${value.encodeURLParameter()}"
            }
        return "$BASE_URL/${endpoint.trim('/')}" + if (queryString.isBlank()) "" else "?$queryString"
    }

    private fun jsonHeaders(headers: Map<String, String>): Map<String, String> =
        mapOf("Accept" to "application/json") + headers
}

private data class TimedCache(
    val items: List<MetaPreview>,
    val updatedAtMs: Long,
)

private enum class TraktRelatedType(val apiValue: String) {
    MOVIE("movie"),
    SHOW("show"),
}

private data class ResolvedRelatedTarget(
    val type: TraktRelatedType,
    val pathId: String,
)

@Serializable
private data class TraktRelatedSearchResultDto(
    val type: String? = null,
    val movie: TraktRelatedSearchItemDto? = null,
    val show: TraktRelatedSearchItemDto? = null,
)

@Serializable
private data class TraktRelatedSearchItemDto(
    val ids: TraktExternalIds? = null,
)

@Serializable
private data class TraktRelatedMovieDto(
    val title: String? = null,
    @SerialName("original_title") val originalTitle: String? = null,
    val year: Int? = null,
    val ids: TraktExternalIds? = null,
    val overview: String? = null,
    val released: String? = null,
    val rating: Double? = null,
    val genres: List<String>? = null,
    val images: TraktImagesDto? = null,
)

@Serializable
private data class TraktRelatedShowDto(
    val title: String? = null,
    @SerialName("original_title") val originalTitle: String? = null,
    val year: Int? = null,
    val ids: TraktExternalIds? = null,
    val overview: String? = null,
    @SerialName("first_aired") val firstAired: String? = null,
    val rating: Double? = null,
    val genres: List<String>? = null,
    val images: TraktImagesDto? = null,
)

private fun TraktRelatedMovieDto.toMetaPreview(): MetaPreview? {
    val normalizedTitle = title?.trim()?.takeIf(String::isNotBlank)
        ?: originalTitle?.trim()?.takeIf(String::isNotBlank)
        ?: return null
    val contentId = normalizeTraktContentId(ids, fallback = fallbackTraktContentId(ids, "movie"))
    if (contentId.isBlank()) return null

    return MetaPreview(
        id = contentId,
        type = "movie",
        name = normalizedTitle,
        poster = images.traktBestPosterUrl(),
        banner = images.traktBestBackdropUrl(),
        logo = images.traktBestLogoUrl(),
        posterShape = PosterShape.Poster,
        description = overview?.trim()?.takeIf(String::isNotBlank),
        releaseInfo = year?.toString() ?: released?.take(4),
        rawReleaseDate = released,
        imdbRating = rating?.formatTraktRating(),
        genres = genres.orEmpty(),
    )
}

private fun TraktRelatedShowDto.toMetaPreview(): MetaPreview? {
    val normalizedTitle = title?.trim()?.takeIf(String::isNotBlank)
        ?: originalTitle?.trim()?.takeIf(String::isNotBlank)
        ?: return null
    val contentId = normalizeTraktContentId(ids, fallback = fallbackTraktContentId(ids, "series"))
    if (contentId.isBlank()) return null

    return MetaPreview(
        id = contentId,
        type = "series",
        name = normalizedTitle,
        poster = images.traktBestPosterUrl(),
        banner = images.traktBestBackdropUrl(),
        logo = images.traktBestLogoUrl(),
        posterShape = PosterShape.Poster,
        description = overview?.trim()?.takeIf(String::isNotBlank),
        releaseInfo = year?.toString() ?: firstAired?.take(4),
        rawReleaseDate = firstAired,
        imdbRating = rating?.formatTraktRating(),
        genres = genres.orEmpty(),
    )
}

private fun fallbackTraktContentId(ids: TraktExternalIds?, typePrefix: String): String? =
    ids?.slug?.takeIf { it.isNotBlank() }?.let { "$typePrefix:$it" }
        ?: ids?.trakt?.let { "trakt:$it" }

private fun TraktExternalIds.bestPathId(): String? =
    imdb?.takeIf { it.isNotBlank() }
        ?: trakt?.toString()
        ?: slug?.takeIf { it.isNotBlank() }

private fun MetaPreview.stableRelatedKey(): String = "$type:$id"

private fun extractImdbId(value: String?): String? =
    value
        ?.trim()
        ?.split(':', '/', '?', '&')
        ?.firstOrNull { part -> part.startsWith("tt", ignoreCase = true) }
        ?.takeIf { it.length > 2 }

private fun extractTmdbId(value: String?): Int? {
    val trimmed = value?.trim().orEmpty()
    if (trimmed.isBlank()) return null
    return trimmed
        .takeIf { it.startsWith("tmdb:", ignoreCase = true) }
        ?.substringAfter(':')
        ?.substringBefore(':')
        ?.substringBefore('/')
        ?.toIntOrNull()
}

private fun Double.formatTraktRating(): String =
    ((this * 10).roundToInt() / 10.0).toString()
