package com.nuvio.app.features.trakt

import com.nuvio.app.features.addons.RawHttpResponse
import com.nuvio.app.features.addons.httpRequestRaw
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private const val TRAKT_BASE_URL = "https://api.trakt.tv"
private const val WATCHED_PAGE_LIMIT = 250
private const val WATCHED_MAX_PAGES = 1_000
private const val WATCHED_SHOWS_EXTENDED = "progress"
private const val WATCHED_SHOW_SNAPSHOT_CACHE_TTL_MS = 15_000L
internal const val TRAKT_WATCHED_MAX_RESPONSE_BODY_BYTES = 8 * 1024 * 1024
private const val TRAKT_WATCHED_MAX_ATTEMPTS = 2
private const val TRAKT_WATCHED_MAX_RETRY_DELAY_MS = 60_000L

internal fun interface TraktWatchedHttpEngine {
    suspend fun get(
        url: String,
        headers: Map<String, String>,
        maxResponseBodyBytes: Int,
    ): RawHttpResponse
}

internal class TraktWatchedPageClient(
    private val engine: TraktWatchedHttpEngine,
    private val sleep: suspend (Long) -> Unit = { delayMs -> delay(delayMs) },
) {
    suspend fun get(url: String, headers: Map<String, String>): RawHttpResponse {
        repeat(TRAKT_WATCHED_MAX_ATTEMPTS) { attempt ->
            val response = engine.get(
                url = url,
                headers = headers,
                maxResponseBodyBytes = TRAKT_WATCHED_MAX_RESPONSE_BODY_BYTES,
            )
            if (response.status in 200..299) return response
            if (!isTransientTraktWatchedStatus(response.status) || attempt == TRAKT_WATCHED_MAX_ATTEMPTS - 1) {
                throw TraktWatchedHttpException(response.status)
            }
            sleep(
                traktWatchedRetryDelayMs(
                    attempt = attempt,
                    retryAfterSeconds = response.headers.entries
                        .firstOrNull { (name, _) -> name.equals("retry-after", ignoreCase = true) }
                        ?.value,
                ),
            )
        }
        error("Trakt watched request exhausted without a response")
    }
}

internal class TraktWatchedHttpException(
    val status: Int,
) : Exception("Trakt watched request failed: $status")

internal fun isTransientTraktWatchedStatus(status: Int): Boolean =
    status == 429 || status in 500..599

internal fun traktWatchedRetryDelayMs(attempt: Int, retryAfterSeconds: String?): Long =
    retryAfterSeconds
        ?.trim()
        ?.toLongOrNull()
        ?.coerceAtLeast(0L)
        ?.times(1_000L)
        ?.coerceAtMost(TRAKT_WATCHED_MAX_RETRY_DELAY_MS)
        ?: (1_000L shl attempt.coerceIn(0, 5)).coerceAtMost(TRAKT_WATCHED_MAX_RETRY_DELAY_MS)

private val platformTraktWatchedHttpEngine = TraktWatchedHttpEngine { url, headers, maxResponseBodyBytes ->
    httpRequestRaw(
        method = "GET",
        url = url,
        headers = headers,
        body = "",
        maxResponseBodyBytes = maxResponseBodyBytes,
    )
}

internal object TraktWatchedShowSnapshotRepository {
    private val store = TraktWatchedShowSnapshotStore(
        pageClient = TraktWatchedPageClient(platformTraktWatchedHttpEngine),
    )

    suspend fun get(headers: Map<String, String>): List<TraktWatchedShowSnapshotItem> = store.get(headers)

    fun clear() = store.clear()
}

