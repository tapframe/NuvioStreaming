package com.nuvio.app.features.player

import androidx.compose.ui.Modifier
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PlayerSubtitleUserSelectionTest {

    @Test
    fun addonTapWinsOverPendingAutomaticSubtitleSelection() {
        val controller = RecordingPlayerController(
            subtitles = listOf(
                SubtitleTrack(index = 0, id = "embedded-en", label = "English", language = "en"),
            ),
        )
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs()).apply {
            playerController = controller
            playerSettingsUiState = PlayerSettingsUiState(preferredSubtitleLanguage = "en")
            preferredAudioSelectionApplied = true
            trackPreferenceRestoreApplied = true
        }
        val addon = AddonSubtitle(
            id = "opensubs-1",
            url = "https://example.com/subtitle.srt?token=signed",
            language = "en",
            display = "English",
            addonName = "OpenSubtitles",
        )

        runtime.selectAddonSubtitleFromUser(addon)
        runtime.refreshTracks()

        assertTrue(runtime.preferredSubtitleSelectionApplied)
        assertEquals(addon.id, runtime.selectedAddonSubtitleId)
        assertEquals(-1, runtime.selectedSubtitleIndex)
        assertTrue(runtime.useCustomSubtitles)
        assertEquals(listOf(addon), controller.addonSelections)
        assertEquals(emptyList(), controller.internalSubtitleSelections)
    }

    @Test
    fun internalTapWinsOverPendingAutomaticSubtitleSelection() {
        val controller = RecordingPlayerController(
            subtitles = listOf(
                SubtitleTrack(index = 0, id = "embedded-en", label = "English", language = "en"),
                SubtitleTrack(index = 1, id = "embedded-fr", label = "French", language = "fr"),
            ),
        )
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs()).apply {
            playerController = controller
            playerSettingsUiState = PlayerSettingsUiState(preferredSubtitleLanguage = "en")
            preferredAudioSelectionApplied = true
            trackPreferenceRestoreApplied = true
        }

        runtime.selectBuiltInSubtitleFromUser(1)
        runtime.refreshTracks()

        assertTrue(runtime.preferredSubtitleSelectionApplied)
        assertEquals(1, runtime.selectedSubtitleIndex)
        assertEquals(null, runtime.selectedAddonSubtitleId)
        assertEquals(false, runtime.useCustomSubtitles)
        assertEquals(listOf(1), controller.internalSubtitleSelections)
    }

    private class RecordingPlayerController(
        private val subtitles: List<SubtitleTrack>,
    ) : PlayerEngineController {
        val internalSubtitleSelections = mutableListOf<Int>()
        val addonSelections = mutableListOf<AddonSubtitle>()

        override fun play() = Unit
        override fun pause() = Unit
        override fun seekTo(positionMs: Long) = Unit
        override fun seekBy(offsetMs: Long) = Unit
        override fun retry() = Unit
        override fun setPlaybackSpeed(speed: Float) = Unit
        override fun getAudioTracks(): List<AudioTrack> = emptyList()
        override fun getSubtitleTracks(): List<SubtitleTrack> = subtitles
        override fun selectAudioTrack(index: Int) = Unit
        override fun selectSubtitleTrack(index: Int) {
            internalSubtitleSelections += index
        }
        override fun setSubtitleUri(url: String) = Unit
        override fun selectAddonSubtitle(subtitle: AddonSubtitle) {
            addonSelections += subtitle
        }
        override fun clearExternalSubtitle() = Unit
        override fun clearExternalSubtitleAndSelect(trackIndex: Int) = Unit
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
        parentMetaId = "",
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
