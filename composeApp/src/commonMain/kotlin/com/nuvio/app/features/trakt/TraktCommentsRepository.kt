package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetTextWithHeaders
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.details.MetaDetails
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString

private const val COMMENTS_SORT = "likes"
private const val COMMENTS_LIMIT = 100
private const val COMMENTS_CACHE_TTL_MS = 10 * 60_000L
private val INLINE_SPOILER_REGEX = Regex(
    "(?is)\\[spoiler\\].*?\\[/spoiler\\]"
)
private val INLINE_SPOILER_TAG_REGEX = Regex("\\[/?spoiler\\]", RegexOption.IGNORE_CASE)

private val commentsJson = Json { ignoreUnknownKeys = true }

object TraktCommentsRepository {
    private val log = Logger.withTag("TraktComments")

    private data class TimedCache(
        val pages: Map<Int, List<TraktCommentReview>>,
        val pageCount: Int,
        val itemCount: Int,
        val updatedAtMs: Long,
    )

    private val cacheMutex = Mutex()
    private val cache = mutableMapOf<String, TimedCache>()

    suspend fun getCommentsPage(
        meta: MetaDetails,
        page: Int = 1,
        forceRefresh: Boolean = false,
    ): TraktCommentsPage {
        val target = resolveCommentsTarget(meta)
            ?: return TraktCommentsPage(emptyList(), page, 0, 0)
        val cacheKey = "${target.type.apiValue}|${target.pathId}"

        if (forceRefresh) {
            cacheMutex.withLock { cache.remove(cacheKey) }
        }

        if (!forceRefresh) {
            cacheMutex.withLock {
                val cached = cache[cacheKey]
                if (
                    cached != null &&
                    currentTimeMillis() - cached.updatedAtMs <= COMMENTS_CACHE_TTL_MS &&
                    cached.pages.containsKey(page)
                ) {
                    return TraktCommentsPage(
                        items = cached.pages.getValue(page),
                        currentPage = page,
                        pageCount = cached.pageCount,
                        itemCount = cached.itemCount,
                    )
                }
            }
        }

        val headers = TraktAuthRepository.authorizedHeaders()
            ?: return TraktCommentsPage(emptyList(), page, 0, 0)

        val endpoint = when (target.type) {
            TraktCommentsType.MOVIE -> "movies"
            TraktCommentsType.SHOW -> "shows"
        }
        val url = "https://api.trakt.tv/$endpoint/${target.pathId}/comments/$COMMENTS_SORT?page=$page&limit=$COMMENTS_LIMIT"

        val response = try {
            httpRequestRaw(
                method = "GET",
                url = url,
                headers = headers,
                body = "",
            )
        } catch (e: Exception) {
            log.e(e) { "Failed to load comments from $url" }
            throw e
        }

        if (response.status == 404) {
            return TraktCommentsPage(emptyList(), page, 0, 0)
        }
        if (response.status !in 200..299) {
            throw IllegalStateException("Failed to load Trakt comments (${response.status})")
        }

        val dtos = commentsJson.decodeFromString<List<TraktCommentDto>>(response.body)
        val pageCount = response.headers["X-Pagination-Page-Count"]?.toIntOrNull()
            ?: response.headers["x-pagination-page-count"]?.toIntOrNull()
            ?: page
        val itemCount = response.headers["X-Pagination-Item-Count"]?.toIntOrNull()
            ?: response.headers["x-pagination-item-count"]?.toIntOrNull()
            ?: dtos.size
        val selected = filterDisplayableComments(dtos).map(::toReviewModel)

        cacheMutex.withLock {
            val cached = cache[cacheKey]
            cache[cacheKey] = TimedCache(
                pages = (cached?.pages.orEmpty()) + (page to selected),
                pageCount = pageCount,
                itemCount = itemCount,
                updatedAtMs = currentTimeMillis(),
            )
        }

        return TraktCommentsPage(
            items = selected,
            currentPage = page,
            pageCount = pageCount,
            itemCount = itemCount,
        )
    }

    fun clearCache() {
        cache.clear()
    }

    private suspend fun resolveCommentsTarget(meta: MetaDetails): ResolvedCommentsTarget? {
        val type = resolveCommentsType(meta) ?: return null
        val directPathId = resolveDirectPathId(meta)
        if (!directPathId.isNullOrBlank()) {
            return ResolvedCommentsTarget(type, directPathId)
        }
        val tmdbId = resolveTmdbCandidate(meta) ?: return null
        return resolveViaTraktSearch(type, tmdbId)
    }

