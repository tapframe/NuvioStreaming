package com.nuvio.app.features.watching.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class SeriesContinuityTest {
    private val show = WatchingContentRef(type = "series", id = "show")
    private val episodes = listOf(
        WatchingReleasedEpisode(videoId = "ep1", seasonNumber = 1, episodeNumber = 1, title = "Episode 1", releasedDate = "2026-03-01"),
        WatchingReleasedEpisode(videoId = "ep2", seasonNumber = 1, episodeNumber = 2, title = "Episode 2", releasedDate = "2026-03-08"),
        WatchingReleasedEpisode(videoId = "ep3", seasonNumber = 1, episodeNumber = 3, title = "Episode 3", releasedDate = "2026-03-15"),
    )

    @Test
    fun decideSeriesPrimaryAction_prefers_up_next_when_completed_is_newer_than_resume() {
        val action = decideSeriesPrimaryAction(
            content = show,
            episodes = episodes,
            progressRecords = listOf(
                WatchingProgressRecord(
                    content = show,
                    videoId = "show:1:2",
                    seasonNumber = 1,
                    episodeNumber = 2,
                    lastUpdatedEpochMs = 100L,
                    lastPositionMs = 1_000L,
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
            todayIsoDate = "2026-03-30",
        )

        assertNotNull(action)
        assertEquals("Up Next • S1E3", action.label)
        assertEquals("show:1:3", action.videoId)
        assertEquals(3, action.episodeNumber)
    }

    @Test
    fun decideSeriesPrimaryAction_prefers_resume_when_resume_is_newer_than_completed() {
        val action = decideSeriesPrimaryAction(
            content = show,
            episodes = episodes,
            progressRecords = listOf(
                WatchingProgressRecord(
                    content = show,
                    videoId = "show:1:2",
                    seasonNumber = 1,
                    episodeNumber = 2,
                    lastUpdatedEpochMs = 300L,
                    lastPositionMs = 1_500L,
                ),
            ),
            watchedRecords = listOf(
                WatchingWatchedRecord(
                    content = show,
                    seasonNumber = 1,
                    episodeNumber = 1,
                    markedAtEpochMs = 200L,
                ),
            ),
            todayIsoDate = "2026-03-30",
        )

        assertNotNull(action)
        assertEquals("Resume S1E2", action.label)
        assertEquals("show:1:2", action.videoId)
        assertEquals(1_500L, action.resumePositionMs)
    }

    @Test
    fun decideSeriesPrimaryAction_skips_specials_for_initial_play() {
        val episodesWithSpecials = listOf(
            WatchingReleasedEpisode(videoId = "sp1", seasonNumber = 0, episodeNumber = 1, title = "Special 1", releasedDate = "2026-01-01"),
            WatchingReleasedEpisode(videoId = "ep1", seasonNumber = 1, episodeNumber = 1, title = "Pilot", releasedDate = "2026-01-15"),
            WatchingReleasedEpisode(videoId = "ep2", seasonNumber = 1, episodeNumber = 2, title = "Episode 2", releasedDate = "2026-01-22"),
            WatchingReleasedEpisode(videoId = "ep3", seasonNumber = 2, episodeNumber = 1, title = "S2 Premiere", releasedDate = "2026-03-01"),
        )
        val action = decideSeriesPrimaryAction(
            content = show,
            episodes = episodesWithSpecials,
            progressRecords = emptyList(),
            watchedRecords = emptyList(),
            todayIsoDate = "2026-03-30",
        )

        assertNotNull(action)
        assertEquals("Play S1E1", action.label)
        assertEquals("show:1:1", action.videoId)
    }

    @Test
    fun decideSeriesPrimaryAction_falls_back_to_specials_when_no_main_season() {
        val specialsOnly = listOf(
            WatchingReleasedEpisode(videoId = "sp1", seasonNumber = 0, episodeNumber = 1, title = "Special 1", releasedDate = "2026-01-01"),
            WatchingReleasedEpisode(videoId = "sp2", seasonNumber = 0, episodeNumber = 2, title = "Special 2", releasedDate = "2026-01-15"),
        )
        val action = decideSeriesPrimaryAction(
            content = show,
            episodes = specialsOnly,
            progressRecords = emptyList(),
            watchedRecords = emptyList(),
            todayIsoDate = "2026-03-30",
        )

        assertNotNull(action)
        assertEquals("Play S0E1", action.label)
    }

    @Test
    fun decideSeriesPrimaryAction_skips_watched_episodes_after_rewatch() {
        val twoSeasons = listOf(
            WatchingReleasedEpisode(videoId = "ep1", seasonNumber = 1, episodeNumber = 1, title = "S1E1", releasedDate = "2026-01-01"),
            WatchingReleasedEpisode(videoId = "ep2", seasonNumber = 1, episodeNumber = 2, title = "S1E2", releasedDate = "2026-01-08"),
            WatchingReleasedEpisode(videoId = "ep3", seasonNumber = 1, episodeNumber = 3, title = "S1E3", releasedDate = "2026-01-15"),
            WatchingReleasedEpisode(videoId = "ep4", seasonNumber = 2, episodeNumber = 1, title = "S2E1", releasedDate = "2026-03-01"),
            WatchingReleasedEpisode(videoId = "ep5", seasonNumber = 2, episodeNumber = 2, title = "S2E2", releasedDate = "2026-03-08"),
        )
        val action = decideSeriesPrimaryAction(
            content = show,
            episodes = twoSeasons,
            progressRecords = listOf(
                // All of season 1 completed
                WatchingProgressRecord(content = show, videoId = "show:1:1", seasonNumber = 1, episodeNumber = 1, lastUpdatedEpochMs = 100L, isCompleted = true),
                WatchingProgressRecord(content = show, videoId = "show:1:2", seasonNumber = 1, episodeNumber = 2, lastUpdatedEpochMs = 200L, isCompleted = true),
                WatchingProgressRecord(content = show, videoId = "show:1:3", seasonNumber = 1, episodeNumber = 3, lastUpdatedEpochMs = 300L, isCompleted = true),
                // S2E1 completed
                WatchingProgressRecord(content = show, videoId = "show:2:1", seasonNumber = 2, episodeNumber = 1, lastUpdatedEpochMs = 400L, isCompleted = true),
                // Re-watched S1E1 recently — newer timestamp but earlier episode
                WatchingProgressRecord(content = show, videoId = "show:1:1", seasonNumber = 1, episodeNumber = 1, lastUpdatedEpochMs = 900L, isCompleted = true),
            ),
            watchedRecords = emptyList(),
            todayIsoDate = "2026-03-30",
        )

        assertNotNull(action)
        assertEquals("Up Next • S2E2", action.label)
        assertEquals("show:2:2", action.videoId)
    }
}
