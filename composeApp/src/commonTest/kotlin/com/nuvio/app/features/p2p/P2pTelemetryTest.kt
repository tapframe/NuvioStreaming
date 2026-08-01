package com.nuvio.app.features.p2p

import com.nuvio.app.features.player.p2pInitialLoadingProgress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class P2pTelemetryTest {
    @Test
    fun torrentStatsAreVisibleByDefault() {
        assertFalse(P2pSettingsUiState().hideTorrentStats)
    }

    @Test
    fun connectingStateCarriesStartupTelemetry() {
        val state = P2pStreamingState.Connecting(
            phase = "add_magnet",
            downloadSpeed = 2_000_000L,
            peers = 12,
            seeds = 7,
        )

        assertEquals("add_magnet", state.phase)
        assertEquals(2_000_000L, state.downloadSpeed)
        assertEquals(12, state.peers)
        assertEquals(7, state.seeds)
    }

    @Test
    fun initialProgressUsesReadinessStagesWithoutCompletingDuringBuffering() {
        val target = 5_242_880L

        assertEquals(0f, p2pInitialLoadingProgress(0L, 0L, 0L))
        assertEquals(0.225f, p2pInitialLoadingProgress(0L, target, 0L))
        assertEquals(0.375f, p2pInitialLoadingProgress(0L, target, target))
        assertEquals(0.85f, p2pInitialLoadingProgress(5_000L, target, target))
        assertEquals(0.95f, p2pInitialLoadingProgress(15_000L, Long.MAX_VALUE, Long.MAX_VALUE))
    }
}
