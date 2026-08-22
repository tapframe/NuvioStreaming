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
    fun selectedAddonKeepsTheExactEntryAcrossRawIdCollisions() {
        val controller = RecordingPlayerController(subtitles = emptyList())
        val first = addonSubtitle(
            url = "https://first.example/subtitle.srt?token=first",
            providerOrigin = "https://first.example/manifest.json",
        )
        val selected = addonSubtitle(
            url = "https://second.example/subtitle.srt?token=second",
            providerOrigin = "https://second.example/manifest.json",
        )
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs()).apply {
            playerController = controller
            addonSubtitles = listOf(first, selected)
        }

        runtime.selectAddonSubtitleFromUser(selected)

        assertEquals(selected, runtime.selectedAddonSubtitle)
        assertEquals(listOf(selected), controller.addonSelections)
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

    @Test
    fun addonToInternalAndOffUseThePlatformSelectionContract() {
        val controller = RecordingPlayerController(
            subtitles = listOf(
                SubtitleTrack(index = 0, id = "embedded-en", label = "English", language = "en"),
            ),
        )
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs()).apply {
            playerController = controller
            subtitleTracks = controller.getSubtitleTracks()
        }
        val addon = addonSubtitle(
            url = "https://example.com/external.srt?token=signed",
            providerOrigin = "https://provider.example/manifest.json",
        )

        runtime.selectAddonSubtitleFromUser(addon)
        runtime.selectBuiltInSubtitleFromUser(0)
        runtime.selectAddonSubtitleFromUser(addon)
        runtime.selectBuiltInSubtitleFromUser(-1)

        assertEquals(listOf(0, -1), controller.internalSubtitleSelections)
        assertEquals(emptyList(), controller.clearThenSelectCalls)
        assertEquals(null, runtime.selectedAddonSubtitle)
        assertEquals(false, runtime.useCustomSubtitles)
    }

    @Test
    fun restoredAddonReferenceResolvesOnceOnlyWhenUnique() {
        val resolved = addonSubtitle(
            url = "https://cdn.example/subtitle.srt?token=refreshed",
            providerOrigin = "https://provider.example/manifest.json",
        )
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs()).apply {
            addonSubtitles = listOf(resolved)
            pendingRestoredAddonSubtitle = RestoredAddonSubtitleReference(
                subtitleId = resolved.id,
                subtitleUrl = "https://cdn.example/subtitle.srt?token=expired",
                addonName = resolved.addonName,
            )
        }

        runtime.resolvePendingRestoredAddonSubtitle()

        assertEquals(resolved, runtime.selectedAddonSubtitle)
        assertEquals(null, runtime.pendingRestoredAddonSubtitle)
    }

    @Test
    fun ambiguousRestoredAddonReferenceDoesNotSelectAnArbitraryEntry() {
        val first = addonSubtitle(
            url = "https://cdn.example/a.srt?token=refreshed",
            providerOrigin = "https://provider.example/manifest.json",
        )
        val second = first.copy(url = "https://cdn.example/b.srt?token=refreshed")
        val runtime = PlayerScreenRuntime(testPlayerScreenArgs()).apply {
            addonSubtitles = listOf(first, second)
            pendingRestoredAddonSubtitle = RestoredAddonSubtitleReference(
                subtitleId = first.id,
                subtitleUrl = "https://cdn.example/subtitle.srt?token=expired",
                addonName = first.addonName,
            )
        }

        runtime.resolvePendingRestoredAddonSubtitle()

        assertEquals(null, runtime.selectedAddonSubtitle)
        assertEquals(first.id, runtime.pendingRestoredAddonSubtitle?.subtitleId)
    }

    private class RecordingPlayerController(
        private val subtitles: List<SubtitleTrack>,
    ) : PlayerEngineController {
        val internalSubtitleSelections = mutableListOf<Int>()
        val addonSelections = mutableListOf<AddonSubtitle>()
        val clearThenSelectCalls = mutableListOf<Int>()

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
        override fun clearExternalSubtitleAndSelect(trackIndex: Int) {
            clearThenSelectCalls += trackIndex
        }
    }

    private fun addonSubtitle(
        url: String,
        providerOrigin: String,
    ) = AddonSubtitle(
        id = "shared-id",
        url = url,
        language = "en",
        display = "English",
        addonName = "Same display name",
        providerOrigin = providerOrigin,
        providerSubtitleId = "shared-id",
    )

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
