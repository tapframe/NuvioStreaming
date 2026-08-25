package com.nuvio.app.features.details.components

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EpisodeCardRulesTest {

    @Test
    fun `runtime metadata rule requires positive minutes`() {
        assertTrue(shouldShowEpisodeRuntime(25))
        assertFalse(shouldShowEpisodeRuntime(null))
        assertFalse(shouldShowEpisodeRuntime(0))
        assertFalse(shouldShowEpisodeRuntime(-1))
    }
}
