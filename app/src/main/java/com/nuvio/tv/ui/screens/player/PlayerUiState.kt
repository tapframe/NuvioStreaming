package com.nuvio.tv.ui.screens.player

import androidx.media3.common.C
import androidx.media3.common.TrackGroup
import com.nuvio.tv.data.local.SubtitleStyleSettings
import com.nuvio.tv.data.repository.SkipInterval
import com.nuvio.tv.domain.model.Stream
import com.nuvio.tv.domain.model.Video

data class PlayerUiState(
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = true,
    val currentPosition: Long = 0L,
    val duration: Long = 0L,
    val title: String = "",
    val contentName: String? = null, // Series/show name (for series content)
    val releaseYear: String? = null, // Release year for movies
    val currentStreamName: String? = null, // Name of the current stream source
    val showControls: Boolean = true,
    val playbackSpeed: Float = 1f,
    val audioTracks: List<TrackInfo> = emptyList(),
    val subtitleTracks: List<TrackInfo> = emptyList(),
    val selectedAudioTrackIndex: Int = -1,
    val selectedSubtitleTrackIndex: Int = -1,
    val showAudioDialog: Boolean = false,
    val showSubtitleDialog: Boolean = false,
    val showSpeedDialog: Boolean = false,
    // Subtitle style settings
    val subtitleStyle: SubtitleStyleSettings = SubtitleStyleSettings(),
    // Episodes/streams side panel (for series)
    val showEpisodesPanel: Boolean = false,
    val isLoadingEpisodes: Boolean = false,
    val episodesError: String? = null,
    val episodesAll: List<Video> = emptyList(),
    val episodesAvailableSeasons: List<Int> = emptyList(),
    val episodesSelectedSeason: Int? = null,
    val episodes: List<Video> = emptyList(),
    val currentSeason: Int? = null,
    val currentEpisode: Int? = null,
    val currentEpisodeTitle: String? = null,
    val showEpisodeStreams: Boolean = false,
    val isLoadingEpisodeStreams: Boolean = false,
    val episodeStreamsError: String? = null,
    val episodeAllStreams: List<Stream> = emptyList(),
    val episodeSelectedAddonFilter: String? = null, // null means "All"
    val episodeFilteredStreams: List<Stream> = emptyList(),
    val episodeAvailableAddons: List<String> = emptyList(),
    val episodeStreamsForVideoId: String? = null,
    val episodeStreamsSeason: Int? = null,
    val episodeStreamsEpisode: Int? = null,
    val episodeStreamsTitle: String? = null,
    // Stream sources side panel (for switching streams during playback)
    val showSourcesPanel: Boolean = false,
    val isLoadingSourceStreams: Boolean = false,
    val sourceStreamsError: String? = null,
    val sourceAllStreams: List<Stream> = emptyList(),
    val sourceSelectedAddonFilter: String? = null, // null means "All"
    val sourceFilteredStreams: List<Stream> = emptyList(),
    val sourceAvailableAddons: List<String> = emptyList(),
    val error: String? = null,
    val pendingSeekPosition: Long? = null,  // For resuming from saved progress
    // Parental guide overlay
    val parentalWarnings: List<ParentalWarning> = emptyList(),
    val showParentalGuide: Boolean = false,
    val parentalGuideHasShown: Boolean = false,
    // Skip intro
    val activeSkipInterval: SkipInterval? = null,
    val skipIntervalDismissed: Boolean = false
)

data class TrackInfo(
    val index: Int,
    val name: String,
    val language: String?,
    val isSelected: Boolean = false
)

sealed class PlayerEvent {
    data object OnPlayPause : PlayerEvent()
    data object OnSeekForward : PlayerEvent()
    data object OnSeekBackward : PlayerEvent()
    data class OnSeekTo(val position: Long) : PlayerEvent()
    data class OnSelectAudioTrack(val index: Int) : PlayerEvent()
    data class OnSelectSubtitleTrack(val index: Int) : PlayerEvent()
    data object OnDisableSubtitles : PlayerEvent()
    data class OnSetPlaybackSpeed(val speed: Float) : PlayerEvent()
    data object OnToggleControls : PlayerEvent()
    data object OnShowAudioDialog : PlayerEvent()
    data object OnShowSubtitleDialog : PlayerEvent()
    data object OnShowSpeedDialog : PlayerEvent()
    data object OnShowEpisodesPanel : PlayerEvent()
    data object OnDismissEpisodesPanel : PlayerEvent()
    data object OnBackFromEpisodeStreams : PlayerEvent()
    data class OnEpisodeSeasonSelected(val season: Int) : PlayerEvent()
    data class OnEpisodeSelected(val video: Video) : PlayerEvent()
    data class OnEpisodeAddonFilterSelected(val addonName: String?) : PlayerEvent()
    data class OnEpisodeStreamSelected(val stream: Stream) : PlayerEvent()
    data object OnShowSourcesPanel : PlayerEvent()
    data object OnDismissSourcesPanel : PlayerEvent()
    data class OnSourceAddonFilterSelected(val addonName: String?) : PlayerEvent()
    data class OnSourceStreamSelected(val stream: Stream) : PlayerEvent()
    data object OnDismissDialog : PlayerEvent()
    data object OnRetry : PlayerEvent()
    data object OnParentalGuideHide : PlayerEvent()
    data object OnSkipIntro : PlayerEvent()
    data object OnDismissSkipIntro : PlayerEvent()
}

data class ParentalWarning(
    val label: String,
    val severity: String
)

val PLAYBACK_SPEEDS = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)
