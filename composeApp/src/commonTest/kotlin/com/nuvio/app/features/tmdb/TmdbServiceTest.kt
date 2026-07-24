package com.nuvio.app.features.tmdb

import kotlin.test.Test
import kotlin.test.assertEquals

class TmdbServiceTest {

    @Test
    fun `anime id keeps addon imdb alias as fallback candidate`() {
        assertEquals(
            listOf("mal", "tt28254942"),
            tmdbLookupCandidates(
                videoId = "mal:49894",
                fallbackImdbId = "tt28254942",
            ),
        )
    }

    @Test
    fun `numeric tmdb id remains ahead of fallback imdb alias`() {
        assertEquals(
            listOf("228234", "tt28254942"),
            tmdbLookupCandidates(
                videoId = "tmdb:228234",
                fallbackImdbId = "tt28254942",
            ),
        )
    }

    @Test
    fun `duplicate primary and fallback ids are resolved once`() {
        assertEquals(
            listOf("tt0133093"),
            tmdbLookupCandidates(
                videoId = "tt0133093:1:1",
                fallbackImdbId = "tt0133093",
            ),
        )
    }
}
