package com.nuvio.app.features.tmdb

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TmdbServiceAnimeIdTest {
    @Test
    fun `anime ids are limited to enrichment resolution`() = runBlocking {
        assertNull(TmdbService.ensureTmdbId("mal:62322", "series"))
        assertTrue(TmdbService.canResolveForEnrichment("mal:62322"))
        assertFalse(TmdbService.canResolveForEnrichment("series:addon-title"))
    }

    @Test
    fun `existing tmdb ids still resolve without an ARM lookup`() = runBlocking {
        assertEquals("298994", TmdbService.ensureTmdbId("tmdb:298994", "series"))
        assertEquals("298994", TmdbService.ensureTmdbId("series:298994", "series"))
    }
}
