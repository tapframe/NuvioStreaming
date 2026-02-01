package com.nuvio.tv.ui.screens.player

import androidx.media3.common.C
import androidx.media3.common.TrackGroup

data class PlayerUiState(
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = true,
    val currentPosition: Long = 0L,
    val duration: Long = 0L,
    val title: String = "",
    val showControls: Boolean = true,
    val playbackSpeed: Float = 1f,
    val audioTracks: List<TrackInfo> = emptyList(),
    val subtitleTracks: List<TrackInfo> = emptyList(),
    val selectedAudioTrackIndex: Int = -1,
    val selectedSubtitleTrackIndex: Int = -1,
    val showAudioDialog: Boolean = false,
    val showSubtitleDialog: Boolean = false,
    val showSpeedDialog: Boolean = false,
    val error: String? = null,
    val pendingSeekPosition: Long? = null  // For resuming from saved progress
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
    data object OnDismissDialog : PlayerEvent()
    data object OnRetry : PlayerEvent()
}

val PLAYBACK_SPEEDS = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)
