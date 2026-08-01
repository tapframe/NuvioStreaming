package com.nuvio.app.features.trakt

import com.nuvio.app.features.tracking.buildTrackingMediaReference
import kotlin.test.Test
import kotlin.test.assertEquals

class TraktScrobbleRepositoryTest {
    @Test
    fun episodeMappingInput_preservesAddonCatalogIdentity() {
        val media = buildTrackingMediaReference(
            contentType = "anime",
            parentMetaId = "anime-addon:the-crow-girl",
            videoId = "tt33307200:1:3",
            title = "The Crow Girl",
            seasonNumber = 1,
            episodeNumber = 3,
            episodeTitle = "Episode 3",
        )

        val input = media.toTraktEpisodeMappingInput()

        assertEquals("anime-addon:the-crow-girl", input?.contentId)
        assertEquals("anime", input?.contentType)
        assertEquals("tt33307200:1:3", input?.videoId)
        assertEquals(1, input?.season)
        assertEquals(3, input?.episode)
    }
}
