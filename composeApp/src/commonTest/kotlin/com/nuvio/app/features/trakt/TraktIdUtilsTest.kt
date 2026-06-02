package com.nuvio.app.features.trakt

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TraktIdUtilsTest {

    @Test
    fun `parse content ids supports imdb tmdb trakt and numeric aliases`() {
        assertEquals(TraktExternalIds(imdb = "tt1234567"), parseTraktContentIds("tt1234567:movie"))
        assertEquals(TraktExternalIds(tmdb = 42), parseTraktContentIds("tmdb:42"))
        assertEquals(TraktExternalIds(trakt = 99), parseTraktContentIds("trakt:99"))
        assertEquals(TraktExternalIds(trakt = 77), parseTraktContentIds("77:show"))
    }

    @Test
    fun `normalize content id prefers imdb then tmdb then trakt then fallback`() {
        assertEquals(
            "tt1234567",
            normalizeTraktContentId(TraktExternalIds(trakt = 99, imdb = "tt1234567", tmdb = 42), fallback = "fallback"),
        )
        assertEquals("tmdb:42", normalizeTraktContentId(TraktExternalIds(trakt = 99, tmdb = 42)))
        assertEquals("trakt:99", normalizeTraktContentId(TraktExternalIds(trakt = 99)))
        assertEquals("fallback", normalizeTraktContentId(TraktExternalIds(), fallback = "fallback"))
    }

    @Test
    fun `external ids report slug-only identifiers as present`() {
        assertTrue(TraktExternalIds(slug = "favorites").hasAnyId())
        assertTrue(TraktExternalIds(tmdb = 42).hasAnyId())
        assertFalse(TraktExternalIds().hasAnyId())
    }
}
