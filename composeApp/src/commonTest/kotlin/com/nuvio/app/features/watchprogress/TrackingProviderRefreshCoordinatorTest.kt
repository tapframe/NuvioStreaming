package com.nuvio.app.features.watchprogress

import com.nuvio.app.features.tracking.TrackingProviderId
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TrackingProviderRefreshCoordinatorTest {
    @Test
    fun `successful active provider refresh republishes read models in order`() = runBlocking {
        val events = mutableListOf<String>()

        val result = coordinateTrackingProviderRefresh(
            providerId = TrackingProviderId.SIMKL,
            refreshProvider = {
                events += "provider"
                true
            },
            activeProviderId = {
                events += "source"
                TrackingProviderId.SIMKL
            },
            refreshActiveReadModels = {
                events += "read-models"
                true
            },
        )

        assertTrue(result)
        assertEquals(listOf("provider", "source", "read-models"), events)
    }

    @Test
    fun `inactive provider refresh does not refresh another source`() = runBlocking {
        var readModelRefreshes = 0

        val result = coordinateTrackingProviderRefresh(
            providerId = TrackingProviderId.SIMKL,
            refreshProvider = { true },
            activeProviderId = { TrackingProviderId.TRAKT },
            refreshActiveReadModels = {
                readModelRefreshes += 1
                true
            },
        )

        assertTrue(result)
        assertEquals(0, readModelRefreshes)
    }

    @Test
    fun `failed provider refresh does not publish read models`() = runBlocking {
        var sourceReads = 0
        var readModelRefreshes = 0

        val result = coordinateTrackingProviderRefresh(
            providerId = TrackingProviderId.SIMKL,
            refreshProvider = { false },
            activeProviderId = {
                sourceReads += 1
                TrackingProviderId.SIMKL
            },
            refreshActiveReadModels = {
                readModelRefreshes += 1
                true
            },
        )

        assertFalse(result)
        assertEquals(0, sourceReads)
        assertEquals(0, readModelRefreshes)
    }

    @Test
    fun `read model refresh failure is surfaced`() = runBlocking {
        val result = coordinateTrackingProviderRefresh(
            providerId = TrackingProviderId.SIMKL,
            refreshProvider = { true },
            activeProviderId = { TrackingProviderId.SIMKL },
            refreshActiveReadModels = { false },
        )

        assertFalse(result)
    }
}
