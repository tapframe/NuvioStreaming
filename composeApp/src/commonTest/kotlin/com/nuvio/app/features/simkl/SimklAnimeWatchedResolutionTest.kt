package com.nuvio.app.features.simkl

import com.nuvio.app.features.tracking.TrackingCatalogReference
import com.nuvio.app.features.tracking.TrackingEpisode
import com.nuvio.app.features.tracking.TrackingExternalIds
import com.nuvio.app.features.tracking.TrackingMediaKind
import com.nuvio.app.features.tracking.TrackingMediaReference
import com.nuvio.app.features.watched.watchedItemKey
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for anime watched status resolution across different content ID scenarios:
 * - Direct MAL entry (single MAL = single season)
 * - Multiple MAL entries sharing the same IMDB (different seasons of the same franchise)
 * - Split season (one TVDB season mapped to multiple MAL entries)
 * - Franchise parent content ID that doesn't exist in Simkl
 * - resolveAnimeEpisodeForSimkl() write-path transformation
 * - Alternate content ID emission for watched projection
 */
class SimklAnimeWatchedResolutionTest {

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 1: Multiple MAL entries represent different seasons of the same IMDB.
    // canonicalContentId() for both returns "tt2560140" (IMDB wins).
    // Watched items end up under the same contentId with different tvdb seasons.
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `multiple MAL entries with same IMDB produce watched items for all seasons`() {
        val snapshot = snapshotWithMultiSeasonAnime()
        val projection = snapshot.toSimklWatchedProjection()

        val s1Items = projection.items.filter { it.id == "tt2560140" && it.season == 1 }
        val s2Items = projection.items.filter { it.id == "tt2560140" && it.season == 2 }

        assertEquals(3, s1Items.size)
        assertEquals(2, s2Items.size)
        assertTrue(s1Items.any { it.episode == 1 })
        assertTrue(s1Items.any { it.episode == 3 })
        assertTrue(s2Items.any { it.episode == 1 })
        assertTrue(s2Items.any { it.episode == 2 })
    }

