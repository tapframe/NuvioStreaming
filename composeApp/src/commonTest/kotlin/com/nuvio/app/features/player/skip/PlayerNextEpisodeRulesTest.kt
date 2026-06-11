package com.nuvio.app.features.player.skip

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PlayerNextEpisodeRulesTest {

    @Test
    fun `outro without post-credits fires at outro start`() {
        val intervals = listOf(outro(startSec = 1200.0, endSec = 1260.0))
        val durationMs = 1280_000L

        assertFalse(
            PlayerNextEpisodeRules.shouldShowNextEpisodeCard(
                positionMs = 1199_999L,
                durationMs = durationMs,
                skipIntervals = intervals,
                thresholdMode = NextEpisodeThresholdMode.PERCENTAGE,
                thresholdPercent = 100f,
                thresholdMinutesBeforeEnd = 0f,
            ),
        )
        assertTrue(
            PlayerNextEpisodeRules.shouldShowNextEpisodeCard(
                positionMs = 1200_000L,
                durationMs = durationMs,
                skipIntervals = intervals,
                thresholdMode = NextEpisodeThresholdMode.PERCENTAGE,
                thresholdPercent = 100f,
                thresholdMinutesBeforeEnd = 0f,
            ),
        )
    }

    @Test
    fun `outro with post-credits scene holds the card until playback truly ends`() {
        val intervals = listOf(outro(startSec = 1200.0, endSec = 1260.0))
        val durationMs = 1330_000L

        // During the outro itself
        assertFalse(
            PlayerNextEpisodeRules.shouldShowNextEpisodeCard(
                positionMs = 1200_000L,
                durationMs = durationMs,
                skipIntervals = intervals,
                thresholdMode = NextEpisodeThresholdMode.PERCENTAGE,
                thresholdPercent = 100f,
                thresholdMinutesBeforeEnd = 0f,
            ),
        )
        // At outro end, where the post-credits scene starts playing
        assertFalse(
            PlayerNextEpisodeRules.shouldShowNextEpisodeCard(
                positionMs = 1260_000L,
                durationMs = durationMs,
                skipIntervals = intervals,
                thresholdMode = NextEpisodeThresholdMode.PERCENTAGE,
                thresholdPercent = 100f,
                thresholdMinutesBeforeEnd = 0f,
            ),
        )
        // Mid post-credits scene
        assertFalse(
            PlayerNextEpisodeRules.shouldShowNextEpisodeCard(
                positionMs = 1320_000L,
                durationMs = durationMs,
                skipIntervals = intervals,
                thresholdMode = NextEpisodeThresholdMode.PERCENTAGE,
                thresholdPercent = 100f,
                thresholdMinutesBeforeEnd = 0f,
            ),
        )
    }

    @Test
    fun `outro with trailing tail just under post-credits threshold fires at outro start`() {
        val intervals = listOf(outro(startSec = 1200.0, endSec = 1260.0))
        val durationMs = 1289_000L

        assertTrue(
            PlayerNextEpisodeRules.shouldShowNextEpisodeCard(
                positionMs = 1200_000L,
                durationMs = durationMs,
                skipIntervals = intervals,
                thresholdMode = NextEpisodeThresholdMode.PERCENTAGE,
                thresholdPercent = 100f,
                thresholdMinutesBeforeEnd = 0f,
            ),
        )
    }

    @Test
    fun `unknown duration falls back to outro start trigger`() {
        val intervals = listOf(outro(startSec = 1200.0, endSec = 1260.0))

        assertTrue(
            PlayerNextEpisodeRules.shouldShowNextEpisodeCard(
                positionMs = 1200_000L,
                durationMs = 0L,
                skipIntervals = intervals,
                thresholdMode = NextEpisodeThresholdMode.PERCENTAGE,
                thresholdPercent = 100f,
                thresholdMinutesBeforeEnd = 0f,
            ),
        )
    }

    private fun outro(startSec: Double, endSec: Double): SkipInterval =
        SkipInterval(
            startTime = startSec,
            endTime = endSec,
            type = "outro",
            provider = "test",
        )
}
