package com.nuvio.app.features.trakt

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TraktImageUtilsTest {

    @Test
    fun normalizesTraktHostedImageUrls() {
        assertEquals(
            "https://media.trakt.tv/images/movies/poster.jpg.webp",
            listOf("media.trakt.tv/images/movies/poster.jpg.webp").firstTraktImageUrl(),
        )
        assertEquals(
            "https://media.trakt.tv/images/movies/poster.jpg.webp",
            listOf("//media.trakt.tv/images/movies/poster.jpg.webp").firstTraktImageUrl(),
        )
        assertEquals(
            "https://media.trakt.tv/images/movies/poster.jpg.webp",
            listOf("http://media.trakt.tv/images/movies/poster.jpg.webp").firstTraktImageUrl(),
        )
    }

    @Test
    fun selectsBestTraktImages() {
        val images = TraktImagesDto(
            fanart = listOf("media.trakt.tv/images/movies/fanart.jpg.webp"),
            logo = listOf("media.trakt.tv/images/movies/logo.png.webp"),
            thumb = listOf("media.trakt.tv/images/movies/thumb.jpg.webp"),
        )

        assertEquals("https://media.trakt.tv/images/movies/fanart.jpg.webp", images.traktBestPosterUrl())
        assertEquals("https://media.trakt.tv/images/movies/fanart.jpg.webp", images.traktBestBackdropUrl())
        assertEquals("https://media.trakt.tv/images/movies/thumb.jpg.webp", images.traktBestLandscapeUrl())
        assertEquals("https://media.trakt.tv/images/movies/logo.png.webp", images.traktBestLogoUrl())
    }

    @Test
    fun returnsNullWhenTraktImagesAreMissing() {
        assertNull(emptyList<String>().firstTraktImageUrl())
        assertNull(TraktImagesDto().traktBestPosterUrl())
    }
}
