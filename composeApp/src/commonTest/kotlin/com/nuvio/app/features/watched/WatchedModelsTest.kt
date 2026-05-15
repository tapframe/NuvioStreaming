package com.nuvio.app.features.watched

import com.nuvio.app.features.trakt.TraktPlatformClock
import com.nuvio.app.features.trakt.WatchProgressSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WatchedModelsTest {
    @Test
    fun `compact watched timestamp normalizes to epoch millis`() {
        val expected = TraktPlatformClock.parseIsoDateTimeToEpochMs("2026-04-25T10:02:00Z")

        assertEquals(expected, normalizeWatchedMarkedAtEpochMs(20260425100200L))
    }

    @Test
    fun `epoch watched timestamp is kept unchanged`() {
        assertEquals(1_778_060_222_000L, normalizeWatchedMarkedAtEpochMs(1_778_060_222_000L))
    }

    @Test
    fun `Trakt watched sync follows selected watch progress source`() {
        assertTrue(
            shouldUseTraktWatchedSync(
                isAuthenticated = true,
                source = WatchProgressSource.TRAKT,
            ),
        )
        assertFalse(
            shouldUseTraktWatchedSync(
                isAuthenticated = true,
                source = WatchProgressSource.NUVIO_SYNC,
            ),
        )
        assertFalse(
            shouldUseTraktWatchedSync(
                isAuthenticated = false,
                source = WatchProgressSource.TRAKT,
            ),
        )
    }
}
