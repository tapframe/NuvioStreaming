package com.nuvio.app.features.trakt

import com.nuvio.app.features.addons.RawHttpResponse
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlin.test.Test
import kotlin.test.assertEquals

class TraktWatchedShowSnapshotRepositoryTest {
    @Test
    fun `concurrent consumers share one watched show request`() = runBlocking {
        var requests = 0
        val requestStarted = CompletableDeferred<Unit>()
        val releaseRequest = CompletableDeferred<Unit>()
        val client = TraktWatchedPageClient(
            engine = TraktWatchedHttpEngine { url, _, _ ->
                requests += 1
                requestStarted.complete(Unit)
                releaseRequest.await()
                response(url)
            },
        )
        val store = TraktWatchedShowSnapshotStore(
            pageClient = client,
            nowEpochMs = { 1_000L },
        )

        val first = async { store.get(headers()) }
        requestStarted.await()
        val second = async { store.get(headers()) }
        yield()
        releaseRequest.complete(Unit)

        val firstResult = first.await()
        assertEquals(1, firstResult.size)
        assertEquals(firstResult, second.await())
        assertEquals(1, requests)
    }

    @Test
    fun `fresh watched show snapshot is reused and clear forces a request`() = runBlocking {
        var requests = 0
        var now = 1_000L
        val client = TraktWatchedPageClient(
            engine = TraktWatchedHttpEngine { url, _, _ ->
                requests += 1
                response(url)
            },
        )
        val store = TraktWatchedShowSnapshotStore(
            pageClient = client,
            nowEpochMs = { now },
        )

        store.get(headers())
        now += 10_000L
        store.get(headers())
        store.clear()
        store.get(headers())

        assertEquals(2, requests)
    }

    private fun headers(): Map<String, String> = mapOf("Authorization" to "Bearer test")

    private fun response(url: String): RawHttpResponse = RawHttpResponse(
        status = 200,
        statusText = "OK",
        url = url,
        body = """
            [{
              "last_watched_at": "2026-08-09T10:00:00.000Z",
              "show": {"title": "Example", "ids": {"trakt": 1, "imdb": "tt1"}},
              "seasons": [{"number": 1, "episodes": [{"number": 1, "plays": 1}]}]
            }]
        """.trimIndent(),
        headers = mapOf("X-Pagination-Page-Count" to "1"),
    )
}
