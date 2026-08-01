package com.nuvio.app.features.watched

import com.nuvio.app.core.time.parseZonedIsoDateTimeToEpochMs
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.WatchProgressSource
import com.nuvio.app.features.tracking.providerId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WatchedModelsTest {
    @Test
    fun `compact watched timestamp normalizes to epoch millis`() {
        val expected = parseZonedIsoDateTimeToEpochMs("2026-04-25T10:02:00Z")

        assertEquals(expected, normalizeWatchedMarkedAtEpochMs(20260425100200L))
    }

    @Test
    fun `epoch watched timestamp is kept unchanged`() {
        assertEquals(1_778_060_222_000L, normalizeWatchedMarkedAtEpochMs(1_778_060_222_000L))
    }

    @Test
    fun `remote watched sources carry provider identity`() {
        assertEquals(TrackingProviderId.TRAKT, WatchProgressSource.TRAKT.providerId)
        assertEquals(TrackingProviderId.SIMKL, WatchProgressSource.SIMKL.providerId)
        assertEquals(null, WatchProgressSource.NUVIO_SYNC.providerId)
    }
}
