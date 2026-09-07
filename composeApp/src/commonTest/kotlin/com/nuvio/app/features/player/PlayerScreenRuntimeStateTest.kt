package com.nuvio.app.features.player

import androidx.compose.runtime.derivedStateOf
import androidx.compose.ui.Modifier
import com.nuvio.app.features.streams.StreamsUiState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PlayerScreenRuntimeStateTest {

    @Test
    fun controlsStartHidden() {
        assertFalse(PlayerScreenRuntime(testPlayerScreenArgs()).controlsVisible)
    }

    @Test
    fun parentalGuideDoesNotRevealPlaybackControls() {
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs())
        runtime.parentalWarnings = listOf(ParentalWarning(label = "Violence", severity = "Mild"))

        runtime.tryShowParentalGuide()

        assertTrue(runtime.showParentalGuide)
        assertFalse(runtime.controlsVisible)
    }

    @Test
    fun sourceFilterUpdatesInvalidateUiWithoutPlaybackUpdates() {
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs())
        val selectedFilter = derivedStateOf { runtime.sourceStreamsState.selectedFilter }

        assertNull(selectedFilter.value)

        runtime.sourceStreamsState = StreamsUiState(selectedFilter = "addon-id")

        assertEquals("addon-id", selectedFilter.value)
    }

    @Test
    fun episodeFilterUpdatesInvalidateUiWithoutPlaybackUpdates() {
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs())
        val selectedFilter = derivedStateOf { runtime.episodeStreamsRepoState.selectedFilter }

        assertNull(selectedFilter.value)

        runtime.episodeStreamsRepoState = StreamsUiState(selectedFilter = "addon-id")

        assertEquals("addon-id", selectedFilter.value)
    }

    @Test
    fun seekScrobbleUpdate_requiresActiveIncompletePlayback() {
        assertTrue(
            shouldUpdateTrackingScrobbleAfterSeek(
                hasActiveScrobble = true,
                progressPercent = 50f,
            ),
        )
        assertFalse(
            shouldUpdateTrackingScrobbleAfterSeek(
                hasActiveScrobble = false,
                progressPercent = 50f,
            ),
        )
        assertFalse(
            shouldUpdateTrackingScrobbleAfterSeek(
                hasActiveScrobble = true,
                progressPercent = 80f,
            ),
        )
    }

    @Test
    fun stopScrobble_closesActiveSessionBelowOnePercent() {
        assertTrue(
            shouldSendStopScrobble(
                hasActiveScrobble = true,
                progressPercent = 0f,
            ),
        )
        assertTrue(
            shouldSendStopScrobble(
                hasActiveScrobble = true,
                progressPercent = 0.5f,
            ),
        )
    }

    @Test
    fun stopScrobble_skipsEarlyProgressWithoutActiveSession() {
        assertFalse(
            shouldSendStopScrobble(
                hasActiveScrobble = false,
                progressPercent = 0.5f,
            ),
        )
        assertFalse(
            shouldSendStopScrobble(
                hasActiveScrobble = false,
                progressPercent = 79.99f,
            ),
        )
    }

    @Test
    fun stopScrobble_allowsCompletionWithoutActiveSession() {
        assertTrue(
            shouldSendStopScrobble(
                hasActiveScrobble = false,
                progressPercent = 80f,
            ),
        )
        assertTrue(
            shouldSendStopScrobble(
                hasActiveScrobble = false,
                progressPercent = 100f,
            ),
        )
    }

    private fun testPlayerScreenArgs() = PlayerScreenArgs(
        profileId = 1,
        title = "Title",
        sourceUrl = "https://example.com/video.mp4",
        sourceAudioUrl = null,
        sourceHeaders = emptyMap(),
        sourceResponseHeaders = emptyMap(),
        streamType = null,
        providerName = "Provider",
        streamTitle = "Source",
        streamSubtitle = null,
        initialBingeGroup = null,
        pauseDescription = null,
        onBack = {},
        onOpenInExternalPlayer = null,
        onOpenExternalUrl = null,
        modifier = Modifier,
        logo = null,
        poster = null,
        background = null,
        seasonNumber = null,
        episodeNumber = null,
        episodeTitle = null,
        episodeThumbnail = null,
        contentType = "movie",
        videoId = "tt1234567",
        parentMetaId = "tt1234567",
        parentMetaType = "movie",
        providerAddonId = null,
        torrentInfoHash = null,
        torrentFileIdx = null,
        torrentFilename = null,
        torrentTrackers = emptyList(),
        initialPositionMs = 0L,
        initialProgressFraction = null,
    )
}
