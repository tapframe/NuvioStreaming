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

    @Test
    fun `playback media builder falls back to video id and keeps episode coordinates`() {
        val media = buildTrackingMediaReference(
            contentType = "series",
            parentMetaId = "addon_specific_identifier",
            videoId = "tt4574334:2:7",
            title = "Stranger Things",
            releaseInfo = "2016–",
            seasonNumber = 2,
            episodeNumber = 7,
            episodeTitle = "The Lost Sister",
        )

        assertEquals("tt4574334", media.ids.imdb)
        assertEquals(TrackingMediaKind.SHOW, media.kind)
        assertEquals(2016, media.year)
        assertEquals(2, media.episode?.season)
        assertEquals(7, media.episode?.number)
        assertEquals("addon_specific_identifier", media.catalog?.contentId)
        assertEquals("series", media.catalog?.contentType)
        assertEquals("tt4574334:2:7", media.catalog?.videoId)
    }
}
