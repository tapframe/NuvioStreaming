package com.nuvio.app.features.parentsguide

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.library.LibraryClock
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

private const val AvailableTtlMs = 24 * 60 * 60 * 1_000L
private const val UnavailableTtlMs = 60 * 60 * 1_000L

internal class ParentsGuideCache(
    private val now: () -> Long,
) {
    private data class Entry(val data: ParentsGuideData, val storedAt: Long)
    private val values = mutableMapOf<String, Entry>()

    fun get(key: String, allowStale: Boolean = false): ParentsGuideData? {
        val entry = values[key] ?: return null
        val ttl = if (entry.data.guide.overallStatus == ParentsGuideStatus.UNAVAILABLE) UnavailableTtlMs else AvailableTtlMs
        return entry.data.takeIf { allowStale || now() - entry.storedAt <= ttl }
    }

    fun put(key: String, data: ParentsGuideData) {
        values[key] = Entry(data, now())
    }

    fun clear(key: String) {
        values.remove(key)
    }
}

internal class ParentsGuideRemoteDataSource(
    private val apiBaseUrl: String,
    private val fetch: suspend (String) -> Pair<Int, String> = { url ->
        httpRequestRaw("GET", url, mapOf("Accept" to "application/json"), "").let { it.status to it.body }
    },
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun fetch(request: ParentsGuideRequest): ParentsGuideData {
        require(apiBaseUrl.isNotBlank()) { "Parents Guide API is not configured" }
        val query = buildList {
            request.imdbId?.let { add("imdbId=$it") }
            request.tmdbId?.let { add("tmdbId=$it") }
            request.stremioId?.let { add("stremioId=${encodeQueryValue(it)}") }
            add("mediaType=${normalizeMediaType(request.mediaType)}")
            request.season?.let { add("season=$it") }
            request.episode?.let { add("episode=$it") }
            add("language=en")
        }.joinToString("&")
        val (status, body) = fetch("${apiBaseUrl.trimEnd('/')}/api/v1/guide?$query")
        check(status in 200..299) { "Parents Guide request failed ($status)" }
        return json.decodeFromString<ParentsGuideEnvelope>(body).data
    }
}

internal class ParentsGuideClient(
    private val remote: ParentsGuideRemoteDataSource,
    private val cache: ParentsGuideCache,
) {
    private val locks = mutableMapOf<String, Mutex>()

    suspend fun load(request: ParentsGuideRequest, forceRefresh: Boolean = false): ParentsGuideUiState {
        val key = request.cacheKey()
        if (!forceRefresh) cache.get(key)?.let { return it.toUiState(fromCache = true) }
        val lock = locks.getOrPut(key) { Mutex() }
        return lock.withLock {
            if (!forceRefresh) cache.get(key)?.let { return@withLock it.toUiState(fromCache = true) }
            runCatching { remote.fetch(request) }
                .fold(
                    onSuccess = { data ->
                        cache.put(key, data)
                        data.toUiState(fromCache = false)
                    },
                    onFailure = {
                        cache.get(key, allowStale = true)?.toUiState(fromCache = true)
                            ?: ParentsGuideUiState.Error()
                    },
                )
        }
    }
}

internal object ParentsGuideRepository {
    private val log = Logger.withTag("ParentsGuideDetails")
    private var configuredUrl: String? = null
    private var client: ParentsGuideClient? = null

    suspend fun load(apiBaseUrl: String, request: ParentsGuideRequest, forceRefresh: Boolean = false): ParentsGuideUiState {
        if (apiBaseUrl.isBlank()) return ParentsGuideUiState.Unavailable()
        if (client == null || configuredUrl != apiBaseUrl) {
            configuredUrl = apiBaseUrl
            client = ParentsGuideClient(
                remote = ParentsGuideRemoteDataSource(apiBaseUrl),
                cache = ParentsGuideCache(LibraryClock::nowEpochMs),
            )
        }
        return runCatching {
            val primary = client!!.load(request, forceRefresh)
            if (request.episode != null && primary is ParentsGuideUiState.Unavailable) {
                when (val fallback = client!!.load(request.copy(mediaType = "series", season = null, episode = null), forceRefresh)) {
                    is ParentsGuideUiState.Available -> fallback.copy(isSeriesFallback = true)
                    else -> primary
                }
            } else {
                primary
            }
        }
            .onFailure { log.w(it) { "Unable to load Parents Guide" } }
            .getOrElse { ParentsGuideUiState.Error() }
    }
}

internal fun resolveParentsGuideRequest(type: String, id: String): ParentsGuideRequest? {
    val imdb = Regex("tt\\d{5,12}").find(id)?.value
    val tmdb = id.split(':', '/', '|').let { parts ->
        parts.getOrNull(parts.indexOfFirst { it.equals("tmdb", ignoreCase = true) } + 1)?.toIntOrNull()
            ?: id.takeIf { it.all(Char::isDigit) }?.toIntOrNull()
    }
    if (imdb == null && tmdb == null && id.isBlank()) return null
    val numbers = id.split(':')
    val season = numbers.takeLast(2).getOrNull(0)?.toIntOrNull()
    val episode = numbers.lastOrNull()?.toIntOrNull().takeIf { numbers.size >= 3 }
    return ParentsGuideRequest(
        mediaType = normalizeMediaType(type),
        imdbId = imdb,
        tmdbId = tmdb,
        stremioId = id.takeIf { it.isNotBlank() },
        season = season,
        episode = episode,
    )
}

private fun ParentsGuideRequest.cacheKey(): String = listOf(mediaType, imdbId, tmdbId, stremioId, season, episode).joinToString("|")

private fun ParentsGuideData.toUiState(fromCache: Boolean): ParentsGuideUiState =
    if (guide.overallStatus == ParentsGuideStatus.UNAVAILABLE) ParentsGuideUiState.Unavailable(fromCache)
    else ParentsGuideUiState.Available(copy(guide = guide.copy(categories = orderedCategories(guide.categories))), fromCache)

private fun normalizeMediaType(type: String): String = when (type.lowercase()) {
    "series", "show", "tv" -> "series"
    "episode" -> "episode"
    else -> "movie"
}

private fun encodeQueryValue(value: String): String = buildString {
    value.forEach { char ->
        when {
            char.isLetterOrDigit() || char in "-._~" -> append(char)
            else -> append('%').append(char.code.toString(16).uppercase().padStart(2, '0'))
        }
    }
}
