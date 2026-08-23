package com.nuvio.app.features.home.components

import com.nuvio.app.features.watchprogress.ContinueWatchingItem
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class HomeContinueWatchingArtworkTest {
    @Test
    fun inProgressEpisodeThumbnailRemainsBlurredUntilWatched() {
        val item = item(progressFraction = 0.5f)

        assertTrue(
            item.shouldBlurContinueWatchingArtwork(
                blurUnwatchedEpisodes = true,
                useEpisodeThumbnails = true,
                artworkUrl = "thumb.jpg",
            ),
        )
    }

    @Test
    fun completedEpisodeThumbnailIsNotBlurred() {
        val item = item(progressFraction = 0.9f)

        assertFalse(
            item.shouldBlurContinueWatchingArtwork(
                blurUnwatchedEpisodes = true,
                useEpisodeThumbnails = true,
                artworkUrl = "thumb.jpg",
            ),
        )
    }

    @Test
    fun fallbackArtworkIsNotBlurred() {
        val item = item(progressFraction = 0.5f)

        assertFalse(
            item.shouldBlurContinueWatchingArtwork(
                blurUnwatchedEpisodes = true,
                useEpisodeThumbnails = true,
                artworkUrl = "backdrop.jpg",
            ),
        )
    }

    private fun item(progressFraction: Float) = ContinueWatchingItem(
        parentMetaId = "show",
        parentMetaType = "series",
        videoId = "show:1:1",
        title = "Show",
        subtitle = "S1 E1",
        imageUrl = "thumb.jpg",
        poster = "poster.jpg",
        background = "backdrop.jpg",
        seasonNumber = 1,
        episodeNumber = 1,
        episodeThumbnail = "thumb.jpg",
        resumePositionMs = 300_000L,
        durationMs = 600_000L,
        progressFraction = progressFraction,
    )
}
