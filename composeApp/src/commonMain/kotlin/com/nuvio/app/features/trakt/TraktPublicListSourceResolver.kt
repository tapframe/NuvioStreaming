package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.RawHttpResponse
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.catalog.CatalogPage
import com.nuvio.app.features.collection.CollectionSource
import com.nuvio.app.features.collection.TmdbCollectionMediaType
import com.nuvio.app.features.collection.TraktListSort
import com.nuvio.app.features.collection.TraktSortHow
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.home.PosterShape
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlin.math.roundToInt

data class TraktPublicListImportMetadata(
    val title: String? = null,
    val coverImageUrl: String? = null,
    val traktListId: Long? = null,
)

data class TraktPublicListSearchResult(
    val traktListId: Long,
    val title: String,
    val subtitle: String,
    val coverImageUrl: String? = null,
    val sortBy: String? = null,
    val sortHow: String? = null,
)

object TraktPublicListSourceResolver {
    const val PAGE_LIMIT = 50

    private const val BASE_URL = "https://api.trakt.tv"
    private const val API_VERSION = "2"

    private val log = Logger.withTag("TraktPublicListSource")
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun resolve(source: CollectionSource, page: Int = 1): CatalogPage = withContext(Dispatchers.Default) {
        val listId = source.traktListId?.takeIf { it > 0L } ?: error("Missing Trakt list ID")
        val mediaType = TmdbCollectionMediaType.fromString(source.mediaType)
        val type = mediaType.toTraktType()
        val sortBy = TraktListSort.normalize(source.sortBy)
        val sortHow = TraktSortHow.normalize(source.sortHow)
        val response = requestRaw(
            endpoint = "lists/$listId/items/$type",
            query = mapOf(
                "extended" to "full,images",
                "page" to page.toString(),
                "limit" to PAGE_LIMIT.toString(),
                "sort_by" to sortBy,
                "sort_how" to sortHow,
            ),
        )
        if (response.status !in 200..299) {
            error(errorMessageFor(response.status, "Could not load Trakt list"))
        }

        val rawItems = json.decodeFromString<List<PublicTraktListItemDto>>(response.body)
        val items = rawItems
            .mapNotNull { it.toPreview(mediaType) }
            .distinctBy { "${it.type}:${it.id}" }
        val pageCount = response.headerInt("x-pagination-page-count") ?: page
        CatalogPage(
            items = items,
            rawItemCount = items.size,
            nextSkip = if (page < pageCount && items.isNotEmpty()) page + 1 else null,
        )
    }

    suspend fun listImportMetadata(input: String): TraktPublicListImportMetadata = withContext(Dispatchers.Default) {
        val idPath = parseTraktListPath(input) ?: error("Enter a valid Trakt list ID or URL")
        val list = requestJson<PublicTraktListSummaryDto>(
            endpoint = "lists/$idPath",
            query = mapOf("extended" to "full,images"),
        )
        val id = list.ids?.trakt ?: idPath.toLongOrNull() ?: error("Trakt list did not include a numeric ID")
        TraktPublicListImportMetadata(
            title = list.name?.takeIf { it.isNotBlank() },
            coverImageUrl = list.images?.posters.firstTraktImageUrl(),
            traktListId = id,
        )
    }

    suspend fun searchPublicLists(query: String): List<TraktPublicListSearchResult> = withContext(Dispatchers.Default) {
        val trimmed = query.trim()
        if (trimmed.isBlank()) return@withContext emptyList()
        requestJson<List<PublicTraktSearchResultDto>>(
            endpoint = "search/list",
            query = mapOf(
                "query" to trimmed,
                "extended" to "full,images",
                "page" to "1",
                "limit" to "20",
            ),
        ).mapNotNull { it.toPublicListResult() }
    }

    suspend fun trendingPublicLists(): List<TraktPublicListSearchResult> =
        loadProminentLists("lists/trending")

    suspend fun popularPublicLists(): List<TraktPublicListSearchResult> =
        loadProminentLists("lists/popular")

    fun parseTraktListId(input: String): Long? =
        parseTraktListPath(input)?.toLongOrNull()

    private suspend fun loadProminentLists(endpoint: String): List<TraktPublicListSearchResult> =
        withContext(Dispatchers.Default) {
            requestJson<List<PublicTraktProminentListDto>>(
                endpoint = endpoint,
                query = mapOf(
                    "extended" to "full,images",
                    "page" to "1",
                    "limit" to "20",
                ),
            ).mapNotNull { item ->
                item.list?.toPublicListResult(likeCount = item.likeCount)
            }
        }

