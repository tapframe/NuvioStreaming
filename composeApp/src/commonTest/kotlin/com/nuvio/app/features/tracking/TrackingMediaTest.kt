package com.nuvio.app.features.tracking

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TrackingMediaTest {
    @Test
    fun `canonical addon ids parse without guessing an unprefixed Simkl id`() {
        assertEquals("tt1520211", parseTrackingExternalIds("tt1520211:1:2").imdb)
        assertEquals(1399L, parseTrackingExternalIds("tmdb:1399:1:2").tmdb)
        assertEquals("153021", parseTrackingExternalIds("tvdb:153021").tvdb)
        assertEquals(2090L, parseTrackingExternalIds("simkl:2090").simkl)
        assertEquals(16498L, parseTrackingExternalIds("mal:16498").mal)

        val legacyNumeric = parseTrackingExternalIds("42")
        assertEquals(42L, legacyNumeric.trakt)
        assertEquals(null, legacyNumeric.simkl)
    }

    @Test
    fun `generic identity merges missing ids and classifies anime independently of ui type`() {
        val ids = TrackingExternalIds(imdb = "tt2560140")
            .mergeMissing(TrackingExternalIds(tmdb = 1429, mal = 16498))

        assertEquals("tt2560140", ids.imdb)
        assertEquals(1429L, ids.tmdb)
        assertEquals(16498L, ids.mal)
        assertTrue(ids.hasAny)
        assertEquals(TrackingMediaKind.ANIME, trackingMediaKind("series", ids))
        assertEquals(TrackingMediaKind.MOVIE, trackingMediaKind("film"))
        assertFalse(TrackingExternalIds().hasAny)
    }
}
