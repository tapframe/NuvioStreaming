package com.nuvio.app.features.tmdb

import co.touchlab.kermit.Logger
import com.nuvio.app.core.time.EpisodeReleaseDatePlatform
import com.nuvio.app.features.addons.httpGetText
import io.ktor.http.encodeURLParameter
import kotlinx.atomicfu.atomic
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal interface AnimeIdMappingCache {
    suspend fun get(source: String, id: String): CachedAnimeTmdbMapping?
    suspend fun putSuccess(source: String, id: String, tmdbId: Int)
    suspend fun putMiss(source: String, id: String)
    suspend fun putFailure(source: String, id: String)
    suspend fun clear()
}

internal data class CachedAnimeTmdbMapping(
    val tmdbId: Int?,
    val expiresAtMs: Long,
    val missCount: Int,
)

internal class AnimeIdResolver(
    private val lookupTmdbId: suspend (source: String, id: String) -> Int?,
    private val cache: AnimeIdMappingCache,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val log = Logger.withTag("AnimeIdResolver")
    private val inFlightMutex = Mutex()
    private val inFlight = mutableMapOf<String, Deferred<Int?>>()
    private val requestSemaphore = Semaphore(MAX_CONCURRENT_REQUESTS)
    private val cacheGeneration = atomic(0L)

    fun supports(rawId: String): Boolean = parseArmRequest(rawId) != null

    suspend fun resolveTmdbId(rawId: String): Int? {
        val request = parseArmRequest(rawId) ?: return null
        return resolveRequest(request)
    }

    suspend fun prefetchTmdbIds(rawIds: Collection<String>) {
        val requests = rawIds
            .mapNotNull(::parseArmRequest)
            .distinctBy { it.cacheKey }
        if (requests.isEmpty()) return

        withTimeoutOrNull(REQUEST_TIMEOUT_MS) {
            coroutineScope {
                requests.map { request -> async { resolveRequest(request) } }.awaitAll()
            }
        }
    }

    suspend fun clearCache() {
        cacheGeneration.incrementAndGet()
        val pending = inFlightMutex.withLock {
            inFlight.values.toList().also { inFlight.clear() }
        }
        pending.forEach { it.cancel() }
        cache.clear()
    }

    internal fun parseArmRequest(rawId: String): AnimeIdRequest? {
        val normalized = rawId.trim().substringBefore('/').lowercase()
        val rawParts = normalized.split(':').filter(String::isNotBlank)
        val parts = if (rawParts.firstOrNull() in setOf("movie", "series", "tv")) {
            rawParts.drop(1)
        } else {
            rawParts
        }
        if (parts.size < 2) return null

        val source = when (parts.first()) {
            "mal", "myanimelist", "my-anime-list" -> "myanimelist"
            "anilist", "ani-list" -> "anilist"
            "kitsu" -> "kitsu"
            "anidb", "ani-db" -> "anidb"
            "animeplanet", "anime-planet" -> "anime-planet"
            "animecountdown", "anime-countdown" -> "animecountdown"
            "animenewsnetwork", "anime-news-network", "ann" -> "animenewsnetwork"
            "anisearch", "ani-search" -> "anisearch"
            "livechart", "live-chart" -> "livechart"
            else -> return null
        }
        val id = parts.drop(1).firstOrNull { part ->
            if (source == "anime-planet") part.isNotBlank() else part.all(Char::isDigit)
        } ?: return null
        return AnimeIdRequest(source = source, id = id)
    }

    private suspend fun resolveRequest(request: AnimeIdRequest): Int? {
        cache.get(request.source, request.id)?.let { return it.tmdbId }

        val deferred = inFlightMutex.withLock {
            inFlight[request.cacheKey] ?: createRequest(request).also { created ->
                inFlight[request.cacheKey] = created
            }
        }
        deferred.start()
        return deferred.await()
    }

    private fun createRequest(request: AnimeIdRequest): Deferred<Int?> {
        val requestGeneration = cacheGeneration.value
        return scope.async(start = CoroutineStart.LAZY) {
            fetchAndCache(request, requestGeneration)
        }.also { deferred ->
            deferred.invokeOnCompletion {
                scope.launch {
                    inFlightMutex.withLock {
                        if (inFlight[request.cacheKey] === deferred) {
                            inFlight.remove(request.cacheKey)
                        }
                    }
                }
            }
        }
    }

    private suspend fun fetchAndCache(request: AnimeIdRequest, requestGeneration: Long): Int? =
        try {
            withTimeout(REQUEST_TIMEOUT_MS) {
                requestSemaphore.withPermit {
                    val tmdbId = lookupTmdbId(request.source, request.id)
                    if (cacheGeneration.value == requestGeneration) {
                        if (tmdbId != null) {
                            cache.putSuccess(request.source, request.id, tmdbId)
                        } else {
                            cache.putMiss(request.source, request.id)
                        }
                    }
                    tmdbId
                }
            }
        } catch (timeout: TimeoutCancellationException) {
            log.w { "ARM mapping timed out for ${request.cacheKey}" }
            if (cacheGeneration.value == requestGeneration) {
                cache.putFailure(request.source, request.id)
            }
            null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            log.w { "ARM mapping failed for ${request.cacheKey}: ${error.message}" }
            if (cacheGeneration.value == requestGeneration) {
                cache.putFailure(request.source, request.id)
            }
            null
        }

    internal data class AnimeIdRequest(val source: String, val id: String) {
        val cacheKey: String = "$source:$id"
    }

    private companion object {
        const val MAX_CONCURRENT_REQUESTS = 4
        const val REQUEST_TIMEOUT_MS = 30_000L
    }
}

