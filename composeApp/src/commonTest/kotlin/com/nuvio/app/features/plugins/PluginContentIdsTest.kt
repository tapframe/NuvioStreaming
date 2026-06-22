package com.nuvio.app.features.plugins

import kotlin.test.Test
import kotlin.test.assertEquals

class PluginContentIdsTest {

    @Test
    fun `series playback id strips season episode suffix`() {
        assertEquals(
            "tt2575988",
            pluginContentId(
                videoId = "tt2575988:5:8",
                season = 5,
                episode = 8,
            ),
        )
    }

    @Test
    fun `tmdb prefixed series playback id strips prefix and suffix`() {
        assertEquals(
            "12345",
            pluginContentId(
                videoId = "tmdb:12345:2:6",
                season = 2,
                episode = 6,
            ),
        )
    }

    @Test
    fun `movie id stays unchanged`() {
        assertEquals(
            "tt0133093",
            pluginContentId(
                videoId = "tt0133093",
                season = null,
                episode = null,
            ),
        )
    }

    @Test
    fun `slash prefixed tmdb id keeps base content id`() {
        assertEquals(
            "999",
            pluginContentId(
                videoId = "tmdb/999/1/2",
                season = 1,
                episode = 2,
            ),
        )
    }

    // Regression: previously, if the id's embedded season:episode did not match
    // the requested season/episode, the raw (wrong-episode) suffix leaked through
    // to the plugin, causing scrapers to fetch the wrong episode.
    @Test
    fun `mismatched embedded season episode suffix is still stripped`() {
        assertEquals(
            "tt2575988",
            pluginContentId(
                videoId = "tt2575988:1:1",
                season = 5,
                episode = 8,
            ),
        )
    }

    @Test
    fun `embedded suffix stripped even when requested season episode are null`() {
        assertEquals(
            "tt2575988",
            pluginContentId(
                videoId = "tt2575988:3:4",
                season = null,
                episode = null,
            ),
        )
    }

    @Test
    fun `tmdb prefixed id with mismatched suffix is normalized`() {
        assertEquals(
            "12345",
            pluginContentId(
                videoId = "tmdb:12345:9:9",
                season = 2,
                episode = 6,
            ),
        )
    }

    @Test
    fun `plain numeric movie id is not altered`() {
        assertEquals(
            "603",
            pluginContentId(
                videoId = "603",
                season = null,
                episode = null,
            ),
        )
    }

    @Test
    fun `blank id returns original`() {
        assertEquals(
            "",
            pluginContentId(
                videoId = "",
                season = 1,
                episode = 1,
            ),
        )
    }
}
