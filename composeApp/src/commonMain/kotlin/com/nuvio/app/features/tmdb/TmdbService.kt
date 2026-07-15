package com.nuvio.app.features.tmdb

import co.touchlab.kermit.Logger
import com.nuvio.app.core.logging.InAppLogger
import com.nuvio.app.features.addons.httpGetText
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

object TmdbService {
    private val log = Logger.withTag("TmdbService")
    private val json = Json { ignoreUnknownKeys = true }
    private val imdbToTmdbCache = linkedMapOf<String, String>()
    private val tmdbToImdbCache = linkedMapOf<String, String>()
    private val cacheMutex = Mutex()

    suspend fun ensureTmdbId(videoId: String, mediaType: String): String? {
        val apiKey = currentApiKey() ?: return null

        val normalized = videoId
            .removePrefix("tmdb:")
            .removePrefix("movie:")
            .removePrefix("series:")
            .substringBefore(':')
            .substringBefore('/')
            .trim()

        if (normalized.isBlank()) return null
        if (normalized.all(Char::isDigit)) {
            InAppLogger.debug("Metadata/TMDB", "ensureTmdbId alreadyTmdb id=$normalized type=$mediaType")
            return normalized
        }
        if (!normalized.startsWith("tt", ignoreCase = true)) return null

        InAppLogger.debug("Metadata/TMDB", "ensureTmdbId imdb=$normalized type=$mediaType")
        return imdbToTmdb(imdbId = normalized, mediaType = mediaType, apiKey = apiKey)
    }

    suspend fun tmdbToImdb(tmdbId: Int, mediaType: String): String? {
        val apiKey = currentApiKey() ?: return null

        val cacheKey = "$tmdbId:${normalizeMediaType(mediaType)}"
        cacheMutex.withLock {
            tmdbToImdbCache[cacheKey]?.let {
                InAppLogger.debug("Metadata/TMDB", "cache hit tmdbToImdb key=$cacheKey")
                return it
            }
        }

        val endpoint = when (normalizeMediaType(mediaType)) {
            "tv" -> "tv/$tmdbId/external_ids"
            else -> "movie/$tmdbId/external_ids"
        }
        val body = fetch<TmdbExternalIdsResponse>(endpoint = endpoint, apiKey = apiKey) ?: return null
        val imdbId = body.imdbId?.trim()?.takeIf(String::isNotBlank) ?: return null

        cacheMutex.withLock {
            tmdbToImdbCache[cacheKey] = imdbId
            imdbToTmdbCache["$imdbId:${normalizeMediaType(mediaType)}"] = tmdbId.toString()
        }
        InAppLogger.info("Metadata/TMDB", "tmdbToImdb tmdbId=$tmdbId type=${normalizeMediaType(mediaType)} imdb=$imdbId")
        return imdbId
    }

    private suspend fun imdbToTmdb(imdbId: String, mediaType: String, apiKey: String): String? {
        val normalizedType = normalizeMediaType(mediaType)
        val cacheKey = "$imdbId:$normalizedType"
        cacheMutex.withLock {
            imdbToTmdbCache[cacheKey]?.let {
                InAppLogger.debug("Metadata/TMDB", "cache hit imdbToTmdb key=$cacheKey")
                return it
            }
        }

        val body = fetch<TmdbFindResponse>(
            endpoint = "find/$imdbId",
            apiKey = apiKey,
            query = mapOf("external_source" to "imdb_id"),
        ) ?: return null

        val resultId = when (normalizedType) {
            "movie" -> body.movieResults.firstOrNull()?.id
            "tv" -> body.tvResults.firstOrNull()?.id
            else -> body.movieResults.firstOrNull()?.id ?: body.tvResults.firstOrNull()?.id
        }?.takeIf { it > 0 }?.toString()

        if (resultId != null) {
            cacheMutex.withLock {
                imdbToTmdbCache[cacheKey] = resultId
                tmdbToImdbCache["$resultId:$normalizedType"] = imdbId
            }
            InAppLogger.info("Metadata/TMDB", "imdbToTmdb imdb=$imdbId type=$normalizedType tmdb=$resultId")
        } else {
            log.d { "No TMDB ID found for $imdbId ($normalizedType)" }
            InAppLogger.debug("Metadata/TMDB", "no mapping imdb=$imdbId type=$normalizedType")
        }

        return resultId
    }

    private suspend inline fun <reified T> fetch(
        endpoint: String,
        apiKey: String,
        query: Map<String, String> = emptyMap(),
    ): T? {
        val url = buildTmdbUrl(endpoint = endpoint, apiKey = apiKey, query = query)
        InAppLogger.info("Metadata/TMDB", "GET endpoint=$endpoint url=${InAppLogger.redactUrl(url)}")
        return runCatching {
            val payload = httpGetText(url)
            InAppLogger.info("Metadata/TMDB", "GET endpoint=$endpoint ok chars=${payload.length}")
            json.decodeFromString<T>(payload)
        }.onFailure { error ->
            log.w { "TMDB request failed for $endpoint: ${error.message}" }
            InAppLogger.warn("Metadata/TMDB", "GET endpoint=$endpoint failed: ${InAppLogger.throwableSummary(error)}")
        }.getOrNull()
    }

    private fun currentApiKey(): String? =
        TmdbSettingsRepository.snapshot().apiKey.trim().takeIf(String::isNotBlank)

    internal fun normalizeMediaType(mediaType: String): String =
        when (mediaType.trim().lowercase()) {
            "movie", "film" -> "movie"
            "tv", "series", "show", "tvshow" -> "tv"
            else -> mediaType.trim().lowercase()
        }
}

internal fun buildTmdbUrl(
    endpoint: String,
    apiKey: String,
    query: Map<String, String> = emptyMap(),
): String {
    val params = linkedMapOf("api_key" to apiKey)
    query.forEach { (key, value) ->
        if (value.isNotBlank()) {
            params[key] = value
        }
    }
    return buildString {
        append("https://api.themoviedb.org/3/")
        append(endpoint.removePrefix("/"))
        if (params.isNotEmpty()) {
            append("?")
            append(params.entries.joinToString("&") { (key, value) -> "$key=$value" })
        }
    }
}

@Serializable
private data class TmdbFindResponse(
    @SerialName("movie_results") val movieResults: List<TmdbExternalResult> = emptyList(),
    @SerialName("tv_results") val tvResults: List<TmdbExternalResult> = emptyList(),
)

@Serializable
private data class TmdbExternalResult(
    val id: Int,
)

@Serializable
private data class TmdbExternalIdsResponse(
    @SerialName("imdb_id") val imdbId: String? = null,
)
