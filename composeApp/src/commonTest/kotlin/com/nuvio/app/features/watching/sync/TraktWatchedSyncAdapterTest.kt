package com.nuvio.app.features.watching.sync

import com.nuvio.app.features.addons.DefaultRawHttpResponseMaxBytes
import com.nuvio.app.features.addons.RawHttpResponse
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
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
}