internal object AnimeIdResolution {
    private val json = Json { ignoreUnknownKeys = true }
    private val resolver = AnimeIdResolver(
        lookupTmdbId = { source, id ->
            val url = buildString {
                append("https://arm.haglund.dev/api/v2/ids?source=")
                append(source.encodeURLParameter())
                append("&id=")
                append(id.encodeURLParameter())
                append("&include=themoviedb")
            }
            json.decodeFromString<ArmTmdbResponse>(httpGetText(url)).themoviedb
        },
        cache = PersistentAnimeIdMappingCache,
    )

    fun supports(rawId: String): Boolean = resolver.supports(rawId)

    suspend fun resolveTmdbId(rawId: String): Int? = resolver.resolveTmdbId(rawId)

    suspend fun prefetchTmdbIds(rawIds: Collection<String>) = resolver.prefetchTmdbIds(rawIds)

    suspend fun clearCache() = resolver.clearCache()
}

private object PersistentAnimeIdMappingCache : AnimeIdMappingCache {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val mutex = Mutex()
    private val entries = mutableMapOf<String, PersistedAnimeTmdbMapping>()
    private var loaded = false

    override suspend fun get(source: String, id: String): CachedAnimeTmdbMapping? = mutex.withLock {
        ensureLoaded()
        entries[cacheKey(source, id)]
            ?.takeIf { it.expiresAtMs > EpisodeReleaseDatePlatform.nowEpochMs() }
            ?.toCached()
    }

    override suspend fun putSuccess(source: String, id: String, tmdbId: Int) {
        put(source, id, tmdbId, POSITIVE_TTL_MS, missCount = 0)
    }

    override suspend fun putMiss(source: String, id: String) = mutex.withLock {
        ensureLoaded()
        val key = cacheKey(source, id)
        val missCount = ((entries[key]?.missCount ?: 0) + 1).coerceAtMost(3)
        val ttl = when (missCount) {
            1 -> FIRST_MISS_TTL_MS
            2 -> SECOND_MISS_TTL_MS
            else -> LATER_MISS_TTL_MS
        }
        entries[key] = persisted(source, id, tmdbId = null, ttlMs = ttl, missCount = missCount)
        persist()
    }

    override suspend fun putFailure(source: String, id: String) = mutex.withLock {
        ensureLoaded()
        val key = cacheKey(source, id)
        entries[key] = persisted(
            source = source,
            id = id,
            tmdbId = null,
            ttlMs = FAILURE_TTL_MS,
            missCount = entries[key]?.missCount ?: 0,
        )
        persist()
    }

    override suspend fun clear() = mutex.withLock {
        entries.clear()
        loaded = true
        AnimeIdCacheStorage.clear()
    }

    private suspend fun put(source: String, id: String, tmdbId: Int?, ttlMs: Long, missCount: Int) =
        mutex.withLock {
            ensureLoaded()
            entries[cacheKey(source, id)] = persisted(source, id, tmdbId, ttlMs, missCount)
            persist()
        }

    private fun ensureLoaded() {
        if (loaded) return
        loaded = true
        val payload = AnimeIdCacheStorage.loadPayload() ?: return
        val decoded = runCatching { json.decodeFromString<PersistedAnimeIdCache>(payload) }.getOrNull() ?: return
        entries.putAll(decoded.entries.associateBy { cacheKey(it.source, it.id) })
    }

    private fun persist() {
        AnimeIdCacheStorage.savePayload(
            json.encodeToString(PersistedAnimeIdCache(entries = entries.values.toList())),
        )
    }

    private fun persisted(
        source: String,
        id: String,
        tmdbId: Int?,
        ttlMs: Long,
        missCount: Int,
    ) = PersistedAnimeTmdbMapping(
        source = source,
        id = id,
        tmdbId = tmdbId,
        expiresAtMs = EpisodeReleaseDatePlatform.nowEpochMs() + ttlMs,
        missCount = missCount,
    )

    private fun cacheKey(source: String, id: String): String = "$source:$id"

    private fun PersistedAnimeTmdbMapping.toCached() = CachedAnimeTmdbMapping(
        tmdbId = tmdbId,
        expiresAtMs = expiresAtMs,
        missCount = missCount,
    )

    private const val POSITIVE_TTL_MS = 30L * 24 * 60 * 60 * 1000
    private const val FIRST_MISS_TTL_MS = 6L * 60 * 60 * 1000
    private const val SECOND_MISS_TTL_MS = 12L * 60 * 60 * 1000
    private const val LATER_MISS_TTL_MS = 24L * 60 * 60 * 1000
    private const val FAILURE_TTL_MS = 15L * 60 * 1000
}

@Serializable
private data class ArmTmdbResponse(
    @SerialName("themoviedb") val themoviedb: Int? = null,
)

@Serializable
private data class PersistedAnimeIdCache(
    val entries: List<PersistedAnimeTmdbMapping> = emptyList(),
)

@Serializable
private data class PersistedAnimeTmdbMapping(
    val source: String,
    val id: String,
    val tmdbId: Int? = null,
    val expiresAtMs: Long,
    val missCount: Int = 0,
)
