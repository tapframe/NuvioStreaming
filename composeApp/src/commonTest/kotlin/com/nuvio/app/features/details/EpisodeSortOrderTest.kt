package com.nuvio.app.features.details

import com.nuvio.app.features.watchprogress.buildPlaybackVideoId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

class EpisodeSortOrderTest {

    @Test
    fun ordersNumberedEpisodesAscendingAndDescending() {
        val episodes = listOf(episode(1), episode(2), episode(3), episode(4))

        assertEquals(
            listOf(1, 2, 3, 4),
            episodes.orderedForEpisodeDisplay(EpisodeSortOrder.Ascending).map(MetaVideo::episode),
        )
        assertEquals(
            listOf(4, 3, 2, 1),
            episodes.orderedForEpisodeDisplay(EpisodeSortOrder.Descending).map(MetaVideo::episode),
        )
    }

    @Test
    fun unknownAndInvalidNumbersStayAtTheEndInBothDirections() {
        val episodes = listOf(episode(1), episode(2), episode(null), episode(4))

        assertEquals(
            listOf(1, 2, 4, null),
            episodes.orderedForEpisodeDisplay(EpisodeSortOrder.Ascending).map(MetaVideo::episode),
        )
        assertEquals(
            listOf(4, 2, 1, null),
            episodes.orderedForEpisodeDisplay(EpisodeSortOrder.Descending).map(MetaVideo::episode),
        )

        val invalidNumbers = listOf(episode(2), episode(0), episode(-1), episode(1))
        assertEquals(
            listOf(1, 2, 0, -1),
            invalidNumbers.orderedForEpisodeDisplay(EpisodeSortOrder.Ascending).map(MetaVideo::episode),
        )
        assertEquals(
            listOf(2, 1, 0, -1),
            invalidNumbers.orderedForEpisodeDisplay(EpisodeSortOrder.Descending).map(MetaVideo::episode),
        )
    }

    @Test
    fun sortsSpecialsWithoutChangingSeasonOrderOrSourceList() {
        val source = listOf(
            episode(number = 2, season = 0),
            episode(number = 1, season = 0),
            episode(number = 1, season = 1),
            episode(number = 2, season = 1),
        )
        val originalIds = source.map(MetaVideo::id)
        val bySeason = source.groupBy { normalizeSeasonNumber(it.season) }

        assertEquals(
            listOf(2, 1),
            bySeason.getValue(0)
                .orderedForEpisodeDisplay(EpisodeSortOrder.Descending)
                .map(MetaVideo::episode),
        )
        assertEquals(listOf(0, 1), bySeason.keys.toList())
        assertEquals(originalIds, source.map(MetaVideo::id))
    }

    @Test
    fun selectedOrderAppliesWhenChangingSeasonsAndRepeatedlyToggling() {
        val bySeason = listOf(
            episode(number = 1, season = 1),
            episode(number = 2, season = 1),
            episode(number = 1, season = 2),
            episode(number = 2, season = 2),
        ).groupBy { normalizeSeasonNumber(it.season) }
        val descending = EpisodeSortOrder.Ascending.toggled()

        assertEquals(
            listOf(2, 1),
            bySeason.getValue(1).orderedForEpisodeDisplay(descending).map(MetaVideo::episode),
        )
        assertEquals(
            listOf(2, 1),
            bySeason.getValue(2).orderedForEpisodeDisplay(descending).map(MetaVideo::episode),
        )
        assertEquals(
            EpisodeSortOrder.Ascending,
            descending.toggled(),
        )
    }

    @Test
    fun reversingPreservesEpisodeIdentityAndProgressLookup() {
        val first = episode(1)
        val fourth = episode(4)
        val parentMetaId = "series-fixture"
        val progressByVideoId = mapOf(
            first.playbackVideoId(parentMetaId) to 0.25f,
            fourth.playbackVideoId(parentMetaId) to 0.75f,
        )

        val reversed = listOf(first, fourth).orderedForEpisodeDisplay(EpisodeSortOrder.Descending)

        assertSame(fourth, reversed.first())
        assertEquals("season-1-episode-4", reversed.first().id)
        assertEquals(0.75f, progressByVideoId[reversed.first().playbackVideoId(parentMetaId)])
    }

    private fun MetaVideo.playbackVideoId(parentMetaId: String): String =
        buildPlaybackVideoId(
            parentMetaId = parentMetaId,
            seasonNumber = season,
            episodeNumber = episode,
            fallbackVideoId = id,
        )

    private fun episode(
        number: Int?,
        season: Int = 1,
    ) = MetaVideo(
        id = "season-$season-episode-$number",
        title = "Episode $number",
        season = season,
        episode = number,
    )
}
