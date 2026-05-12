package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class StreamLinkCacheRepositoryTest {

    @Test
    fun `movie cache key keeps legacy type and video id shape`() {
        val key = StreamLinkCacheRepository.contentKey(
            type = "movie",
            videoId = "tt123",
        )

        assertEquals("movie|tt123", key)
    }

    @Test
    fun `episode cache key is scoped to parent show and episode`() {
        val firstEpisode = StreamLinkCacheRepository.contentKey(
            type = "series",
            videoId = "video-id",
            parentMetaId = "tt999",
            season = 1,
            episode = 1,
        )
        val secondEpisode = StreamLinkCacheRepository.contentKey(
            type = "series",
            videoId = "video-id",
            parentMetaId = "tt999",
            season = 1,
            episode = 2,
        )

        assertNotEquals(firstEpisode, secondEpisode)
        assertEquals("series|tt999|s1|e1|video-id", firstEpisode)
    }
}