    private suspend inline fun <reified T> requestJson(
        endpoint: String,
        query: Map<String, String> = emptyMap(),
    ): T {
        val response = requestRaw(endpoint = endpoint, query = query)
        if (response.status !in 200..299) {
            error(errorMessageFor(response.status, "Trakt request failed"))
        }
        return runCatching { json.decodeFromString<T>(response.body) }
            .onFailure { error -> log.w(error) { "Failed to parse Trakt response for $endpoint" } }
            .getOrThrow()
    }

    private suspend fun requestRaw(
        endpoint: String,
        query: Map<String, String> = emptyMap(),
    ): RawHttpResponse {
        if (TraktConfig.CLIENT_ID.isBlank()) {
            error("Missing Trakt credentials in local.properties (TRAKT_CLIENT_ID).")
        }
        val url = buildTraktUrl(endpoint, query)
        return httpRequestRaw(
            method = "GET",
            url = url,
            headers = mapOf(
                "Accept" to "application/json",
                "trakt-api-version" to API_VERSION,
                "trakt-api-key" to TraktConfig.CLIENT_ID,
            ),
            body = "",
        )
    }

    private fun buildTraktUrl(endpoint: String, query: Map<String, String>): String {
        val trimmedEndpoint = endpoint.trim().trim('/')
        val queryString = query.entries
            .filter { (_, value) -> value.isNotBlank() }
            .joinToString("&") { (key, value) ->
                "${key.encodeURLParameter()}=${value.encodeURLParameter()}"
            }
        return if (queryString.isBlank()) {
            "$BASE_URL/$trimmedEndpoint"
        } else {
            "$BASE_URL/$trimmedEndpoint?$queryString"
        }
    }

    private fun PublicTraktListItemDto.toPreview(mediaType: TmdbCollectionMediaType): MetaPreview? {
        return when (mediaType) {
            TmdbCollectionMediaType.MOVIE -> movie?.toPreview()
            TmdbCollectionMediaType.TV -> show?.toPreview()
        }
    }

    private fun PublicTraktMovieDto.toPreview(): MetaPreview? {
        val title = title?.takeIf { it.isNotBlank() } ?: return null
        val fallback = when {
            ids?.trakt != null -> "trakt:${ids.trakt}"
            !ids?.slug.isNullOrBlank() -> "movie:${ids.slug}"
            else -> null
        }
        val contentId = normalizeTraktContentId(ids, fallback)
        if (contentId.isBlank()) return null
        return MetaPreview(
            id = contentId,
            type = "movie",
            name = title,
            poster = images.traktBestPosterUrl(),
            banner = images.traktBestBackdropUrl(),
            logo = images.traktBestLogoUrl(),
            posterShape = PosterShape.Poster,
            description = overview?.takeIf { it.isNotBlank() },
            releaseInfo = year?.toString() ?: released?.take(4),
            rawReleaseDate = released,
            imdbRating = rating?.formatRating(),
            genres = genres.orEmpty(),
        )
    }

    private fun PublicTraktShowDto.toPreview(): MetaPreview? {
        val title = title?.takeIf { it.isNotBlank() } ?: return null
        val fallback = when {
            ids?.trakt != null -> "trakt:${ids.trakt}"
            !ids?.slug.isNullOrBlank() -> "series:${ids.slug}"
            else -> null
        }
        val contentId = normalizeTraktContentId(ids, fallback)
        if (contentId.isBlank()) return null
        return MetaPreview(
            id = contentId,
            type = "series",
            name = title,
            poster = images.traktBestPosterUrl(),
            banner = images.traktBestBackdropUrl(),
            logo = images.traktBestLogoUrl(),
            posterShape = PosterShape.Poster,
            description = overview?.takeIf { it.isNotBlank() },
            releaseInfo = year?.toString() ?: firstAired?.take(4),
            rawReleaseDate = firstAired,
            imdbRating = rating?.formatRating(),
            genres = genres.orEmpty(),
        )
    }

    private fun PublicTraktSearchResultDto.toPublicListResult(): TraktPublicListSearchResult? {
        if (!type.equals("list", ignoreCase = true)) return null
        return list?.toPublicListResult()
    }

