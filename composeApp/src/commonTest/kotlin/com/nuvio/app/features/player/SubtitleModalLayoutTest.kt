package com.nuvio.app.features.player

import androidx.compose.ui.unit.dp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SubtitleModalLayoutTest {

    @Test
    fun `phone landscape uses compact rails that fit the available width`() {
        val metrics = SubtitleModalLayoutMetrics.from(
            maxWidth = 884.dp,
            maxHeight = 400.dp,
        )

        assertTrue(metrics.isCompact)
        assertTrue(metrics.totalRailWidth <= 884.dp - metrics.horizontalPadding * 2)
        assertTrue(metrics.styleRailWidth >= 210.dp)
    }

    @Test
    fun `large landscape keeps the existing tablet layout`() {
        val metrics = SubtitleModalLayoutMetrics.from(
            maxWidth = 1280.dp,
            maxHeight = 720.dp,
        )

        assertFalse(metrics.isCompact)
        assertEquals(200.dp, metrics.languageRailWidth)
        assertEquals(300.dp, metrics.subtitleRailWidth)
        assertEquals(280.dp, metrics.styleRailWidth)
    }

    @Test
    fun `narrow landscape keeps usable minimum rail widths`() {
        val metrics = SubtitleModalLayoutMetrics.from(
            maxWidth = 640.dp,
            maxHeight = 360.dp,
        )

        assertTrue(metrics.isCompact)
        assertTrue(metrics.languageRailWidth >= 132.dp)
        assertTrue(metrics.subtitleRailWidth >= 210.dp)
        assertTrue(metrics.styleRailWidth >= 210.dp)
    }
}
