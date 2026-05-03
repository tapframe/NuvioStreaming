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
}
