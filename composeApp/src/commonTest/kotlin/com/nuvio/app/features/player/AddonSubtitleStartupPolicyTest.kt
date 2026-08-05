package com.nuvio.app.features.player

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AddonSubtitleStartupPolicyTest {

    @Test
    fun fastStartupWaitsForPlayerInitialization() {
        assertFalse(
            canAutomaticallyFetchAddonSubtitles(
                mode = AddonSubtitleStartupMode.FAST_STARTUP,
                playerInitialized = false,
            ),
        )
        assertTrue(
            canAutomaticallyFetchAddonSubtitles(
                mode = AddonSubtitleStartupMode.FAST_STARTUP,
                playerInitialized = true,
            ),
        )
    }

    @Test
    fun prefetchModesCanFetchBeforePlayerInitialization() {
        assertTrue(
            canAutomaticallyFetchAddonSubtitles(
                mode = AddonSubtitleStartupMode.PREFERRED_ONLY,
                playerInitialized = false,
            ),
        )
        assertTrue(
            canAutomaticallyFetchAddonSubtitles(
                mode = AddonSubtitleStartupMode.ALL_SUBTITLES,
                playerInitialized = false,
            ),
        )
    }
}
