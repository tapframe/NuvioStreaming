package com.nuvio.app.features.simkl

import com.nuvio.app.features.tracking.TrackingMediaKind
import com.nuvio.app.features.watchprogress.WatchProgressSourceSimklPlayback
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SimklProjectionsTest {
    @Test
    fun `library projection exposes only plan to watch with attribution`() {
        val plan = entry(
            type = SimklMediaType.MOVIES,
            status = SimklListStatus.PLAN_TO_WATCH,
            id = 53536,
            imdb = "tt0181852",
            slug = "terminator-3-rise-of-the-machines",
            addedAt = "2023-11-14T22:13:20Z",
        )
        val completed = entry(
            type = SimklMediaType.MOVIES,
            status = SimklListStatus.COMPLETED,
            id = 53434,
            imdb = "tt0068646",
        )

        val items = SimklSyncSnapshot(entries = listOf(plan, completed)).toSimklLibraryItems()

        val item = items.single()
        assertEquals("tt0181852", item.id)
        assertEquals(setOf(SIMKL_WATCHLIST_KEY), item.listKeys)
        assertEquals("simkl", item.trackingProviderId)
        assertEquals("simkl:53536", item.trackingProviderItemId)
        assertEquals(
            "https://simkl.com/movies/53536/terminator-3-rise-of-the-machines",
            item.trackingSourceUrl,
        )
        assertTrue(item.poster.orEmpty().contains("simkl.in/posters/12/poster_w.webp"))
        assertEquals(1_700_000_000_000L, item.savedAtEpochMs)
    }

    @Test
    fun `watched projection includes movie events rich episodes and completed series marker`() {
        val movie = entry(
            type = SimklMediaType.MOVIES,
            status = SimklListStatus.COMPLETED,
            id = 53536,
            imdb = "tt0181852",
            lastWatchedAt = "2023-11-14T22:13:20Z",
        )
        val richShow = entry(
            type = SimklMediaType.SHOWS,
            status = SimklListStatus.WATCHING,
            id = 2090,
            imdb = "tt1520211",
            seasons = listOf(
                SimklSeason(
                    number = 1,
                    episodes = listOf(
                        SimklEpisode(number = 1, watchedAt = "2023-11-14T23:13:20Z"),
                        SimklEpisode(number = 2, watchedAt = null),
                    ),
                ),
            ),
        )
        val summaryOnlyCompletedShow = entry(
            type = SimklMediaType.ANIME,
            status = SimklListStatus.COMPLETED,
            id = 39687,
            imdb = "tt2560140",
            lastWatchedAt = "2023-11-15T00:13:20Z",
        )

        val projection = SimklSyncSnapshot(
            entries = listOf(movie, richShow, summaryOnlyCompletedShow),
        ).toSimklWatchedProjection()

        assertEquals(3, projection.items.size)
        assertNotNull(projection.items.singleOrNull { it.type == "movie" })
        val episode = projection.items.single { it.season == 1 && it.episode == 1 }
        assertEquals("tt1520211", episode.id)
        assertFalse(projection.items.any { it.episode == 2 })
        assertTrue(projection.items.any { it.id == "tt2560140" && it.season == null })
        assertTrue(projection.fullyWatchedSeriesKeys.any { "tt2560140" in it })
    }

    @Test
    fun `playback projection preserves Simkl session identity and percentage`() {
        val session = SimklPlaybackSession(
            id = 12345,
            progress = 42.2,
            pausedAt = "2024-04-30T22:13:00.250Z",
            type = "episode",
            episode = SimklPlaybackEpisode(
                season = 1,
                number = 3,
                title = "Chapter Three",
            ),
            show = media(id = 39687, imdb = "tt4574334", runtime = 50),
        )

        val entry = SimklSyncSnapshot(playback = listOf(session)).toSimklProgressEntries().single()

        assertEquals("tt4574334", entry.parentMetaId)
        assertEquals(1, entry.seasonNumber)
        assertEquals(3, entry.episodeNumber)
        assertEquals(42.2f, entry.progressPercent)
        assertEquals(3_000_000L, entry.durationMs)
        assertEquals(1_266_000L, entry.lastPositionMs)
        assertEquals("simkl-playback:12345", entry.progressKey)
        assertEquals(WatchProgressSourceSimklPlayback, entry.source)
        assertFalse(entry.isCompleted)
        assertEquals(1_714_515_180_250L, entry.lastUpdatedEpochMs)
    }

    @Test
    fun `media reference retains anime catalog and all accepted ids`() {
        val anime = entry(
            type = SimklMediaType.ANIME,
            status = SimklListStatus.WATCHING,
            id = 39687,
            imdb = "tt2560140",
            mal = 16498,
        )
        val snapshot = SimklSyncSnapshot(entries = listOf(anime))

        val reference = snapshot.mediaReference(
            contentId = "tt2560140",
            contentType = "series",
            season = 2,
            episode = 4,
        )

        assertEquals(TrackingMediaKind.ANIME, reference.kind)
        assertEquals(39687L, reference.ids.simkl)
        assertEquals(16498L, reference.ids.mal)
        assertEquals(2, reference.episode?.season)
        assertEquals(4, reference.episode?.number)
    }

    @Test
    fun `timestamp parser accepts UTC fractions and rejects invalid calendar values`() {
        assertEquals(0L, parseSimklUtcEpochMs("1970-01-01T00:00:00Z"))
        assertEquals(951_782_400_123L, parseSimklUtcEpochMs("2000-02-29T00:00:00.123Z"))
        assertNull(parseSimklUtcEpochMs("2023-02-29T00:00:00Z"))
        assertNull(parseSimklUtcEpochMs("2024-01-01T00:00:00+01:00"))
    }

    private fun entry(
        type: SimklMediaType,
        status: SimklListStatus,
        id: Long,
        imdb: String? = null,
        mal: Long? = null,
        slug: String? = null,
        addedAt: String? = null,
        lastWatchedAt: String? = null,
        seasons: List<SimklSeason> = emptyList(),
    ): SimklLibraryEntry = SimklLibraryEntry(
        mediaType = type,
        status = status,
        addedToWatchlistAt = addedAt,
        lastWatchedAt = lastWatchedAt,
        seasons = seasons,
        movie = if (type == SimklMediaType.MOVIES) media(id, imdb, mal, slug = slug) else null,
        show = if (type != SimklMediaType.MOVIES) media(id, imdb, mal, slug = slug) else null,
    )

    private fun media(
        id: Long,
        imdb: String? = null,
        mal: Long? = null,
        runtime: Int? = null,
        slug: String? = null,
    ): SimklMedia = SimklMedia(
        title = "Title $id",
        poster = "12/poster",
        year = 2020,
        runtime = runtime,
        ids = buildJsonObject {
            put("simkl", id)
            imdb?.let { put("imdb", it) }
            mal?.let { put("mal", it) }
            slug?.let { put("slug", it) }
        },
    )
}
