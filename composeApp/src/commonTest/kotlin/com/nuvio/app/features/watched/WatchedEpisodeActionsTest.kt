package com.nuvio.app.features.watched

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import kotlin.test.Test
import kotlin.test.assertEquals

class WatchedEpisodeActionsTest {
    @Test
    fun `previous released episodes include every older season`() {
        val meta = MetaDetails(
            id = "show",
            type = "series",
            name = "Show",
            videos = listOf(
                MetaVideo(id = "s2e2", title = "S2E2", season = 2, episode = 2, released = "2026-02-08"),
                MetaVideo(id = "s1e2", title = "S1E2", season = 1, episode = 2, released = "2026-01-08"),
                MetaVideo(id = "s2e1", title = "S2E1", season = 2, episode = 1, released = "2026-02-01"),
                MetaVideo(id = "s1e1", title = "S1E1", season = 1, episode = 1, released = "2026-01-01"),
            ),
        )
        val target = meta.videos.first { it.id == "s2e2" }

        val previousEpisodes = meta.previousReleasedEpisodesBefore(
            target = target,
            todayIsoDate = "2026-03-01",
        )

        assertEquals(
            listOf("s1e1", "s1e2", "s2e1"),
            previousEpisodes.map(MetaVideo::id),
        )
    }
}
