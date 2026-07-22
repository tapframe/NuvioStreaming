package com.nuvio.app.features.simkl

import com.nuvio.app.features.addons.RawHttpResponse
import com.nuvio.app.features.tracking.TrackingEpisode
import com.nuvio.app.features.tracking.TrackingExternalIds
import com.nuvio.app.features.tracking.TrackingHistoryItem
import com.nuvio.app.features.tracking.TrackingListStatus
import com.nuvio.app.features.tracking.TrackingMediaKind
import com.nuvio.app.features.tracking.TrackingMediaReference
import com.nuvio.app.features.tracking.TrackingScrobbleAction
import com.nuvio.app.features.tracking.TrackingScrobbleEvent
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SimklMutationRepositoryTest {
    private val json = Json

    @Test
    fun `list mutation batches types and puts destination on every item`() {
        val body = buildSimklListMutationBody(
            items = listOf(movie(), anime()),
            destination = TrackingListStatus.PLAN_TO_WATCH,
        ).asObject()

        assertNull(body["to"])
        val movie = body.getValue("movies").jsonArray.single().jsonObject
        val anime = body.getValue("shows").jsonArray.single().jsonObject
        assertEquals("plantowatch", movie.getValue("to").jsonPrimitive.content)
        assertEquals("plantowatch", anime.getValue("to").jsonPrimitive.content)
        assertEquals(53536L, movie.getValue("ids").jsonObject.getValue("simkl").jsonPrimitive.content.toLong())
        assertEquals("tt0181852", movie.getValue("ids").jsonObject.getValue("imdb").jsonPrimitive.content)
        assertNull(movie.getValue("ids").jsonObject["trakt"])
        assertEquals(16498L, anime.getValue("ids").jsonObject.getValue("mal").jsonPrimitive.content.toLong())
    }

    @Test
    fun `history mutation groups show episodes and keeps timestamps at event granularity`() {
        val show = show(episode = TrackingEpisode(season = 1, number = 1))
        val secondEpisode = show.copy(episode = TrackingEpisode(season = 1, number = 2))
        val body = buildSimklHistoryMutationBody(
            listOf(
                TrackingHistoryItem(show, watchedAtEpochMs = 1_700_000_000_000L),
                TrackingHistoryItem(secondEpisode, watchedAtEpochMs = 1_700_003_600_000L),
                TrackingHistoryItem(movie(), watchedAtEpochMs = 1_700_000_000_000L),
            ),
        ).asObject()

        val showItem = body.getValue("shows").jsonArray.single().jsonObject
        val episodes = showItem
            .getValue("seasons").jsonArray.single().jsonObject
            .getValue("episodes").jsonArray
        assertEquals(2, episodes.size)
        assertNull(episodes[0].jsonObject["season"])
        assertEquals("2023-11-14T22:13:20Z", episodes[0].jsonObject.getValue("watched_at").jsonPrimitive.content)
        assertEquals("2023-11-14T23:13:20Z", episodes[1].jsonObject.getValue("watched_at").jsonPrimitive.content)

        val movieItem = body.getValue("movies").jsonArray.single().jsonObject
        assertEquals("2023-11-14T22:13:20Z", movieItem.getValue("watched_at").jsonPrimitive.content)
    }

    @Test
    fun `anime removal uses shows array and contains no response-only or watch fields`() {
        val body = buildSimklHistoryRemovalBody(
            listOf(anime(TrackingEpisode(number = 4))),
        ).asObject()

        assertNull(body["anime"])
        val item = body.getValue("shows").jsonArray.single().jsonObject
        assertNull(item["watched_at"])
        assertNull(item["status"])
        assertEquals(4, item.getValue("episodes").jsonArray.single().jsonObject.getValue("number").jsonPrimitive.content.toInt())
    }

    @Test
    fun `scrobble payload clamps progress and uses type-specific wrappers`() {
        val movieBody = buildSimklScrobbleBody(
            TrackingScrobbleEvent(movie(), progressPercent = 105.129),
        ).asObject()
        assertEquals(100.0, movieBody.getValue("progress").jsonPrimitive.content.toDouble())
        assertTrue("movie" in movieBody)
        assertFalse("show" in movieBody)

        val animeBody = buildSimklScrobbleBody(
            TrackingScrobbleEvent(
                anime(TrackingEpisode(season = 2, number = 4)),
                progressPercent = 42.236,
            ),
        ).asObject()
        assertEquals(42.24, animeBody.getValue("progress").jsonPrimitive.content.toDouble())
        assertTrue("anime" in animeBody)
        assertEquals(2, animeBody.getValue("episode").jsonObject.getValue("season").jsonPrimitive.content.toInt())
        assertEquals(4, animeBody.getValue("episode").jsonObject.getValue("number").jsonPrimitive.content.toInt())
    }

    @Test
    fun `service reports partial not found and treats duplicate stop as committed`() = runBlocking {
        val engine = RecordingEngine(
            response(
                status = 201,
                body = """{"added":{"movies":[{"to":"completed"}]},"not_found":{"movies":[{"title":"Missing"}],"shows":[]}}""",
            ),
            response(status = 409),
        )
        var now = 0L
        var committed = 0
        val service = SimklMutationService(
            client = SimklApiClient(
                engine = engine,
                accessToken = { "token" },
                onUnauthorized = {},
                nowEpochMs = { now },
                sleep = { duration -> now += duration },
                retryJitterMs = { 0L },
            ),
            onMutationCommitted = { committed += 1 },
        )

        val result = service.moveToList(
            items = listOf(movie(), movie().copy(title = "Missing", ids = TrackingExternalIds())),
            destination = TrackingListStatus.PLAN_TO_WATCH,
        )
        service.scrobble(
            action = TrackingScrobbleAction.STOP,
            event = TrackingScrobbleEvent(movie(), progressPercent = 90.0),
        )

        assertEquals(2, result.attemptedCount)
        assertEquals(1, result.notFoundCount)
        assertEquals(listOf(TrackingListStatus.COMPLETED), result.resolvedListStatuses)
        assertFalse(result.isComplete)
        assertEquals(listOf("/sync/add-to-list", "/scrobble/stop"), engine.paths)
        assertEquals(2, committed)
    }

    private fun String.asObject() = json.parseToJsonElement(this).jsonObject

    private fun movie() = TrackingMediaReference(
        kind = TrackingMediaKind.MOVIE,
        title = "Terminator 3: Rise of the Machines",
        year = 2003,
        ids = TrackingExternalIds(
            simkl = 53536,
            imdb = "tt0181852",
            tmdb = 296,
            trakt = 123,
        ),
    )

    private fun show(episode: TrackingEpisode? = null) = TrackingMediaReference(
        kind = TrackingMediaKind.SHOW,
        title = "The Walking Dead",
        year = 2010,
        ids = TrackingExternalIds(simkl = 2090, imdb = "tt1520211", tvdb = "153021"),
        episode = episode,
    )

    private fun anime(episode: TrackingEpisode? = null) = TrackingMediaReference(
        kind = TrackingMediaKind.ANIME,
        title = "Attack on Titan",
        year = 2013,
        ids = TrackingExternalIds(simkl = 39687, mal = 16498, anidb = 9541),
        episode = episode,
    )

    private class RecordingEngine(vararg responses: RawHttpResponse) : SimklHttpEngine {
        private val queued = responses.toMutableList()
        val paths = mutableListOf<String>()

        override suspend fun execute(
            method: String,
            url: String,
            headers: Map<String, String>,
            body: String,
        ): RawHttpResponse {
            paths += url.substringAfter("api.simkl.com").substringBefore('?')
            return queued.removeAt(0)
        }
    }

    private companion object {
        fun response(status: Int, body: String = "{}") = RawHttpResponse(
            status = status,
            statusText = "",
            url = "https://api.simkl.com/test",
            body = body,
            headers = emptyMap(),
        )
    }
}
