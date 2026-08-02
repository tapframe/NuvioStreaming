package com.nuvio.app.features.watching.sync

import com.nuvio.app.features.addons.DefaultRawHttpResponseMaxBytes
import com.nuvio.app.features.addons.RawHttpResponse
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class TraktWatchedSyncAdapterTest {
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
}
