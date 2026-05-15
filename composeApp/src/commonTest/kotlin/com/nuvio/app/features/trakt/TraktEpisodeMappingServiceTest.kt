package com.nuvio.app.features.trakt

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TraktEpisodeMappingServiceTest {

    @Test
    fun `same structure compares per-season episode counts`() {
        val addon = listOf(
            episode(1, 1),
            episode(1, 2),
            episode(2, 1),
        )
        val sameSeasonsDifferentCounts = listOf(
            episode(1, 1),
            episode(2, 1),
            episode(2, 2),
        )
        val sameCounts = listOf(
            episode(1, 1),
            episode(1, 2),
            episode(2, 1),
        )

        assertFalse(TraktEpisodeMappingService.hasSameSeasonStructure(addon, sameSeasonsDifferentCounts))
        assertTrue(TraktEpisodeMappingService.hasSameSeasonStructure(addon, sameCounts))
    }

    @Test
    fun `forward mapping uses global sorted index for anime numbering`() {
        val addon = listOf(
            episode(1, 1, videoId = "show:1:1"),
            episode(1, 2, videoId = "show:1:2"),
            episode(2, 1, videoId = "show:2:1"),
            episode(2, 2, videoId = "show:2:2"),
        )
        val trakt = listOf(
            episode(1, 1),
            episode(1, 2),
            episode(1, 3),
            episode(1, 4),
        )

        val mapped = TraktEpisodeMappingService.remapEpisodeByTitleOrIndex(
            requestedSeason = 2,
            requestedEpisode = 1,
            requestedVideoId = null,
            requestedTitle = null,
            addonEpisodes = addon,
            traktEpisodes = trakt,
        )

        assertEquals(1, mapped?.season)
        assertEquals(3, mapped?.episode)
    }

    @Test
    fun `reverse mapping uses global sorted index for Trakt absolute numbering`() {
        val addon = listOf(
            episode(1, 1),
            episode(1, 2),
            episode(2, 1),
            episode(2, 2),
        )
        val trakt = listOf(
            episode(1, 1),
            episode(1, 2),
            episode(1, 3),
            episode(1, 4),
        )

        val mapped = TraktEpisodeMappingService.reverseRemapEpisodeByTitleOrIndex(
            requestedSeason = 1,
            requestedEpisode = 3,
            requestedTitle = null,
            addonEpisodes = addon,
            traktEpisodes = trakt,
        )

        assertEquals(2, mapped?.season)
        assertEquals(1, mapped?.episode)
    }

    @Test
    fun `unique normalized title wins over index`() {
        val addon = listOf(
            episode(1, 1, title = "The Storm"),
            episode(1, 2, title = "Aftermath"),
        )
        val trakt = listOf(
            episode(1, 1, title = "Aftermath"),
            episode(1, 2, title = "The Storm!"),
        )

        val mapped = TraktEpisodeMappingService.remapEpisodeByTitleOrIndex(
            requestedSeason = 1,
            requestedEpisode = 1,
            requestedVideoId = null,
            requestedTitle = null,
            addonEpisodes = addon,
            traktEpisodes = trakt,
        )

        assertEquals(1, mapped?.season)
        assertEquals(2, mapped?.episode)
    }

    @Test
    fun `generic title falls back to index`() {
        val addon = listOf(
            episode(1, 1, title = "Episode 1"),
            episode(2, 1, title = "Actual Title"),
        )
        val trakt = listOf(
            episode(1, 1, title = "Actual Title"),
            episode(1, 2, title = "Episode 1"),
        )

        val mapped = TraktEpisodeMappingService.remapEpisodeByTitleOrIndex(
            requestedSeason = 1,
            requestedEpisode = 1,
            requestedVideoId = null,
            requestedTitle = null,
            addonEpisodes = addon,
            traktEpisodes = trakt,
        )

        assertEquals(1, mapped?.season)
        assertEquals(1, mapped?.episode)
    }

    @Test
    fun `duplicate title falls back to index`() {
        val addon = listOf(
            episode(1, 1, title = "Pilot"),
            episode(2, 1, title = "Other"),
        )
        val trakt = listOf(
            episode(1, 1, title = "Pilot"),
            episode(1, 2, title = "Pilot"),
        )

        val mapped = TraktEpisodeMappingService.remapEpisodeByTitleOrIndex(
            requestedSeason = 1,
            requestedEpisode = 1,
            requestedVideoId = null,
            requestedTitle = null,
            addonEpisodes = addon,
            traktEpisodes = trakt,
        )

        assertEquals(1, mapped?.season)
        assertEquals(1, mapped?.episode)
    }

    @Test
    fun `video id selects source episode before season episode`() {
        val addon = listOf(
            episode(1, 1, videoId = "show:1:1"),
            episode(2, 1, videoId = "show:2:1"),
        )
        val trakt = listOf(
            episode(1, 1),
            episode(1, 2),
        )

        val mapped = TraktEpisodeMappingService.remapEpisodeByTitleOrIndex(
            requestedSeason = 1,
            requestedEpisode = 1,
            requestedVideoId = "show:2:1",
            requestedTitle = null,
            addonEpisodes = addon,
            traktEpisodes = trakt,
        )

        assertEquals(1, mapped?.season)
        assertEquals(2, mapped?.episode)
    }

    @Test
    fun `index outside target range returns null`() {
        val addon = listOf(
            episode(1, 1),
            episode(1, 2),
        )
        val trakt = listOf(episode(1, 1))

        val mapped = TraktEpisodeMappingService.remapEpisodeByTitleOrIndex(
            requestedSeason = 1,
            requestedEpisode = 2,
            requestedVideoId = null,
            requestedTitle = null,
            addonEpisodes = addon,
            traktEpisodes = trakt,
        )

        assertNull(mapped)
    }

    private fun episode(
        season: Int,
        episode: Int,
        title: String? = null,
        videoId: String? = null,
    ) = EpisodeMappingEntry(
        season = season,
        episode = episode,
        title = title,
        videoId = videoId,
    )
}
