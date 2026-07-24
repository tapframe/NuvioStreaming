package com.nuvio.app.features.p2p

import com.nuvio.engine.NuvioUploadMode
import com.nuvio.engine.NuvioTorrentProfile
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class P2pStreamingEngineAndroidTest {
    @Test
    fun appOwnedRoutesDisableAutomaticInactivityExpiry() {
        val stateDirectory = File("state")
        val cacheDirectory = File("cache")

        val uploading = buildNuvioEngineConfig(
            stateDirectory = stateDirectory,
            cacheDirectory = cacheDirectory,
            uploadEnabled = true,
            torrentProfile = P2pTorrentProfile.FAST,
            diskCacheCapacityBytes = P2pCacheSize.GB_5.bytes,
        )
        val downloadOnly = buildNuvioEngineConfig(
            stateDirectory = stateDirectory,
            cacheDirectory = cacheDirectory,
            uploadEnabled = false,
            torrentProfile = P2pTorrentProfile.SOFT,
            diskCacheCapacityBytes = P2pCacheSize.NONE.bytes,
        )

        assertEquals(0, uploading.streamInactivityTimeoutMilliseconds)
        assertEquals(NuvioUploadMode.Unlimited, uploading.uploadMode)
        assertEquals(NuvioTorrentProfile.Fast, uploading.torrentProfile)
        assertEquals(P2pCacheSize.GB_5.bytes, uploading.diskCacheCapacityBytes)
        assertEquals(0, downloadOnly.streamInactivityTimeoutMilliseconds)
        assertEquals(NuvioUploadMode.Disabled, downloadOnly.uploadMode)
        assertEquals(NuvioTorrentProfile.Soft, downloadOnly.torrentProfile)
        assertEquals(0L, downloadOnly.diskCacheCapacityBytes)
    }

    @Test
    fun matchingUnsolicitedStopBecomesTerminalError() {
        val error = unexpectedStreamStopError(
            requestId = 0L,
            eventStreamId = "stream",
            currentStreamId = "stream",
            message = "stream expired after inactivity",
            fallbackMessage = "unknown",
        )

        assertEquals(
            P2pStreamingState.Error("stream expired after inactivity"),
            error,
        )
    }

    @Test
    fun explicitAndStaleStopsAreIgnored() {
        assertNull(
            unexpectedStreamStopError(
                requestId = 7L,
                eventStreamId = "stream",
                currentStreamId = "stream",
                message = "stopped",
                fallbackMessage = "unknown",
            )
        )
        assertNull(
            unexpectedStreamStopError(
                requestId = 0L,
                eventStreamId = "old-stream",
                currentStreamId = "stream",
                message = "stopped",
                fallbackMessage = "unknown",
            )
        )
    }

    @Test
    fun blankStopMessageUsesFallback() {
        assertEquals(
            P2pStreamingState.Error("unknown"),
            unexpectedStreamStopError(
                requestId = 0L,
                eventStreamId = "stream",
                currentStreamId = "stream",
                message = "  ",
                fallbackMessage = "unknown",
            ),
        )
    }
}