    private fun resolveCommentsType(meta: MetaDetails): TraktCommentsType? {
        val normalized = meta.type.trim().lowercase()
        return when (normalized) {
            "movie" -> TraktCommentsType.MOVIE
            "series", "show", "tv" -> TraktCommentsType.SHOW
            else -> null
        }
    }

    private fun resolveDirectPathId(meta: MetaDetails): String? {
        val id = meta.id.trim()
        if (id.startsWith("tt") && id.length >= 7) return id
        val parts = id.split(":")
        for (part in parts) {
            val trimmed = part.trim()
            if (trimmed.startsWith("tt") && trimmed.length >= 7) return trimmed
        }
        return null
    }

    private fun resolveTmdbCandidate(meta: MetaDetails): Int? {
        val id = meta.id.trim()
        val parts = id.split(":")
        for (part in parts) {
            val trimmed = part.trim()
            if (!trimmed.startsWith("tt") && trimmed.all { it.isDigit() } && trimmed.isNotEmpty()) {
                return trimmed.toIntOrNull()
            }
        }
        return null
    }

    private suspend fun resolveViaTraktSearch(
        type: TraktCommentsType,
        tmdbId: Int,
    ): ResolvedCommentsTarget? {
        val headers = TraktAuthRepository.authorizedHeaders() ?: return null
        val url = "https://api.trakt.tv/search/tmdb/$tmdbId?type=${type.apiValue}"
        return try {
            val responseText = httpGetTextWithHeaders(url, headers)
            val results = commentsJson.decodeFromString<List<TraktCommentsSearchResultDto>>(responseText)
            val matched = results.firstOrNull {
                it.type.equals(type.apiValue, ignoreCase = true)
            }
            val ids = when (type) {
                TraktCommentsType.MOVIE -> matched?.movie?.ids
                TraktCommentsType.SHOW -> matched?.show?.ids
            }
            val pathId = ids?.bestPathId() ?: return null
            ResolvedCommentsTarget(type, pathId)
        } catch (e: Exception) {
            log.w(e) { "TMDB→Trakt lookup failed for tmdbId=$tmdbId" }
            null
        }
    }
}

private data class ResolvedCommentsTarget(
    val type: TraktCommentsType,
    val pathId: String,
)

private fun TraktCommentsIdsDto.bestPathId(): String? {
    return when {
        !imdb.isNullOrBlank() -> imdb
        trakt != null -> trakt.toString()
        !slug.isNullOrBlank() -> slug
        else -> null
    }
}

private fun filterDisplayableComments(comments: List<TraktCommentDto>): List<TraktCommentDto> {
    return comments.filter { !it.comment.isNullOrBlank() }
}

private fun containsInlineSpoilers(comment: String?): Boolean {
    if (comment.isNullOrBlank()) return false
    return INLINE_SPOILER_REGEX.containsMatchIn(comment)
}

private fun stripInlineSpoilerMarkup(comment: String?): String {
    if (comment.isNullOrBlank()) return ""
    return comment
        .replace(INLINE_SPOILER_TAG_REGEX, "")
        .replace(Regex("\\s+"), " ")
        .trim()
}

private fun toReviewModel(dto: TraktCommentDto): TraktCommentReview {
    val authorDisplayName = dto.user?.name
        ?.takeIf { it.isNotBlank() }
        ?: dto.user?.username?.takeIf { it.isNotBlank() }
        ?: runBlocking { getString(Res.string.trakt_user_fallback) }

    return TraktCommentReview(
        id = dto.id,
        authorDisplayName = authorDisplayName,
        authorUsername = dto.user?.username?.takeIf { it.isNotBlank() },
        comment = stripInlineSpoilerMarkup(dto.comment),
        spoiler = dto.spoiler == true,
        containsInlineSpoilers = containsInlineSpoilers(dto.comment),
        review = dto.review == true,
        likes = dto.likes ?: 0,
        rating = dto.userStats?.rating,
        createdAt = dto.createdAt,
        updatedAt = dto.updatedAt,
    )
}

private fun currentTimeMillis(): Long = TraktPlatformClock.nowEpochMs()
