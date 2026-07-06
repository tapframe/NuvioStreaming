package com.nuvio.app.features.watching.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class WatchingPoliciesTest {
    private val show = WatchingContentRef(type = "series", id = "show")

    @Test
    fun hasWatchedAllMainSeasonEpisodes_ignores_specials() {
        val episodes = listOf(
            WatchingReleasedEpisode(videoId = "special", seasonNumber = 0, episodeNumber = 1, releasedDate = "2026-03-01"),
            WatchingReleasedEpisode(videoId = "ep1", seasonNumber = 1, episodeNumber = 1, releasedDate = "2026-03-08"),
            WatchingReleasedEpisode(videoId = "ep2", seasonNumber = 1, episodeNumber = 2, releasedDate = "2026-03-15"),
        )

        val result = hasWatchedAllMainSeasonEpisodes(
            episodes = episodes,
            todayIsoDate = "2026-03-30",
            isEpisodeWatched = { episode -> episode.seasonNumber == 1 },
        )

        assertTrue(result)
    }

    @Test
    fun hasWatchedAllMainSeasonEpisodes_ignores_explicitly_unavailable_episodes() {
        val episodes = listOf(
            WatchingReleasedEpisode(videoId = "ep1", seasonNumber = 1, episodeNumber = 1, releasedDate = "2026-03-01"),
            WatchingReleasedEpisode(videoId = "phantom", seasonNumber = 3, episodeNumber = 1, releasedDate = null, available = false),
        )

        assertEquals(
            listOf("ep1"),
            releasedMainSeasonEpisodes(
                episodes = episodes,
                todayIsoDate = "2026-07-05",
            ).map(WatchingReleasedEpisode::videoId),
        )

        val result = hasWatchedAllMainSeasonEpisodes(
            episodes = episodes,
            todayIsoDate = "2026-07-05",
            isEpisodeWatched = { episode -> episode.videoId == "ep1" },
        )

        assertTrue(result)
    }

    @Test
    fun latestCompletedSeriesEpisode_prefers_newer_manual_watch_marker() {
        val latestCompleted = latestCompletedSeriesEpisode(
            content = show,
            progressRecords = listOf(
                WatchingProgressRecord(
                    content = show,
                    videoId = "show:1:2",
                    seasonNumber = 1,
                    episodeNumber = 2,
                    lastUpdatedEpochMs = 100L,
                    isCompleted = true,
                ),
            ),
            watchedRecords = listOf(
                WatchingWatchedRecord(
                    content = show,
                    seasonNumber = 1,
                    episodeNumber = 3,
                    markedAtEpochMs = 200L,
                ),
            ),
        )

        assertNotNull(latestCompleted)
        assertEquals(1, latestCompleted.seasonNumber)
        assertEquals(3, latestCompleted.episodeNumber)
        assertEquals(200L, latestCompleted.markedAtEpochMs)
    }

    @Test
    fun latestCompletedSeriesEpisode_prefers_newer_progress_marker() {
        val latestCompleted = latestCompletedSeriesEpisode(
            content = show,
            progressRecords = listOf(
                WatchingProgressRecord(
                    content = show,
                    videoId = "show:1:3",
                    seasonNumber = 1,
                    episodeNumber = 3,
                    lastUpdatedEpochMs = 300L,
                    isCompleted = true,
                ),
            ),
            watchedRecords = listOf(
                WatchingWatchedRecord(
                    content = show,
                    seasonNumber = 1,
                    episodeNumber = 2,
                    markedAtEpochMs = 200L,
                ),
            ),
        )

        assertNotNull(latestCompleted)
        assertEquals(1, latestCompleted.seasonNumber)
        assertEquals(3, latestCompleted.episodeNumber)
        assertEquals(300L, latestCompleted.markedAtEpochMs)
    }

    @Test
    fun latestCompletedSeriesEpisode_picks_furthest_episode_even_with_older_timestamp() {
        val latestCompleted = latestCompletedSeriesEpisode(
            content = show,
            progressRecords = listOf(
                WatchingProgressRecord(
                    content = show,
                    videoId = "show:1:5",
                    seasonNumber = 1,
                    episodeNumber = 5,
                    lastUpdatedEpochMs = 100L,
                    isCompleted = true,
                ),
                WatchingProgressRecord(
                    content = show,
                    videoId = "show:1:1",
                    seasonNumber = 1,
                    episodeNumber = 1,
                    lastUpdatedEpochMs = 600L,
                    isCompleted = true,
                ),
            ),
            watchedRecords = emptyList(),
        )

        assertNotNull(latestCompleted)
        assertEquals(1, latestCompleted.seasonNumber)
        assertEquals(5, latestCompleted.episodeNumber)
    }

    @Test
    fun latestCompletedSeriesEpisode_picks_furthest_season_over_recent_rewatch() {
        val latestCompleted = latestCompletedSeriesEpisode(
            content = show,
            progressRecords = listOf(
                WatchingProgressRecord(
                    content = show,
                    videoId = "show:2:3",
                    seasonNumber = 2,
                    episodeNumber = 3,
                    lastUpdatedEpochMs = 200L,
                    isCompleted = true,
                ),
            ),
            watchedRecords = listOf(
                WatchingWatchedRecord(
                    content = show,
                    seasonNumber = 1,
                    episodeNumber = 1,
                    markedAtEpochMs = 500L,
                ),
            ),
        )

        assertNotNull(latestCompleted)
        assertEquals(2, latestCompleted.seasonNumber)
        assertEquals(3, latestCompleted.episodeNumber)
    }

    @Test
    fun `isoCalendarDateOrNull parses various date formats`() {
        assertEquals("2026-05-23", isoCalendarDateOrNull("2026-05-23T12:00:00Z"))
        assertEquals("2026-05-23", isoCalendarDateOrNull(" 2026-05-23 "))
        assertEquals(null, isoCalendarDateOrNull("2026-5-23"))
        assertEquals(null, isoCalendarDateOrNull("2026-5-9"))
        assertEquals(null, isoCalendarDateOrNull("2026-05"))
        assertEquals(null, isoCalendarDateOrNull("invalid"))
        assertEquals(null, isoCalendarDateOrNull(null))
    }

    @Test
    fun `daysUntilExplicitRelease calculates correct offset`() {
        assertEquals(0, daysUntilExplicitRelease("2026-05-23", "2026-05-23"))
        assertEquals(1, daysUntilExplicitRelease("2026-05-23", "2026-05-24"))
        assertEquals(7, daysUntilExplicitRelease("2026-05-23", "2026-05-30"))
        assertEquals(-3, daysUntilExplicitRelease("2026-05-23", "2026-05-20"))
        assertEquals(null, daysUntilExplicitRelease("invalid", "2026-05-23"))
        assertEquals(null, daysUntilExplicitRelease("2026-05-23", null))
    }

    @Test
    fun `isoEpochDay handles leap years and standard calculations`() {
        // Epoch reference (1970-01-01 is epoch day 0)
        assertEquals(0L, isoEpochDay("1970-01-01"))
        assertEquals(20596L, isoEpochDay("2026-05-23"))
        // Leap year: 2024-02-29
        assertEquals(19782L, isoEpochDay("2024-02-29"))
        assertEquals(19783L, isoEpochDay("2024-03-01"))
        // Non-leap year: 2023-02-28
        assertEquals(19416L, isoEpochDay("2023-02-28"))
        assertEquals(19417L, isoEpochDay("2023-03-01"))
    }
}