    private fun PublicTraktListSummaryDto.toPublicListResult(likeCount: Int? = null): TraktPublicListSearchResult? {
        val id = ids?.trakt ?: return null
        val listTitle = name?.takeIf { it.isNotBlank() } ?: "Trakt List $id"
        val owner = user?.username?.takeIf { it.isNotBlank() }
        val stats = buildList {
            itemCount?.let { add("$it items") }
            (likeCount ?: likes)?.let { add("$it likes") }
        }
        val subtitle = (listOfNotNull(owner) + stats).joinToString(" • ").ifBlank { "Trakt public list" }
        return TraktPublicListSearchResult(
            traktListId = id,
            title = listTitle,
            subtitle = subtitle,
            coverImageUrl = images?.posters.firstTraktImageUrl(),
            sortBy = sortBy,
            sortHow = sortHow,
        )
    }

    private fun parseTraktListPath(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isBlank()) return null
        trimmed.toLongOrNull()?.let { return it.toString() }
        Regex("""[?&]id=([^&#/]+)""")
            .find(trimmed)
            ?.groupValues
            ?.getOrNull(1)
            ?.takeIf { it.isNotBlank() }
            ?.let { return it }
        Regex("""trakt\.tv/lists/([^/?#]+)""", RegexOption.IGNORE_CASE)
            .find(trimmed)
            ?.groupValues
            ?.getOrNull(1)
            ?.takeIf { it.isNotBlank() }
            ?.let { return it }
        Regex("""trakt\.tv/users/[^/]+/lists/([^/?#]+)""", RegexOption.IGNORE_CASE)
            .find(trimmed)
            ?.groupValues
            ?.getOrNull(1)
            ?.takeIf { it.isNotBlank() }
            ?.let { return it }
        return trimmed.takeIf { it.matches(Regex("""[A-Za-z0-9_-]+""")) }
    }

    private fun TmdbCollectionMediaType.toTraktType(): String =
        when (this) {
            TmdbCollectionMediaType.MOVIE -> "movie"
            TmdbCollectionMediaType.TV -> "show"
        }

    private fun RawHttpResponse.headerInt(name: String): Int? =
        headers.entries.firstOrNull { (key, _) -> key.equals(name, ignoreCase = true) }
            ?.value
            ?.substringBefore(',')
            ?.trim()
            ?.toIntOrNull()

    private fun errorMessageFor(code: Int, fallback: String): String {
        return when (code) {
            401, 403, 404 -> "Trakt list not found or not public"
            429 -> "Trakt rate limit reached"
            else -> "$fallback ($code)"
        }
    }
}

private fun Double.formatRating(): String =
    ((this * 10).roundToInt() / 10.0).toString()

@Serializable
private data class PublicTraktSearchResultDto(
    val type: String? = null,
    val list: PublicTraktListSummaryDto? = null,
)

@Serializable
private data class PublicTraktProminentListDto(
    @SerialName("like_count") val likeCount: Int? = null,
    val list: PublicTraktListSummaryDto? = null,
)

@Serializable
private data class PublicTraktListSummaryDto(
    val name: String? = null,
    val description: String? = null,
    @SerialName("sort_by") val sortBy: String? = null,
    @SerialName("sort_how") val sortHow: String? = null,
    @SerialName("item_count") val itemCount: Int? = null,
    val likes: Int? = null,
    val ids: PublicTraktListIdsDto? = null,
    val user: PublicTraktUserDto? = null,
    val images: PublicTraktListImagesDto? = null,
)

@Serializable
private data class PublicTraktListImagesDto(
    val posters: List<String>? = null,
)

@Serializable
private data class PublicTraktListIdsDto(
    val trakt: Long? = null,
    val slug: String? = null,
)

@Serializable
private data class PublicTraktUserDto(
    val username: String? = null,
)

@Serializable
private data class PublicTraktListItemDto(
    val rank: Int? = null,
    val id: Long? = null,
    @SerialName("listed_at") val listedAt: String? = null,
    val type: String? = null,
    val movie: PublicTraktMovieDto? = null,
    val show: PublicTraktShowDto? = null,
)

@Serializable
private data class PublicTraktMovieDto(
    val title: String? = null,
    val year: Int? = null,
    val ids: TraktExternalIds? = null,
    val overview: String? = null,
    val released: String? = null,
    val rating: Double? = null,
    val genres: List<String>? = null,
    val images: TraktImagesDto? = null,
)

@Serializable
private data class PublicTraktShowDto(
    val title: String? = null,
    val year: Int? = null,
    val ids: TraktExternalIds? = null,
    val overview: String? = null,
    @SerialName("first_aired") val firstAired: String? = null,
    val rating: Double? = null,
    val genres: List<String>? = null,
    val images: TraktImagesDto? = null,
)
