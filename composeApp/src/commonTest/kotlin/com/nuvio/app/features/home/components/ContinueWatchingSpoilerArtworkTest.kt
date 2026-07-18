package com.nuvio.app.features.home.components

import com.nuvio.app.features.watchprogress.ContinueWatchingItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ContinueWatchingSpoilerArtworkTest {
    @Test
    fun `protected preview prefers series poster and never episode thumbnail`() {
        val item = nextUpItem(
            poster = "series-poster",
            background = "series-background",
            episodeThumbnail = "episode-thumbnail",
        )

        assertEquals("series-poster", item.spoilerSafeArtworkUrl())
    }

    @Test
    fun `protected preview falls back to series background`() {
        val item = nextUpItem(
            poster = null,
            background = "series-background",
            episodeThumbnail = "episode-thumbnail",
        )

        assertEquals("series-background", item.spoilerSafeArtworkUrl())
    }

    @Test
    fun `protected preview returns no image when only episode artwork exists`() {
        val item = nextUpItem(
            poster = null,
            background = null,
            episodeThumbnail = "episode-thumbnail",
        )

        assertNull(item.spoilerSafeArtworkUrl())
    }

    @Test
    fun `next up artwork is protected only when both preferences are enabled`() {
        val item = nextUpItem()

        assertTrue(item.shouldProtectNextUpArtwork(blurNextUp = true, useEpisodeThumbnails = true))
        assertFalse(item.shouldProtectNextUpArtwork(blurNextUp = false, useEpisodeThumbnails = true))
        assertFalse(item.shouldProtectNextUpArtwork(blurNextUp = true, useEpisodeThumbnails = false))
        assertFalse(
            item.copy(isNextUp = false)
                .shouldProtectNextUpArtwork(blurNextUp = true, useEpisodeThumbnails = true),
        )
    }

    private fun nextUpItem(
        poster: String? = "series-poster",
        background: String? = "series-background",
        episodeThumbnail: String? = "episode-thumbnail",
    ): ContinueWatchingItem = ContinueWatchingItem(
        parentMetaId = "show",
        parentMetaType = "series",
        videoId = "show:2:1",
        title = "Show",
        subtitle = "S2E1 • Episode",
        imageUrl = episodeThumbnail,
        poster = poster,
        background = background,
        seasonNumber = 2,
        episodeNumber = 1,
        episodeTitle = "Episode",
        episodeThumbnail = episodeThumbnail,
        isNextUp = true,
        resumePositionMs = 0L,
        durationMs = 0L,
        progressFraction = 0f,
    )
}
