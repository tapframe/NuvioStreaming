package com.nuvio.app.features.simkl

import com.nuvio.app.features.addons.RawHttpResponse
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SimklSyncEngineTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `documented all items fixture decodes flexible ids and nullable fields`() {
        val response = json.decodeFromString<SimklAllItemsResponse>(ALL_ITEMS_FIXTURE)

        val show = response.entriesFor(SimklMediaType.SHOWS).single()
        assertEquals("2090", show.media?.ids?.idValue("simkl"))
        assertEquals("153021", show.media?.ids?.idValue("tvdb"))
        assertEquals(SimklListStatus.WATCHING, show.status)
        assertEquals("2026-05-15T00:32:20Z", show.seasons.single().episodes.single().watchedAt)

        val movie = response.entriesFor(SimklMediaType.MOVIES).single()
        assertEquals("238", movie.media?.ids?.idValue("tmdb"))
        assertNull(movie.userRating)
        assertEquals(SimklMediaType.MOVIES, movie.mediaType)
    }

    @Test
    fun `initial sync pulls each type sequentially before playback and activities`() = runBlocking {
        val remote = ScriptedRemote(
            Step.AllItems(SimklMediaType.SHOWS, responseOf(entry(SimklMediaType.SHOWS, "1"))),
            Step.AllItems(SimklMediaType.MOVIES, responseOf(entry(SimklMediaType.MOVIES, "2"))),
            Step.AllItems(SimklMediaType.ANIME, responseOf(entry(SimklMediaType.ANIME, "3"))),
            Step.Playback(listOf(playback("2"))),
            Step.Activities(activities(all = "v1")),
        )

        val result = SimklSyncEngine(remote) { 500L }.synchronize(SimklSyncSnapshot())

        assertTrue(result.isInitialized)
        assertEquals("v1", result.watermark)
        assertEquals(listOf("1", "2", "3"), result.entries.mapNotNull { it.media?.ids?.idValue("simkl") })
        assertEquals(1, result.playback.size)
        assertEquals(500L, result.lastSyncedAtEpochMs)
        assertTrue(remote.isExhausted)
        assertTrue(remote.allItemsRequests.all { request ->
            request.dateFrom == null && !request.includeEpisodeDetails && !request.idsOnly
        })
    }

    @Test
    fun `unchanged activities gate avoids library and playback calls`() = runBlocking {
        val current = SimklSyncSnapshot(
            isInitialized = true,
            watermark = "v1",
            activities = activities(all = "v1"),
            entries = listOf(entry(SimklMediaType.SHOWS, "1")),
            lastCheckedAtEpochMs = 10L,
        )
        val remote = ScriptedRemote(Step.Activities(activities(all = "v1")))

        val result = SimklSyncEngine(remote) { 20L }.synchronize(current)

        assertEquals(current.entries, result.entries)
        assertEquals(20L, result.lastCheckedAtEpochMs)
        assertTrue(remote.isExhausted)
    }

    @Test
    fun `delta merge reconciles removals and replaces changed playback atomically`() = runBlocking {
        val previousActivities = activities(all = "v1", removed = "r1", playback = "p1")
        val current = SimklSyncSnapshot(
            isInitialized = true,
            watermark = "v1",
            activities = previousActivities,
            entries = listOf(
                entry(SimklMediaType.SHOWS, "1"),
                entry(SimklMediaType.MOVIES, "2", SimklListStatus.PLAN_TO_WATCH),
            ),
            playback = listOf(playback("1")),
        )
        val changedActivities = activities(all = "v2", removed = "r2", playback = "p2")
        val delta = SimklAllItemsResponse(
            shows = listOf(entry(SimklMediaType.SHOWS, "3")),
            movies = listOf(entry(SimklMediaType.MOVIES, "2", SimklListStatus.DROPPED)),
        )
        val authoritative = SimklAllItemsResponse(
            shows = listOf(entry(SimklMediaType.SHOWS, "3")),
            movies = listOf(entry(SimklMediaType.MOVIES, "2")),
            anime = emptyList(),
        )
        val remote = ScriptedRemote(
            Step.Activities(changedActivities),
            Step.AllItems(null, delta),
            Step.AllItems(null, authoritative),
            Step.Playback(listOf(playback("3"))),
        )

        val result = SimklSyncEngine(remote) { 900L }.synchronize(current)

        assertEquals(setOf("2", "3"), result.entries.mapNotNull { it.media?.ids?.idValue("simkl") }.toSet())
        assertEquals(
            SimklListStatus.DROPPED,
            result.entries.single { it.media?.ids?.idValue("simkl") == "2" }.status,
        )
        assertEquals("3", result.playback.single().media?.ids?.idValue("simkl"))
        assertEquals("v2", result.watermark)
        assertTrue(remote.allItemsRequests[0].includeEpisodeDetails)
        assertEquals("v1", remote.allItemsRequests[0].dateFrom)
        assertTrue(remote.allItemsRequests[1].idsOnly)
        assertTrue(remote.isExhausted)
    }

    @Test
    fun `failed delta leaves the caller snapshot unchanged`() = runBlocking {
        val current = SimklSyncSnapshot(
            isInitialized = true,
            watermark = "v1",
            activities = activities(all = "v1"),
            entries = listOf(entry(SimklMediaType.SHOWS, "1")),
        )
        val remote = ScriptedRemote(
            Step.Activities(activities(all = "v2")),
            Step.Failure(IllegalStateException("network")),
        )

        assertFailsWith<IllegalStateException> {
            SimklSyncEngine(remote) { 1_000L }.synchronize(current)
        }
        assertEquals("v1", current.watermark)
        assertEquals("1", current.entries.single().media?.ids?.idValue("simkl"))
    }

    @Test
    fun `remote keeps initial pull minimal and adds rich flags only to dated delta`() = runBlocking {
        var now = 0L
        val urls = mutableListOf<String>()
        val engine = SimklHttpEngine { _, url, _, _ ->
            urls += url
            RawHttpResponse(200, "", url, "{}", emptyMap())
        }
        val client = SimklApiClient(
            engine = engine,
            accessToken = { "token" },
            onUnauthorized = {},
            nowEpochMs = { now },
            sleep = { duration -> now += duration },
            retryJitterMs = { 0L },
        )
        val remote = SimklApiSyncRemote(client)

        remote.fetchAllItems(SimklAllItemsRequest(type = SimklMediaType.SHOWS))
        remote.fetchAllItems(
            SimklAllItemsRequest(
                dateFrom = "2026-05-08T14:23:11Z",
                includeEpisodeDetails = true,
            ),
        )
        remote.fetchAllItems(SimklAllItemsRequest(idsOnly = true))

        assertFalse("date_from=" in urls[0])
        assertFalse("extended=" in urls[0])
        assertTrue("date_from=2026-05-08T14%3A23%3A11Z" in urls[1])
        assertTrue("extended=full_anime_seasons" in urls[1])
        assertTrue("episode_watched_at=yes" in urls[1])
        assertTrue("include_all_episodes=original" in urls[1])
        assertTrue("extended=simkl_ids_only" in urls[2])
    }

    @Test
    fun `remote treats top level empty all items variants as empty`() = runBlocking {
        listOf("null", "[]").forEach { body ->
            val engine = SimklHttpEngine { _, url, _, _ ->
                RawHttpResponse(200, "", url, body, emptyMap())
            }
            val client = SimklApiClient(
                engine = engine,
                accessToken = { "token" },
                onUnauthorized = {},
                nowEpochMs = { 0L },
                sleep = {},
                retryJitterMs = { 0L },
            )

            val response = SimklApiSyncRemote(client).fetchAllItems(
                SimklAllItemsRequest(type = SimklMediaType.ANIME),
            )

            assertTrue(response.entriesFor(SimklMediaType.ANIME).isEmpty())
            assertTrue(response.presentTypes().isEmpty())
        }
    }

    private sealed interface Step {
        data class Activities(val value: SimklActivities) : Step
        data class AllItems(val type: SimklMediaType?, val value: SimklAllItemsResponse) : Step
        data class Playback(val value: List<SimklPlaybackSession>) : Step
        data class Failure(val error: Throwable) : Step
    }

    private class ScriptedRemote(vararg steps: Step) : SimklSyncRemote {
        private val remaining = steps.toMutableList()
        val allItemsRequests = mutableListOf<SimklAllItemsRequest>()
        val isExhausted: Boolean get() = remaining.isEmpty()

        override suspend fun fetchActivities(): SimklActivities = when (val step = next()) {
            is Step.Activities -> step.value
            is Step.Failure -> throw step.error
            else -> error("Expected activities, got $step")
        }

        override suspend fun fetchAllItems(request: SimklAllItemsRequest): SimklAllItemsResponse {
            allItemsRequests += request
            return when (val step = next()) {
                is Step.AllItems -> {
                    assertEquals(step.type, request.type)
                    step.value
                }
                is Step.Failure -> throw step.error
                else -> error("Expected all-items, got $step")
            }
        }

        override suspend fun fetchPlayback(): List<SimklPlaybackSession> = when (val step = next()) {
            is Step.Playback -> step.value
            is Step.Failure -> throw step.error
            else -> error("Expected playback, got $step")
        }

        private fun next(): Step = remaining.removeAt(0)
    }

    private companion object {
        fun entry(
            type: SimklMediaType,
            id: String,
            status: SimklListStatus = SimklListStatus.WATCHING,
        ) = SimklLibraryEntry(
            mediaType = type,
            status = status,
            show = if (type == SimklMediaType.MOVIES) null else media(id),
            movie = if (type == SimklMediaType.MOVIES) media(id) else null,
        )

        fun media(id: String) = SimklMedia(
            title = "Title $id",
            ids = buildJsonObject { put("simkl", id.toLong()) },
        )

        fun responseOf(entry: SimklLibraryEntry): SimklAllItemsResponse = when (entry.mediaType) {
            SimklMediaType.SHOWS -> SimklAllItemsResponse(shows = listOf(entry))
            SimklMediaType.MOVIES -> SimklAllItemsResponse(movies = listOf(entry))
            SimklMediaType.ANIME -> SimklAllItemsResponse(anime = listOf(entry))
        }

        fun playback(id: String) = SimklPlaybackSession(
            id = id.toLong(),
            progress = 42.0,
            movie = media(id),
        )

        fun activities(
            all: String,
            removed: String = "removed",
            playback: String = "playback",
        ): SimklActivities {
            val domain = SimklActivityDomain(
                all = all,
                removedFromList = removed,
                playback = playback,
            )
            return SimklActivities(all = all, tvShows = domain, movies = domain, anime = domain)
        }

        const val ALL_ITEMS_FIXTURE = """
            {
              "shows": [{
                "last_watched_at": "2026-05-15T00:35:15Z",
                "user_rating": null,
                "status": "watching",
                "last_watched": "S01E01",
                "watched_episodes_count": 1,
                "total_episodes_count": 177,
                "show": {
                  "title": "The Walking Dead",
                  "year": 2010,
                  "ids": {"simkl": 2090, "imdb": "tt1520211", "tvdb": "153021"}
                },
                "seasons": [{"number": 1, "episodes": [{"number": 1, "watched_at": "2026-05-15T00:32:20Z"}]}]
              }],
              "movies": [{
                "user_rating": null,
                "status": "completed",
                "movie": {
                  "title": "The Godfather",
                  "year": 1972,
                  "ids": {"simkl": 53434, "imdb": "tt0068646", "tmdb": "238"}
                }
              }]
            }
        """
    }
}
