package com.nuvio.app.features.details

import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class SeriesPlaybackResolverTest {
    @Test
    fun seriesPrimaryAction_uses_latest_watched_episode_when_manual_mark_exists() {
        val meta = MetaDetails(
            id = "show",
            type = "series",
            name = "Show",
            videos = listOf(
                MetaVideo(id = "ep1", title = "Episode 1", season = 1, episode = 1, released = "2026-03-01"),
                MetaVideo(id = "ep2", title = "Episode 2", season = 1, episode = 2, released = "2026-03-08"),
                MetaVideo(id = "ep3", title = "Episode 3", season = 1, episode = 3, released = "2026-03-15"),
            ),
        )

        val action = meta.seriesPrimaryAction(
            entries = emptyList(),
            watchedItems = listOf(
                WatchedItem(
                    id = "show",
                    type = "series",
                    name = "Episode 2",
                    season = 1,
                    episode = 2,
                    markedAtEpochMs = 123L,
                ),
            ),
            todayIsoDate = "2026-03-30",
        )

        assertNotNull(action)
        assertEquals("Up Next • S1E3", action.label)
        assertEquals("show:1:3", action.videoId)
        assertEquals(1, action.seasonNumber)
        assertEquals(3, action.episodeNumber)
    }

    @Test
    fun seriesPrimaryAction_prefers_next_up_when_manual_watch_is_newer_than_resume() {
        val meta = MetaDetails(
            id = "show",
            type = "series",
            name = "Show",
            videos = listOf(
                MetaVideo(id = "ep1", title = "Episode 1", season = 1, episode = 1, released = "2026-03-01"),
                MetaVideo(id = "ep2", title = "Episode 2", season = 1, episode = 2, released = "2026-03-08"),
                MetaVideo(id = "ep3", title = "Episode 3", season = 1, episode = 3, released = "2026-03-15"),
            ),
        )

        val action = meta.seriesPrimaryAction(
            entries = listOf(
                WatchProgressEntry(
                    contentType = "series",
                    parentMetaId = "show",
                    parentMetaType = "series",
                    videoId = "show:1:2",
                    title = "Show",
                    seasonNumber = 1,
                    episodeNumber = 2,
                    lastPositionMs = 1_000L,
                    durationMs = 10_000L,
                    lastUpdatedEpochMs = 100L,
                    isCompleted = false,
                ),
            ),
            watchedItems = listOf(
                WatchedItem(
                    id = "show",
                    type = "series",
                    name = "Episode 2",
                    season = 1,
                    episode = 2,
                    markedAtEpochMs = 200L,
                ),
            ),
            todayIsoDate = "2026-03-30",
        )

        assertNotNull(action)
        assertEquals("Up Next • S1E3", action.label)
        assertEquals("show:1:3", action.videoId)
    }

    @Test
    fun nextReleasedEpisodeAfter_global_index_fallback_ignores_specials() {
        val meta = MetaDetails(
            id = "show",
            type = "series",
            name = "Show",
            videos = listOf(
                MetaVideo(id = "sp1", title = "Special 1", season = 0, episode = 1, released = "2026-01-01"),
                MetaVideo(id = "s1e1", title = "Episode 1", season = 1, episode = 1, released = "2026-01-08"),
                MetaVideo(id = "s1e2", title = "Episode 2", season = 1, episode = 2, released = "2026-01-15"),
                MetaVideo(id = "s2e1", title = "Episode 3", season = 2, episode = 1, released = "2026-01-22"),
                MetaVideo(id = "s2e2", title = "Episode 4", season = 2, episode = 2, released = "2026-01-29"),
            ),
        )

        val nextEpisode = meta.nextReleasedEpisodeAfter(
            seasonNumber = 1,
            episodeNumber = 3,
            todayIsoDate = "2026-02-01",
        )

        assertNotNull(nextEpisode)
        assertEquals(2, nextEpisode.season)
        assertEquals(2, nextEpisode.episode)
        assertEquals("s2e2", nextEpisode.id)
    }
}
