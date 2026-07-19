package com.nuvio.app.features.trakt

import com.nuvio.app.features.watchprogress.WatchProgressEntry
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TraktProgressRemovalTest {

    @Test
    fun `episode removal matches only the exact logical episode`() {
        val target = entry(contentId = "show", season = 2, episode = 3)
        val otherEpisode = entry(contentId = "show", season = 2, episode = 4)
        val otherParent = entry(contentId = "other-show", season = 2, episode = 3)

        assertTrue(target.matchesTraktRemovalContext("show", seasonNumber = 2, episodeNumber = 3))
        assertFalse(otherEpisode.matchesTraktRemovalContext("show", seasonNumber = 2, episodeNumber = 3))
        assertFalse(otherParent.matchesTraktRemovalContext("show", seasonNumber = 2, episodeNumber = 3))
    }

    @Test
    fun `incomplete episode context never widens removal to the whole show`() {
        val episode = entry(contentId = "show", season = 2, episode = 3)

        assertFalse(hasCompleteTraktEpisodeContext(seasonNumber = 2, episodeNumber = null))
        assertFalse(hasCompleteTraktEpisodeContext(seasonNumber = null, episodeNumber = 3))
        assertFalse(episode.matchesTraktRemovalContext("show", seasonNumber = 2, episodeNumber = null))
        assertFalse(episode.matchesTraktRemovalContext("show", seasonNumber = null, episodeNumber = 3))
    }

    @Test
    fun `show removal matches only entries from the requested parent`() {
        assertTrue(entry(contentId = "show").matchesTraktRemovalContext(" show "))
        assertFalse(entry(contentId = "other-show").matchesTraktRemovalContext("show"))
    }

    private fun entry(
        contentId: String,
        season: Int = 1,
        episode: Int = 1,
    ): WatchProgressEntry = WatchProgressEntry(
        contentType = "series",
        parentMetaId = contentId,
        parentMetaType = "series",
        videoId = "$contentId:$season:$episode",
        title = "Show",
        seasonNumber = season,
        episodeNumber = episode,
        lastPositionMs = 100L,
        durationMs = 1_000L,
        lastUpdatedEpochMs = 10L,
    )
}