internal class TraktWatchedShowSnapshotStore(
    private val pageClient: TraktWatchedPageClient,
    private val nowEpochMs: () -> Long = TraktPlatformClock::nowEpochMs,
    private val cacheTtlMs: Long = WATCHED_SHOW_SNAPSHOT_CACHE_TTL_MS,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
    private val stateLock = SynchronizedObject()
    private val inFlightByCredential = mutableMapOf<String, CompletableDeferred<List<TraktWatchedShowSnapshotItem>>>()
    private var cachedSnapshot: CachedWatchedShowSnapshot? = null
    private var generation = 0L

    suspend fun get(headers: Map<String, String>): List<TraktWatchedShowSnapshotItem> {
        val credentialKey = credentialKey(headers)
        val now = nowEpochMs()
        val lease = synchronized(stateLock) {
            val cached = cachedSnapshot?.takeIf { snapshot ->
                snapshot.credentialKey == credentialKey &&
                    now - snapshot.fetchedAtEpochMs in 0..cacheTtlMs
            }
            if (cached != null) {
                SnapshotFetchLease(cachedItems = cached.items)
            } else {
                val existing = inFlightByCredential[credentialKey]
                if (existing != null) {
                    SnapshotFetchLease(deferred = existing)
                } else {
                    val created = CompletableDeferred<List<TraktWatchedShowSnapshotItem>>()
                    inFlightByCredential[credentialKey] = created
                    SnapshotFetchLease(
                        deferred = created,
                        ownsFetch = true,
                        generation = generation,
                    )
                }
            }
        }

        lease.cachedItems?.let { return it }

        val deferred = requireNotNull(lease.deferred)
        if (!lease.ownsFetch) {
            return deferred.await()
        }

        return try {
            val items = fetchPages(headers)
            synchronized(stateLock) {
                if (lease.generation == generation) {
                    cachedSnapshot = CachedWatchedShowSnapshot(
                        credentialKey = credentialKey,
                        fetchedAtEpochMs = nowEpochMs(),
                        items = items,
                    )
                }
                if (inFlightByCredential[credentialKey] === deferred) {
                    inFlightByCredential.remove(credentialKey)
                }
            }
            deferred.complete(items)
            items
        } catch (error: Throwable) {
            synchronized(stateLock) {
                if (inFlightByCredential[credentialKey] === deferred) {
                    inFlightByCredential.remove(credentialKey)
                }
            }
            deferred.completeExceptionally(error)
            throw error
        }
    }

    fun clear() {
        synchronized(stateLock) {
            generation += 1
            cachedSnapshot = null
            inFlightByCredential.clear()
        }
    }

    private suspend fun fetchPages(headers: Map<String, String>): List<TraktWatchedShowSnapshotItem> {
        val items = mutableListOf<TraktWatchedShowSnapshotItem>()
        var page = 1
        while (page <= WATCHED_MAX_PAGES) {
            val response = pageClient.get(
                url = "$TRAKT_BASE_URL/sync/watched/shows?page=$page&limit=$WATCHED_PAGE_LIMIT&extended=$WATCHED_SHOWS_EXTENDED",
                headers = headers,
            )
            val pageItems = json.decodeFromString<List<TraktWatchedShowSnapshotItem>>(response.body)
            val pageCount = response.headerInt("x-pagination-page-count")
            if (pageItems.isEmpty()) break
            items.addAll(pageItems)
            if (pageCount != null && page >= pageCount) break
            page += 1
        }
        if (page > WATCHED_MAX_PAGES) {
            error("Trakt watched shows exceeded max pages")
        }
        return items
    }

    private fun credentialKey(headers: Map<String, String>): String =
        headers.entries
            .firstOrNull { (name, _) -> name.equals("authorization", ignoreCase = true) }
            ?.value
            ?: headers.hashCode().toString()

    private fun RawHttpResponse.headerInt(name: String): Int? =
        headers.entries
            .firstOrNull { (headerName, _) -> headerName.equals(name, ignoreCase = true) }
            ?.value
            ?.substringBefore(",")
            ?.trim()
            ?.toIntOrNull()
}

private data class SnapshotFetchLease(
    val cachedItems: List<TraktWatchedShowSnapshotItem>? = null,
    val deferred: CompletableDeferred<List<TraktWatchedShowSnapshotItem>>? = null,
    val ownsFetch: Boolean = false,
    val generation: Long = 0L,
)

private data class CachedWatchedShowSnapshot(
    val credentialKey: String,
    val fetchedAtEpochMs: Long,
    val items: List<TraktWatchedShowSnapshotItem>,
)

@Serializable
internal data class TraktWatchedShowSnapshotItem(
    @SerialName("plays") val plays: Int? = null,
    @SerialName("last_watched_at") val lastWatchedAt: String? = null,
    @SerialName("show") val show: TraktWatchedSnapshotMedia? = null,
    @SerialName("seasons") val seasons: List<TraktWatchedSnapshotSeason>? = null,
)

@Serializable
internal data class TraktWatchedSnapshotSeason(
    @SerialName("number") val number: Int? = null,
    @SerialName("episodes") val episodes: List<TraktWatchedSnapshotEpisode>? = null,
)

@Serializable
internal data class TraktWatchedSnapshotEpisode(
    @SerialName("number") val number: Int? = null,
    @SerialName("plays") val plays: Int? = null,
    @SerialName("last_watched_at") val lastWatchedAt: String? = null,
)

@Serializable
internal data class TraktWatchedSnapshotMedia(
    @SerialName("title") val title: String? = null,
    @SerialName("year") val year: Int? = null,
    @SerialName("ids") val ids: TraktWatchedSnapshotIds? = null,
)

@Serializable
internal data class TraktWatchedSnapshotIds(
    @SerialName("trakt") val trakt: Int? = null,
    @SerialName("slug") val slug: String? = null,
    @SerialName("imdb") val imdb: String? = null,
    @SerialName("tmdb") val tmdb: Int? = null,
    @SerialName("tvdb") val tvdb: Int? = null,
)

internal fun TraktWatchedSnapshotIds.toExternalIds(): TraktExternalIds = TraktExternalIds(
    trakt = trakt,
    imdb = imdb,
    tmdb = tmdb,
    slug = slug,
)