    @Test
    fun `querying watched status via IMDB finds episodes from both MAL entries`() {
        val snapshot = snapshotWithMultiSeasonAnime()
        val items = snapshot.toSimklWatchedProjection().items

        assertTrue(items.any { it.id == "tt2560140" && it.season == 1 && it.episode == 1 })
        assertTrue(items.any { it.id == "tt2560140" && it.season == 2 && it.episode == 2 })
        assertFalse(items.any { it.id == "tt2560140" && it.season == 2 && it.episode == 99 })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 2: MAL contentId resolves to matching entry.
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `MAL contentId resolves to matching entry via matchesContentId`() {
        val snapshot = snapshotWithMultiSeasonAnime()

        val entry = snapshot.entries.firstOrNull { it.matchesContentId("mal:123") }
        assertNotNull(entry)
        assertEquals("tt2560140", entry.media?.canonicalContentId())
    }

    @Test
    fun `resolveCanonicalContentId maps MAL ID to IMDB canonical`() {
        val snapshot = snapshotWithMultiSeasonAnime()

        assertEquals("tt2560140", snapshot.resolveCanonicalContentId("mal:123"))
        assertEquals("tt2560140", snapshot.resolveCanonicalContentId("mal:4372"))
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 3: Alternate content IDs — anime alternate watched keys are
    // produced separately (not as duplicate items) for isWatched resolution.
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `anime watched items are only emitted under canonical ID not duplicated`() {
        val snapshot = snapshotWithMultiSeasonAnime()
        val items = snapshot.toSimklWatchedProjection().items

        // Items exist only under canonical "tt2560140" (IMDB wins)
        assertTrue(items.all { it.id == "tt2560140" })
        // No items under MAL alternate IDs
        assertFalse(items.any { it.id == "mal:123" })
        assertFalse(items.any { it.id == "mal:4372" })
    }

    @Test
    fun `animeAlternateWatchedKeys produces keys for alternate IDs`() {
        val snapshot = snapshotWithMultiSeasonAnime()
        val extraKeys = snapshot.animeAlternateWatchedKeys()

        // Should contain keys for "mal:123" episodes (alternate of canonical "tt2560140")
        assertTrue(extraKeys.contains(watchedItemKey("series", "mal:123", 1, 1)))
        assertTrue(extraKeys.contains(watchedItemKey("series", "mal:123", 1, 2)))
        assertTrue(extraKeys.contains(watchedItemKey("series", "mal:123", 1, 3)))

        // Should contain keys for "mal:4372" episodes
        assertTrue(extraKeys.contains(watchedItemKey("series", "mal:4372", 2, 1)))
        assertTrue(extraKeys.contains(watchedItemKey("series", "mal:4372", 2, 2)))

        // Should contain simkl: alternate keys too
        assertTrue(extraKeys.contains(watchedItemKey("series", "simkl:39687", 1, 1)))
        assertTrue(extraKeys.contains(watchedItemKey("series", "simkl:39688", 2, 1)))
    }

    @Test
    fun `non-anime show entries do NOT produce alternate watched keys`() {
        val show = SimklLibraryEntry(
            mediaType = SimklMediaType.SHOWS,
            status = SimklListStatus.WATCHING,
            lastWatchedAt = "2023-11-14T23:00:00Z",
            seasons = listOf(
                SimklSeason(1, listOf(
                    SimklEpisode(1, "2023-11-14T23:00:00Z", SimklEpisodeMapping(1, 1)),
                )),
            ),
            show = SimklMedia(
                title = "Regular Show",
                year = 2020,
                ids = buildJsonObject {
                    put("simkl", 99999)
                    put("imdb", "tt9999999")
                    put("mal", 88888)
                },
            ),
        )
        val snapshot = SimklSyncSnapshot(entries = listOf(show))
        val extraKeys = snapshot.animeAlternateWatchedKeys()

        assertTrue(extraKeys.isEmpty())
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 4: Franchise parent content ID that doesn't exist in Simkl.
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `franchise parent not in snapshot cannot be resolved`() {
        val snapshot = snapshotWithMultiSeasonAnime()

        assertNull(snapshot.resolveCanonicalContentId("mal:42423"))
    }

    @Test
    fun `anime videoId resolves watched episode via isWatchedByAnimeVideoId`() {
        val snapshot = snapshotWithMultiSeasonAnime()

        // "mal:123:3" → entry with mal=123, episode 3 (watched)
        assertTrue(isWatchedByAnimeVideoId(snapshot, "mal:123:3", episode = 3))

        // "mal:4372:1" → entry with mal=4372, episode 1 (watched)
        assertTrue(isWatchedByAnimeVideoId(snapshot, "mal:4372:1", episode = 1))

        // "mal:4372:99" → episode 99 not watched
        assertFalse(isWatchedByAnimeVideoId(snapshot, "mal:4372:99", episode = 99))

        // Non-existent MAL → false
        assertFalse(isWatchedByAnimeVideoId(snapshot, "mal:42423:5", episode = 5))
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 5: Split season — one TVDB season, two MAL entries.
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `split season entries produce watched items with correct tvdb mapping`() {
        val snapshot = snapshotWithSplitSeason()
        val items = snapshot.toSimklWatchedProjection().items

        // mal:11757 episodes map to TVDB S1E1-S1E14
        assertTrue(items.any { it.id == "tt2250192" && it.season == 1 && it.episode == 1 })
        assertTrue(items.any { it.id == "tt2250192" && it.season == 1 && it.episode == 14 })

        // mal:11759 episodes map to TVDB S1E15-S1E19 (only 5 watched)
        assertTrue(items.any { it.id == "tt2250192" && it.season == 1 && it.episode == 15 })
        assertTrue(items.any { it.id == "tt2250192" && it.season == 1 && it.episode == 19 })

        // Episode 20+ not watched
        assertFalse(items.any { it.id == "tt2250192" && it.season == 1 && it.episode == 20 })
    }

    @Test
    fun `split season resolves watched via isWatchedByAnimeVideoId`() {
        val snapshot = snapshotWithSplitSeason()

        // "mal:11757:14" → entry with mal=11757, episode 14 (watched)
        assertTrue(isWatchedByAnimeVideoId(snapshot, "mal:11757:14", episode = 14))

        // "mal:11759:1" → entry with mal=11759, episode 1 (watched)
        assertTrue(isWatchedByAnimeVideoId(snapshot, "mal:11759:1", episode = 1))

        // "mal:11759:6" → entry with mal=11759, episode 6 (NOT watched)
        assertFalse(isWatchedByAnimeVideoId(snapshot, "mal:11759:6", episode = 6))
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 6: resolveAnimeEpisodeForSimkl — write path transformation
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `resolveAnimeEpisodeForSimkl overrides MAL ID and episode from videoId`() {
        val reference = TrackingMediaReference(
            kind = TrackingMediaKind.ANIME,
            title = "Some Anime",
            year = 2020,
            ids = TrackingExternalIds(imdb = "tt2560140", mal = 31240, simkl = 39687),
            episode = TrackingEpisode(season = 2, number = 20),
            catalog = TrackingCatalogReference(
                contentId = "mal:31240",
                contentType = "series",
                videoId = "mal:42203:7",
            ),
        )

        val resolved = reference.resolveAnimeEpisodeForSimkl()

        assertEquals(42203L, resolved.ids.mal)
        assertNull(resolved.ids.imdb)
        assertNull(resolved.ids.simkl)
        assertNull(resolved.episode?.season)
        assertEquals(7, resolved.episode?.number)
    }

    @Test
    fun `resolveAnimeEpisodeForSimkl with kitsu videoId`() {
        val reference = TrackingMediaReference(
            kind = TrackingMediaKind.ANIME,
            title = "Kitsu Anime",
            ids = TrackingExternalIds(imdb = "tt5311514", kitsu = 99999),
            episode = TrackingEpisode(season = 1, number = 5),
            catalog = TrackingCatalogReference(
                contentId = "kitsu:99999",
                contentType = "series",
                videoId = "kitsu:12268:3",
            ),
        )

        val resolved = reference.resolveAnimeEpisodeForSimkl()

        assertEquals(12268L, resolved.ids.kitsu)
        assertNull(resolved.ids.imdb)
        assertNull(resolved.episode?.season)
        assertEquals(3, resolved.episode?.number)
    }

    @Test
    fun `resolveAnimeEpisodeForSimkl returns unchanged for non-anime`() {
        val reference = TrackingMediaReference(
            kind = TrackingMediaKind.SHOW,
            title = "Regular Show",
            ids = TrackingExternalIds(imdb = "tt1234567"),
            episode = TrackingEpisode(season = 2, number = 5),
            catalog = TrackingCatalogReference(
                contentId = "tt1234567",
                contentType = "series",
                videoId = "mal:123:5",
            ),
        )

        val resolved = reference.resolveAnimeEpisodeForSimkl()

        assertEquals(reference, resolved)
    }

    @Test
    fun `resolveAnimeEpisodeForSimkl returns unchanged for IMDB videoId prefix`() {
        val reference = TrackingMediaReference(
            kind = TrackingMediaKind.ANIME,
            title = "Some Anime",
            ids = TrackingExternalIds(imdb = "tt2560140", mal = 16498),
            episode = TrackingEpisode(season = 1, number = 5),
            catalog = TrackingCatalogReference(
                contentId = "tt2560140",
                contentType = "series",
                videoId = "tt2560140:1:5",
            ),
        )

        val resolved = reference.resolveAnimeEpisodeForSimkl()

        // "tt2560140" prefix is not an anime prefix → unchanged
        assertEquals(reference, resolved)
    }

    @Test
    fun `resolveAnimeEpisodeForSimkl returns unchanged without catalog videoId`() {
        val reference = TrackingMediaReference(
            kind = TrackingMediaKind.ANIME,
            title = "Some Anime",
            ids = TrackingExternalIds(mal = 16498),
            episode = TrackingEpisode(season = 1, number = 5),
            catalog = null,
        )

        val resolved = reference.resolveAnimeEpisodeForSimkl()

        assertEquals(reference, resolved)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 7: Kitsu content IDs — same behavior as MAL.
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `kitsu contentId resolves to canonical IMDB`() {
        val entry = animeEntry(simklId = 60001, imdb = "tt5311514", kitsu = 12268, seasons = listOf(
            SimklSeason(1, listOf(
                SimklEpisode(1, "2024-01-01T10:00:00Z", SimklEpisodeMapping(1, 1)),
                SimklEpisode(2, "2024-01-01T10:30:00Z", SimklEpisodeMapping(1, 2)),
            )),
        ))
        val snapshot = SimklSyncSnapshot(entries = listOf(entry))

        assertTrue(snapshot.entries.any { it.matchesContentId("kitsu:12268") })
        assertTrue(snapshot.entries.any { it.matchesContentId("tt5311514") })
        assertEquals("tt5311514", snapshot.resolveCanonicalContentId("kitsu:12268"))
    }

    @Test
    fun `kitsu videoId resolves watched episode`() {
        val entry = animeEntry(simklId = 60001, imdb = "tt5311514", kitsu = 12268, seasons = listOf(
            SimklSeason(1, listOf(
                SimklEpisode(1, "2024-01-01T10:00:00Z", SimklEpisodeMapping(1, 1)),
                SimklEpisode(2, "2024-01-01T10:30:00Z", SimklEpisodeMapping(1, 2)),
                SimklEpisode(3, null, SimklEpisodeMapping(1, 3)),
            )),
        ))
        val snapshot = SimklSyncSnapshot(entries = listOf(entry))

        assertTrue(isWatchedByAnimeVideoId(snapshot, "kitsu:12268:2", episode = 2))
        assertFalse(isWatchedByAnimeVideoId(snapshot, "kitsu:12268:3", episode = 3))
    }

    @Test
    fun `kitsu multi-season with same IMDB merges correctly`() {
        val s1 = animeEntry(simklId = 60001, imdb = "tt5311514", kitsu = 12268, seasons = listOf(
            SimklSeason(1, listOf(
                SimklEpisode(1, "2024-01-01T10:00:00Z", SimklEpisodeMapping(1, 1)),
                SimklEpisode(12, "2024-01-12T10:00:00Z", SimklEpisodeMapping(1, 12)),
            )),
        ))
        val s2 = animeEntry(simklId = 60002, imdb = "tt5311514", kitsu = 42422, seasons = listOf(
            SimklSeason(1, listOf(
                SimklEpisode(1, "2024-04-01T10:00:00Z", SimklEpisodeMapping(2, 1)),
                SimklEpisode(13, "2024-04-13T10:00:00Z", SimklEpisodeMapping(2, 13)),
            )),
        ))
        val snapshot = SimklSyncSnapshot(entries = listOf(s1, s2))
        val items = snapshot.toSimklWatchedProjection().items

        val allEps = items.filter { it.id == "tt5311514" }
        assertEquals(4, allEps.size)
        assertTrue(allEps.any { it.season == 1 && it.episode == 1 })
        assertTrue(allEps.any { it.season == 1 && it.episode == 12 })
        assertTrue(allEps.any { it.season == 2 && it.episode == 1 })
        assertTrue(allEps.any { it.season == 2 && it.episode == 13 })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 8: IMDB contentId with seasons from multiple MAL entries
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `IMDB contentId with 3 seasons from 3 MAL entries all mapped correctly`() {
        val s1 = animeEntry(simklId = 100, imdb = "tt2560140", mal = 16498, seasons = listOf(
            SimklSeason(1, listOf(
                SimklEpisode(1, "2023-01-01T00:00:00Z", SimklEpisodeMapping(1, 1)),
                SimklEpisode(25, "2023-01-25T00:00:00Z", SimklEpisodeMapping(1, 25)),
            )),
        ))
        val s2 = animeEntry(simklId = 101, imdb = "tt2560140", mal = 25777, seasons = listOf(
            SimklSeason(1, listOf(
                SimklEpisode(1, "2023-04-01T00:00:00Z", SimklEpisodeMapping(2, 1)),
                SimklEpisode(12, "2023-04-12T00:00:00Z", SimklEpisodeMapping(2, 12)),
            )),
        ))
        val s3 = animeEntry(simklId = 102, imdb = "tt2560140", mal = 36456, seasons = listOf(
            SimklSeason(1, listOf(
                SimklEpisode(1, "2023-07-01T00:00:00Z", SimklEpisodeMapping(3, 1)),
                SimklEpisode(22, "2023-07-22T00:00:00Z", SimklEpisodeMapping(3, 22)),
            )),
        ))
        val snapshot = SimklSyncSnapshot(entries = listOf(s1, s2, s3))
        val items = snapshot.toSimklWatchedProjection().items

        val allEps = items.filter { it.id == "tt2560140" }
        assertEquals(6, allEps.size)
        assertTrue(allEps.any { it.season == 1 && it.episode == 1 })
        assertTrue(allEps.any { it.season == 1 && it.episode == 25 })
        assertTrue(allEps.any { it.season == 2 && it.episode == 1 })
        assertTrue(allEps.any { it.season == 2 && it.episode == 12 })
        assertTrue(allEps.any { it.season == 3 && it.episode == 1 })
        assertTrue(allEps.any { it.season == 3 && it.episode == 22 })
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 9: Fully watched anime marks all alternate IDs as fully watched
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `completed anime entry marks fullyWatchedSeriesKeys for canonical ID`() {
        val entry = animeEntry(simklId = 39687, imdb = "tt2560140", mal = 123, seasons = listOf(
            SimklSeason(1, listOf(
                SimklEpisode(1, "2023-11-14T23:00:00Z", SimklEpisodeMapping(1, 1)),
            )),
        )).copy(status = SimklListStatus.COMPLETED)
        val snapshot = SimklSyncSnapshot(entries = listOf(entry))
        val projection = snapshot.toSimklWatchedProjection()

        // fullyWatchedSeriesKeys contains canonical ID only
        assertTrue(projection.fullyWatchedSeriesKeys.any { "tt2560140" in it })
        // Alternate keys go into animeAlternateWatchedKeys instead
        val extraKeys = snapshot.animeAlternateWatchedKeys()
        assertTrue(extraKeys.contains(watchedItemKey("series", "mal:123")))
        assertTrue(extraKeys.contains(watchedItemKey("series", "simkl:39687")))
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario 10: Library projection uses "anime" type for anime entries
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    fun `library projection uses anime type for anime entries`() {
        val entry = animeEntry(simklId = 39687, imdb = "tt2560140", mal = 16498)
        val snapshot = SimklSyncSnapshot(entries = listOf(entry))
        val projection = snapshot.toSimklLibraryProjection()

        val item = projection.items.singleOrNull { it.id == "tt2560140" }
        assertNotNull(item)
        assertEquals("anime", item.type)
    }

    @Test
    fun `library status definitions include anime in supportedContentTypes`() {
        simklLibraryStatusDefinitions.forEach { definition ->
            if (definition.status != SimklListStatus.PLAN_TO_WATCH) {
                assertTrue(
                    "anime" in definition.supportedContentTypes,
                    "Status ${definition.status} should support anime",
                )
            }
        }
        // Plan to Watch also supports anime
        val planToWatch = simklLibraryStatusDefinitions.single { it.status == SimklListStatus.PLAN_TO_WATCH }
        assertTrue("anime" in planToWatch.supportedContentTypes)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Two MAL entries sharing the same IMDB, representing two seasons:
     * - mal:123 → TVDB season 1 (ep 1-3 watched)
     * - mal:4372 → TVDB season 2 (ep 1-2 watched)
     */
    private fun snapshotWithMultiSeasonAnime(): SimklSyncSnapshot {
        val season1Entry = animeEntry(
            simklId = 39687,
            imdb = "tt2560140",
            mal = 123,
            seasons = listOf(
                SimklSeason(1, listOf(
                    SimklEpisode(1, "2023-11-14T23:00:00Z", SimklEpisodeMapping(1, 1)),
                    SimklEpisode(2, "2023-11-14T23:10:00Z", SimklEpisodeMapping(1, 2)),
                    SimklEpisode(3, "2023-11-14T23:20:00Z", SimklEpisodeMapping(1, 3)),
                )),
            ),
        )
        val season2Entry = animeEntry(
            simklId = 39688,
            imdb = "tt2560140",
            mal = 4372,
            seasons = listOf(
                SimklSeason(1, listOf(
                    SimklEpisode(1, "2023-12-01T20:00:00Z", SimklEpisodeMapping(2, 1)),
                    SimklEpisode(2, "2023-12-01T20:30:00Z", SimklEpisodeMapping(2, 2)),
                )),
            ),
        )
        return SimklSyncSnapshot(entries = listOf(season1Entry, season2Entry))
    }

    /**
     * Split season: one TVDB season spread across two MAL entries.
     * - mal:11757 → TVDB S1E1-S1E14 (all 14 episodes watched)
     * - mal:11759 → TVDB S1E15-S1E25 (episodes 1-5 watched as S1E15-S1E19)
     */
    private fun snapshotWithSplitSeason(): SimklSyncSnapshot {
        val firstHalf = animeEntry(
            simklId = 50001,
            imdb = "tt2250192",
            mal = 11757,
            seasons = listOf(
                SimklSeason(1, (1..14).map { ep ->
                    SimklEpisode(
                        ep,
                        "2023-11-14T23:${ep.toString().padStart(2, '0')}:00Z",
                        SimklEpisodeMapping(1, ep),
                    )
                }),
            ),
        )
        val secondHalf = animeEntry(
            simklId = 50002,
            imdb = "tt2250192",
            mal = 11759,
            seasons = listOf(
                SimklSeason(1, (1..11).map { ep ->
                    SimklEpisode(
                        ep,
                        if (ep <= 5) "2023-11-15T${ep.toString().padStart(2, '0')}:00:00Z" else null,
                        SimklEpisodeMapping(1, 14 + ep),
                    )
                }),
            ),
        )
        return SimklSyncSnapshot(entries = listOf(firstHalf, secondHalf))
    }

    private fun animeEntry(
        simklId: Long,
        imdb: String? = null,
        mal: Long? = null,
        kitsu: Long? = null,
        seasons: List<SimklSeason> = emptyList(),
    ): SimklLibraryEntry = SimklLibraryEntry(
        mediaType = SimklMediaType.ANIME,
        status = SimklListStatus.WATCHING,
        lastWatchedAt = "2023-12-01T20:00:00Z",
        seasons = seasons,
        show = SimklMedia(
            title = "Anime $simklId",
            poster = "poster/$simklId",
            year = 2020,
            ids = buildJsonObject {
                put("simkl", simklId)
                imdb?.let { put("imdb", it) }
                mal?.let { put("mal", it) }
                kitsu?.let { put("kitsu", it) }
            },
        ),
    )
}
