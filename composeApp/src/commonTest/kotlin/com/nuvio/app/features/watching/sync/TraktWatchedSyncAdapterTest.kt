package com.nuvio.app.features.watching.sync

import com.nuvio.app.features.addons.DefaultRawHttpResponseMaxBytes
import com.nuvio.app.features.addons.RawHttpResponse
import com.nuvio.app.features.trakt.TRAKT_WATCHED_MAX_RESPONSE_BODY_BYTES
import com.nuvio.app.features.trakt.TraktWatchedHttpEngine
import com.nuvio.app.features.trakt.TraktWatchedHttpException
import com.nuvio.app.features.trakt.TraktWatchedPageClient
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.watchedItemKey
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TraktWatchedSyncAdapterTest {
    @Test
    fun `watched content ids preserve every Trakt identity in canonical order`() {
        val result = traktWatchedContentIds(
            imdb = "tt1234567",
            tmdb = 123,
            tvdb = 456,
            trakt = 789,
            slug = "example-movie",
        )

        assertEquals(
            listOf("tt1234567", "tmdb:123", "trakt:789", "example-movie", "tvdb:456"),
            result,
        )
    }

    @Test
    fun `movie projection emits poster keys for every Trakt identity`() {
        val item = watchedItem(id = "tt1234567", type = "movie")

        val projection = buildTraktWatchedProjection(
            listOf(
                TraktWatchedProjectionCandidate(
                    item = item,
                    contentIds = listOf("tt1234567", "tmdb:123", "trakt:789", "example-movie"),
                ),
            ),
        )

        assertEquals(listOf(item), projection.items)
        assertTrue(watchedItemKey("movie", "tmdb:123") in projection.extraWatchedKeys)
        assertTrue(watchedItemKey("movie", "trakt:789") in projection.extraWatchedKeys)
        assertTrue(watchedItemKey("movie", "example-movie") in projection.extraWatchedKeys)
        assertTrue(watchedItemKey("film", "tt1234567") in projection.extraWatchedKeys)
        assertFalse(watchedItemKey("movie", "tt1234567") in projection.extraWatchedKeys)
    }

    @Test
    fun `episode projection emits aliases with matching coordinates and content types`() {
        val projection = buildTraktWatchedProjection(
            listOf(
                TraktWatchedProjectionCandidate(
                    item = watchedItem(
                        id = "tt7654321",
                        type = "series",
                        season = 2,
                        episode = 4,
                    ),
                    contentIds = listOf("tt7654321", "tmdb:321", "trakt:987", "example-show"),
                ),
            ),
        )

        assertTrue(watchedItemKey("series", "tmdb:321", 2, 4) in projection.extraWatchedKeys)
        assertTrue(watchedItemKey("tv", "tt7654321", 2, 4) in projection.extraWatchedKeys)
        assertTrue(watchedItemKey("show", "trakt:987", 2, 4) in projection.extraWatchedKeys)
        assertTrue(watchedItemKey("tvshow", "example-show", 2, 4) in projection.extraWatchedKeys)
    }

    @Test
    fun `ambiguous show ids are excluded while unique siblings remain usable`() {
        val firstIds = listOf("tt-shared", "tmdb:100", "trakt:1", "first-show")
        val secondIds = listOf("tt-shared", "tmdb:200", "trakt:2", "second-show")
        val ambiguousIds = ambiguousTraktWatchedShowIds(listOf(firstIds, secondIds))
        val safeFirstIds = firstIds.filterNot(ambiguousIds::contains)
        val projection = buildTraktWatchedProjection(
            listOf(
                TraktWatchedProjectionCandidate(
                    item = watchedItem(id = safeFirstIds.first(), type = "series", season = 1, episode = 1),
                    contentIds = safeFirstIds,
                ),
            ),
        )

        assertEquals(setOf("tt-shared"), ambiguousIds)
        assertFalse(watchedItemKey("series", "tt-shared", 1, 1) in projection.extraWatchedKeys)
        assertTrue(watchedItemKey("series", "trakt:1", 1, 1) in projection.extraWatchedKeys)
        assertTrue(watchedItemKey("series", "first-show", 1, 1) in projection.extraWatchedKeys)
    }

    @Test
    fun `watched history responses larger than generic limit remain complete`() = runBlocking {
        val body = "x".repeat(DefaultRawHttpResponseMaxBytes + 1)
        var requestedLimit = 0
        val client = TraktWatchedPageClient(
            TraktWatchedHttpEngine { _, _, maxResponseBodyBytes ->
                requestedLimit = maxResponseBodyBytes
                val truncated = body.length > maxResponseBodyBytes
                RawHttpResponse(
                    status = 200,
                    statusText = "OK",
                    url = "https://api.trakt.tv/sync/watched/shows",
                    body = if (truncated) body.take(maxResponseBodyBytes) else body,
                    headers = emptyMap(),
                )
            },
        )

        val response = client.get(
            url = "https://api.trakt.tv/sync/watched/shows",
            headers = emptyMap(),
        )

        assertEquals(TRAKT_WATCHED_MAX_RESPONSE_BODY_BYTES, requestedLimit)
        assertFalse(response.body.length < body.length)
        assertEquals(body, response.body)
    }

    @Test
    fun `rate limited watched request retries once after retry after`() = runBlocking {
        var attempts = 0
        val delays = mutableListOf<Long>()
        val client = TraktWatchedPageClient(
            engine = TraktWatchedHttpEngine { _, _, _ ->
                attempts += 1
                response(
                    status = if (attempts == 1) 429 else 200,
                    headers = if (attempts == 1) mapOf("Retry-After" to "2") else emptyMap(),
                )
            },
            sleep = delays::add,
        )

        val result = client.get("https://api.trakt.tv/sync/watched/shows", emptyMap())

        assertEquals(200, result.status)
        assertEquals(2, attempts)
        assertEquals(listOf(2_000L), delays)
    }

    @Test
    fun `repeated rate limit becomes a bounded typed failure`() = runBlocking {
        var attempts = 0
        val client = TraktWatchedPageClient(
            engine = TraktWatchedHttpEngine { _, _, _ ->
                attempts += 1
                response(status = 429)
            },
            sleep = {},
        )

        val error = assertFailsWith<TraktWatchedHttpException> {
            client.get("https://api.trakt.tv/sync/watched/shows", emptyMap())
        }

        assertEquals(429, error.status)
        assertEquals(2, attempts)
    }

    private fun response(
        status: Int,
        headers: Map<String, String> = emptyMap(),
    ): RawHttpResponse = RawHttpResponse(
        status = status,
        statusText = "",
        url = "https://api.trakt.tv/sync/watched/shows",
        body = "[]",
        headers = headers,
    )

    private fun watchedItem(
        id: String,
        type: String,
        season: Int? = null,
        episode: Int? = null,
    ): WatchedItem = WatchedItem(
        id = id,
        type = type,
        name = id,
        season = season,
        episode = episode,
        markedAtEpochMs = 1L,
    )
}
