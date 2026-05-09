package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeContent
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.details.MetaScreenSettingsRepository
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.downloads.DownloadItem
import com.nuvio.app.features.downloads.DownloadsRepository
import com.nuvio.app.features.player.skip.NextEpisodeCard
import com.nuvio.app.features.player.skip.NextEpisodeInfo
import com.nuvio.app.features.player.skip.PlayerNextEpisodeRules
import com.nuvio.app.features.player.skip.SkipIntroButton
import com.nuvio.app.features.player.skip.SkipIntroRepository
import com.nuvio.app.features.player.skip.SkipInterval
import com.nuvio.app.features.streams.StreamAutoPlayMode
import com.nuvio.app.features.streams.StreamAutoPlaySelector
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.StreamLinkCacheRepository
import com.nuvio.app.features.streams.StreamsUiState
import com.nuvio.app.features.trakt.TraktScrobbleRepository
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watchprogress.WatchProgressClock
import com.nuvio.app.features.watchprogress.WatchProgressPlaybackSession
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import com.nuvio.app.features.watchprogress.buildPlaybackVideoId
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource
import kotlin.math.abs
import kotlin.math.roundToLong
import kotlin.math.roundToInt

private const val PlaybackProgressPersistIntervalMs = 60_000L
private const val PlayerDoubleTapSeekStepMs = 10_000L
private const val PlayerDoubleTapSeekResetDelayMs = 800L
private const val PlayerLockedOverlayDurationMs = 2_000L
private const val PlayerLeftGestureBoundary = 0.4f
private const val PlayerRightGestureBoundary = 0.6f
private const val PlayerVerticalGestureSensitivity = 1f
private val PlayerSliderOverlayGap = 12.dp
private val PlayerTimeRowHeight = 36.dp
private val PlayerActionRowHeight = 50.dp

private fun sliderOverlayBottomPadding(metrics: PlayerLayoutMetrics) =
    metrics.sliderBottomOffset +
        metrics.sliderTouchHeight +
        PlayerTimeRowHeight +
        PlayerActionRowHeight +
        PlayerSliderOverlayGap

private enum class PlayerSideGesture {
    Brightness,
    Volume,
}

private enum class PlayerSeekDirection {
    Backward,
    Forward,
}

private enum class PlayerGestureMode {
    HorizontalSeek,
    Brightness,
    Volume,
}

private data class PlayerAccumulatedSeekState(
    val direction: PlayerSeekDirection,
    val baselinePositionMs: Long,
    val amountMs: Long,
)

@Composable
fun PlayerScreen(
    title: String,
    sourceUrl: String,
    sourceAudioUrl: String? = null,
    sourceHeaders: Map<String, String> = emptyMap(),
    sourceResponseHeaders: Map<String, String> = emptyMap(),
    providerName: String,
    streamTitle: String,
    streamSubtitle: String?,
    initialBingeGroup: String? = null,
    pauseDescription: String? = null,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    logo: String? = null,
    poster: String? = null,
    background: String? = null,
    seasonNumber: Int? = null,
    episodeNumber: Int? = null,
    episodeTitle: String? = null,
    episodeThumbnail: String? = null,
    contentType: String? = null,
    videoId: String? = null,
    parentMetaId: String,
    parentMetaType: String,
    providerAddonId: String? = null,
    initialPositionMs: Long = 0L,
    initialProgressFraction: Float? = null,
) {
    LockPlayerToLandscape()
    val playerSettingsUiState by remember {
        PlayerSettingsRepository.ensureLoaded()
        PlayerSettingsRepository.uiState
    }.collectAsStateWithLifecycle()
    val metaScreenSettingsUiState by remember {
        MetaScreenSettingsRepository.ensureLoaded()
        MetaScreenSettingsRepository.uiState
    }.collectAsStateWithLifecycle()
    val watchedUiState by remember {
        WatchedRepository.ensureLoaded()
        WatchedRepository.uiState
    }.collectAsStateWithLifecycle()
    val watchProgressUiState by remember {
        WatchProgressRepository.ensureLoaded()
        WatchProgressRepository.uiState
    }.collectAsStateWithLifecycle()

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        val horizontalSafePadding = playerHorizontalSafePadding()
        val metrics = remember(maxWidth) { PlayerLayoutMetrics.fromWidth(maxWidth) }
        val sliderEdgePadding = horizontalSafePadding + metrics.horizontalPadding
        val overlayBottomPadding = sliderOverlayBottomPadding(metrics)
        val scope = rememberCoroutineScope()
        val hapticFeedback = LocalHapticFeedback.current
        val resizeModeFitLabel = stringResource(Res.string.compose_player_resize_fit)
        val resizeModeFillLabel = stringResource(Res.string.compose_player_resize_fill)
        val resizeModeZoomLabel = stringResource(Res.string.compose_player_resize_zoom)
        val downloadedLabel = stringResource(Res.string.compose_player_downloaded)
        val airsPrefix = stringResource(Res.string.compose_player_airs_prefix)
        val tbaLabel = stringResource(Res.string.compose_player_tba)
        val gestureController = rememberPlayerGestureController()
        var controlsVisible by rememberSaveable { mutableStateOf(true) }
        var playerControlsLocked by rememberSaveable { mutableStateOf(false) }
        // Active playback state (mutable to support source/episode switching)
        var activeSourceUrl by rememberSaveable { mutableStateOf(sourceUrl) }
        var activeSourceAudioUrl by rememberSaveable { mutableStateOf(sourceAudioUrl) }
        var activeSourceHeaders by remember(sourceUrl, sourceHeaders) {
            mutableStateOf(sanitizePlaybackHeaders(sourceHeaders))
        }
        var activeSourceResponseHeaders by remember(sourceUrl, sourceResponseHeaders) {
            mutableStateOf(sanitizePlaybackResponseHeaders(sourceResponseHeaders))
        }
        var activeStreamTitle by rememberSaveable { mutableStateOf(streamTitle) }
        var activeStreamSubtitle by rememberSaveable { mutableStateOf(streamSubtitle) }
        var activeProviderName by rememberSaveable { mutableStateOf(providerName) }
        var activeProviderAddonId by rememberSaveable { mutableStateOf(providerAddonId) }
        var currentStreamBingeGroup by rememberSaveable { mutableStateOf(initialBingeGroup) }
        var activeSeasonNumber by rememberSaveable { mutableStateOf(seasonNumber) }
        var activeEpisodeNumber by rememberSaveable { mutableStateOf(episodeNumber) }
        var activeEpisodeTitle by rememberSaveable { mutableStateOf(episodeTitle) }
        var activeEpisodeThumbnail by rememberSaveable { mutableStateOf(episodeThumbnail) }
        var activeVideoId by rememberSaveable { mutableStateOf(videoId) }
        var activeInitialPositionMs by rememberSaveable { mutableStateOf(initialPositionMs) }
        var activeInitialProgressFraction by rememberSaveable { mutableStateOf(initialProgressFraction) }
        var shouldPlay by rememberSaveable(activeSourceUrl) { mutableStateOf(true) }
        var resizeMode by rememberSaveable(playerSettingsUiState.resizeMode) {
            mutableStateOf(playerSettingsUiState.resizeMode)
        }
        var layoutSize by remember { mutableStateOf(IntSize.Zero) }
        var playbackSnapshot by remember { mutableStateOf(PlayerPlaybackSnapshot()) }
        var playerController by remember { mutableStateOf<PlayerEngineController?>(null) }
        var playerControllerSourceUrl by remember { mutableStateOf<String?>(null) }
        var errorMessage by remember { mutableStateOf<String?>(null) }
        val keepScreenAwake = errorMessage == null &&
            (playbackSnapshot.isPlaying || (shouldPlay && playbackSnapshot.isLoading))
        EnterImmersivePlayerMode(keepScreenAwake = keepScreenAwake)
        var scrubbingPositionMs by remember { mutableStateOf<Long?>(null) }
        var pausedOverlayVisible by remember { mutableStateOf(false) }
        var gestureFeedback by remember { mutableStateOf<GestureFeedbackState?>(null) }
        var liveGestureFeedback by remember { mutableStateOf<GestureFeedbackState?>(null) }
        var renderedGestureFeedback by remember { mutableStateOf<GestureFeedbackState?>(null) }
        var lockedOverlayVisible by remember { mutableStateOf(false) }
        var gestureMessageJob by remember { mutableStateOf<Job?>(null) }
        var accumulatedSeekResetJob by remember { mutableStateOf<Job?>(null) }
        var accumulatedSeekState by remember { mutableStateOf<PlayerAccumulatedSeekState?>(null) }
        var initialLoadCompleted by remember(activeSourceUrl) { mutableStateOf(false) }
        var speedBoostRestoreSpeed by remember(activeSourceUrl) { mutableStateOf<Float?>(null) }
        var isHoldToSpeedGestureActive by remember(activeSourceUrl) { mutableStateOf(false) }
        var initialSeekApplied by remember(activeSourceUrl, activeInitialPositionMs, activeInitialProgressFraction) {
            val initialProgressFraction = activeInitialProgressFraction
            mutableStateOf(
                activeInitialPositionMs <= 0L &&
                    (initialProgressFraction == null || initialProgressFraction <= 0f),
            )
        }
        var lastProgressPersistEpochMs by remember(activeSourceUrl) { mutableStateOf(0L) }
        var previousIsPlaying by remember(activeSourceUrl) { mutableStateOf(false) }
        var hasRequestedScrobbleStartForCurrentItem by remember(
            activeSourceUrl,
            activeVideoId,
            activeSeasonNumber,
            activeEpisodeNumber,
        ) { mutableStateOf(false) }
        var hasSentCompletionScrobbleForCurrentItem by remember(
            activeVideoId,
            activeSeasonNumber,
            activeEpisodeNumber,
        ) { mutableStateOf(false) }
        val backdropArtwork = background ?: poster
        val displayedPositionMs = scrubbingPositionMs ?: playbackSnapshot.positionMs
        val isEpisode = activeSeasonNumber != null && activeEpisodeNumber != null
        val currentGestureFeedback = liveGestureFeedback ?: gestureFeedback

        LaunchedEffect(currentGestureFeedback) {
            if (currentGestureFeedback != null) {
                renderedGestureFeedback = currentGestureFeedback
            }
        }

        // Sources & Episodes Panel state
        var showSourcesPanel by remember { mutableStateOf(false) }
        var showEpisodesPanel by remember { mutableStateOf(false) }
        var showSubmitIntroModal by remember { mutableStateOf(false) }
        var submitIntroSegmentType by rememberSaveable { mutableStateOf("intro") }
        var submitIntroStartTimeStr by rememberSaveable { mutableStateOf("00:00") }
        var submitIntroEndTimeStr by rememberSaveable { mutableStateOf("00:00") }
        var episodeStreamsPanelState by remember { mutableStateOf(EpisodeStreamsPanelState()) }
        val sourceStreamsState by PlayerStreamsRepository.sourceState.collectAsStateWithLifecycle()
        val episodeStreamsRepoState by PlayerStreamsRepository.episodeStreamsState.collectAsStateWithLifecycle()
        val metaUiState by MetaDetailsRepository.uiState.collectAsStateWithLifecycle()
        var playerMetaVideos by remember(parentMetaType, parentMetaId) {
            mutableStateOf(MetaDetailsRepository.peek(parentMetaType, parentMetaId)?.videos ?: emptyList())
        }
        val allEpisodes = remember(playerMetaVideos) { playerMetaVideos }
        val isSeries = parentMetaType == "series"

        // Skip intro/outro/recap state
        var skipIntervals by remember { mutableStateOf<List<SkipInterval>>(emptyList()) }
        var activeSkipInterval by remember { mutableStateOf<SkipInterval?>(null) }
        var skipIntervalDismissed by remember { mutableStateOf(false) }

        // Next episode state
        var nextEpisodeInfo by remember { mutableStateOf<NextEpisodeInfo?>(null) }
        var showNextEpisodeCard by remember { mutableStateOf(false) }
        var nextEpisodeAutoPlaySearching by remember { mutableStateOf(false) }
        var nextEpisodeAutoPlaySourceName by remember { mutableStateOf<String?>(null) }
        var nextEpisodeAutoPlayCountdown by remember { mutableStateOf<Int?>(null) }
        var nextEpisodeAutoPlayJob by remember { mutableStateOf<Job?>(null) }

        LaunchedEffect(parentMetaType, parentMetaId) {
            playerMetaVideos = MetaDetailsRepository.peek(parentMetaType, parentMetaId)?.videos ?: emptyList()
            if (playerMetaVideos.isEmpty()) {
                playerMetaVideos = MetaDetailsRepository.fetch(parentMetaType, parentMetaId)?.videos ?: emptyList()
            }
        }

        LaunchedEffect(metaUiState.meta, parentMetaType, parentMetaId) {
            val currentMeta = metaUiState.meta ?: return@LaunchedEffect
            if (currentMeta.type == parentMetaType && currentMeta.id == parentMetaId) {
                playerMetaVideos = currentMeta.videos
            }
        }

        ManagePlayerPictureInPicture(
            isPlaying = playbackSnapshot.isPlaying,
            playerSize = layoutSize,
        )

        val playbackSession = remember(
            contentType,
            parentMetaId,
            parentMetaType,
            activeVideoId,
            title,
            logo,
            poster,
            background,
            activeSeasonNumber,
            activeEpisodeNumber,
            activeEpisodeTitle,
            activeEpisodeThumbnail,
            activeProviderName,
            activeProviderAddonId,
            activeStreamTitle,
            activeStreamSubtitle,
            pauseDescription,
            activeSourceUrl,
            activeSourceAudioUrl,
        ) {
            WatchProgressPlaybackSession(
                contentType = contentType ?: parentMetaType,
                parentMetaId = parentMetaId,
                parentMetaType = parentMetaType,
                videoId = activeVideoId?.takeIf { it.isNotBlank() } ?: buildPlaybackVideoId(
                    parentMetaId = parentMetaId,
                    seasonNumber = activeSeasonNumber,
                    episodeNumber = activeEpisodeNumber,
                    fallbackVideoId = activeVideoId,
                ),
                title = title,
                logo = logo,
                poster = poster,
                background = background,
                seasonNumber = activeSeasonNumber,
                episodeNumber = activeEpisodeNumber,
                episodeTitle = activeEpisodeTitle,
                episodeThumbnail = activeEpisodeThumbnail,
                providerName = activeProviderName,
                providerAddonId = activeProviderAddonId,
                lastStreamTitle = activeStreamTitle,
                lastStreamSubtitle = activeStreamSubtitle,
                pauseDescription = pauseDescription,
                lastSourceUrl = activeSourceUrl,
            )
        }

        fun currentPlaybackProgressPercent(snapshot: PlayerPlaybackSnapshot = playbackSnapshot): Float {
            val duration = snapshot.durationMs.takeIf { it > 0L } ?: return 0f
            return ((snapshot.positionMs.toFloat() / duration.toFloat()) * 100f)
                .coerceIn(0f, 100f)
        }

        fun currentTraktScrobbleItem() = TraktScrobbleRepository.buildItem(
            contentType = contentType ?: parentMetaType,
            parentMetaId = parentMetaId,
            title = title,
            seasonNumber = activeSeasonNumber,
            episodeNumber = activeEpisodeNumber,
            episodeTitle = activeEpisodeTitle,
        )

        fun emitTraktScrobbleStart() {
            val item = currentTraktScrobbleItem() ?: return
            if (hasRequestedScrobbleStartForCurrentItem) return
            hasRequestedScrobbleStartForCurrentItem = true

            scope.launch {
                TraktScrobbleRepository.scrobbleStart(
                    item = item,
                    progressPercent = currentPlaybackProgressPercent(),
                )
            }
        }

        fun emitTraktScrobbleStop(progressPercent: Float? = null) {
            val item = currentTraktScrobbleItem() ?: return
            val provided = progressPercent
            if (!hasRequestedScrobbleStartForCurrentItem && (provided ?: 0f) < 80f) return

            val percent = provided ?: currentPlaybackProgressPercent()
            scope.launch {
                TraktScrobbleRepository.scrobbleStop(
                    item = item,
                    progressPercent = percent,
                )
            }
            hasRequestedScrobbleStartForCurrentItem = false
        }

        fun emitStopScrobbleForCurrentProgress() {
            val progressPercent = currentPlaybackProgressPercent()
            if (progressPercent >= 1f && progressPercent < 80f) {
                emitTraktScrobbleStop(progressPercent)
                return
            }

            if (progressPercent >= 80f && !hasSentCompletionScrobbleForCurrentItem) {
                hasSentCompletionScrobbleForCurrentItem = true
                emitTraktScrobbleStop(progressPercent)
            }
        }

        fun flushWatchProgress() {
            emitStopScrobbleForCurrentProgress()
            WatchProgressRepository.flushPlaybackProgress(
                session = playbackSession,
                snapshot = playbackSnapshot,
            )
        }

        val onBackWithProgress = remember(onBack, playbackSession, playbackSnapshot) {
            {
                flushWatchProgress()
                onBack()
            }
        }

        var showAudioModal by remember { mutableStateOf(false) }
        var showSubtitleModal by remember { mutableStateOf(false) }
        var audioTracks by remember { mutableStateOf<List<AudioTrack>>(emptyList()) }
        var subtitleTracks by remember { mutableStateOf<List<SubtitleTrack>>(emptyList()) }
        var selectedAudioIndex by remember { mutableStateOf(-1) }
        var selectedSubtitleIndex by remember { mutableStateOf(-1) }
        var selectedAddonSubtitleId by remember { mutableStateOf<String?>(null) }
        var useCustomSubtitles by remember { mutableStateOf(false) }
        var preferredAudioSelectionApplied by rememberSaveable(sourceUrl) { mutableStateOf(false) }
        var preferredSubtitleSelectionApplied by rememberSaveable(sourceUrl) { mutableStateOf(false) }
        var activeSubtitleTab by remember { mutableStateOf(SubtitleTab.BuiltIn) }
        val subtitleStyle = playerSettingsUiState.subtitleStyle
        val addonSubtitles by SubtitleRepository.addonSubtitles.collectAsStateWithLifecycle()
        val isLoadingAddonSubtitles by SubtitleRepository.isLoading.collectAsStateWithLifecycle()

        fun refreshTracks() {
            val ctrl = playerController ?: return
            audioTracks = ctrl.getAudioTracks()
            subtitleTracks = ctrl.getSubtitleTracks()
            val selectedAudio = audioTracks.firstOrNull { it.isSelected }
            if (selectedAudio != null) selectedAudioIndex = selectedAudio.index
            val selectedSub = subtitleTracks.firstOrNull { it.isSelected }
            if (selectedSub != null && !useCustomSubtitles) selectedSubtitleIndex = selectedSub.index

            if (!preferredAudioSelectionApplied) {
                val preferredAudioTargets = resolvePreferredAudioLanguageTargets(
                    preferredAudioLanguage = playerSettingsUiState.preferredAudioLanguage,
                    secondaryPreferredAudioLanguage = playerSettingsUiState.secondaryPreferredAudioLanguage,
                    deviceLanguages = DeviceLanguagePreferences.preferredLanguageCodes(),
                )
                if (preferredAudioTargets.isEmpty()) {
                    preferredAudioSelectionApplied = true
                } else if (audioTracks.isNotEmpty()) {
                    val preferredAudioIndex = findPreferredTrackIndex(
                        tracks = audioTracks,
                        targets = preferredAudioTargets,
                        language = { track -> track.language },
                    )
                    if (preferredAudioIndex >= 0 && preferredAudioIndex != selectedAudioIndex) {
                        playerController?.selectAudioTrack(preferredAudioIndex)
                        selectedAudioIndex = preferredAudioIndex
                    }
                    preferredAudioSelectionApplied = true
                }
            }

            if (!preferredSubtitleSelectionApplied) {
                val preferredSubtitleTargets = resolvePreferredSubtitleLanguageTargets(
                    preferredSubtitleLanguage = playerSettingsUiState.preferredSubtitleLanguage,
                    secondaryPreferredSubtitleLanguage = playerSettingsUiState.secondaryPreferredSubtitleLanguage,
                    deviceLanguages = DeviceLanguagePreferences.preferredLanguageCodes(),
                )

                if (preferredSubtitleTargets.isEmpty()) {
                    if (selectedSubtitleIndex != -1 || subtitleTracks.any { it.isSelected }) {
                        playerController?.selectSubtitleTrack(-1)
                    }
                    selectedSubtitleIndex = -1
                    selectedAddonSubtitleId = null
                    useCustomSubtitles = false
                    preferredSubtitleSelectionApplied = true
                } else if (subtitleTracks.isNotEmpty()) {
                    val preferredSubtitleIndex = findPreferredSubtitleTrackIndex(
                        tracks = subtitleTracks,
                        targets = preferredSubtitleTargets,
                    )
                    if (preferredSubtitleIndex >= 0 && preferredSubtitleIndex != selectedSubtitleIndex) {
                        playerController?.selectSubtitleTrack(preferredSubtitleIndex)
                        selectedSubtitleIndex = preferredSubtitleIndex
                        selectedAddonSubtitleId = null
                        useCustomSubtitles = false
                    } else if (
                        preferredSubtitleIndex < 0 &&
                        normalizeLanguageCode(playerSettingsUiState.preferredSubtitleLanguage) == SubtitleLanguageOption.FORCED
                    ) {
                        if (selectedSubtitleIndex != -1 || subtitleTracks.any { it.isSelected }) {
                            playerController?.selectSubtitleTrack(-1)
                        }
                        selectedSubtitleIndex = -1
                        selectedAddonSubtitleId = null
                        useCustomSubtitles = false
                    }
                    preferredSubtitleSelectionApplied = true
                }
            }

        }

        fun showGestureFeedback(feedback: GestureFeedbackState) {
            gestureMessageJob?.cancel()
            gestureFeedback = feedback
            gestureMessageJob = scope.launch {
                delay(900)
                gestureFeedback = null
            }
        }

        fun showGestureMessage(message: String) {
            showGestureFeedback(GestureFeedbackState(message = message))
        }

        fun clearLiveGestureFeedback() {
            liveGestureFeedback = null
        }

        fun revealLockedOverlay() {
            controlsVisible = false
            lockedOverlayVisible = true
        }

        fun lockPlayerControls() {
            playerControlsLocked = true
            controlsVisible = false
            lockedOverlayVisible = false
            pausedOverlayVisible = false
            scrubbingPositionMs = null
            gestureMessageJob?.cancel()
            gestureFeedback = null
            liveGestureFeedback = null
            renderedGestureFeedback = null
            showAudioModal = false
            showSubtitleModal = false
            showSourcesPanel = false
            showEpisodesPanel = false
            episodeStreamsPanelState = EpisodeStreamsPanelState()
            PlayerStreamsRepository.clearEpisodeStreams()
        }

        fun unlockPlayerControls() {
            playerControlsLocked = false
            lockedOverlayVisible = false
            controlsVisible = true
        }

        fun showSeekFeedback(direction: PlayerSeekDirection, amountMs: Long) {
            val seconds = amountMs / 1000L
            if (seconds <= 0L) return
            showGestureFeedback(
                GestureFeedbackState(
                    messageRes = if (direction == PlayerSeekDirection.Forward) {
                        Res.string.compose_player_seek_feedback_forward
                    } else {
                        Res.string.compose_player_seek_feedback_backward
                    },
                    messageArgs = listOf(seconds),
                    icon = if (direction == PlayerSeekDirection.Forward) {
                        GestureFeedbackIcon.SeekForward
                    } else {
                        GestureFeedbackIcon.SeekBackward
                    },
                ),
            )
        }

        fun showHorizontalSeekPreview(previewPositionMs: Long, baselinePositionMs: Long) {
            val deltaMs = previewPositionMs - baselinePositionMs
            val direction = if (deltaMs < 0L) PlayerSeekDirection.Backward else PlayerSeekDirection.Forward
            liveGestureFeedback = GestureFeedbackState(
                message = formatPlaybackTime(previewPositionMs),
                icon = if (direction == PlayerSeekDirection.Forward) {
                    GestureFeedbackIcon.SeekForward
                } else {
                    GestureFeedbackIcon.SeekBackward
                },
                secondaryMessageRes = if (deltaMs >= 0L) {
                    Res.string.compose_player_seek_delta_forward
                } else {
                    Res.string.compose_player_seek_delta_backward
                },
                secondaryMessageArgs = listOf((abs(deltaMs) / 1000f).roundToInt()),
                secondaryMessageColor = if (direction == PlayerSeekDirection.Forward) {
                    Color(0xFF6EE7A8)
                } else {
                    Color(0xFFFF9A76)
                },
            )
        }

        fun showBrightnessFeedback(level: Float) {
            val percentage = (level.coerceIn(0f, 1f) * 100f).roundToInt()
            showGestureFeedback(
                GestureFeedbackState(
                    messageRes = Res.string.compose_player_brightness_level,
                    messageArgs = listOf("$percentage%"),
                    icon = GestureFeedbackIcon.Brightness,
                ),
            )
        }

        fun showVolumeFeedback(level: PlayerAudioLevel) {
            val percentage = (level.fraction.coerceIn(0f, 1f) * 100f).roundToInt()
            showGestureFeedback(
                GestureFeedbackState(
                    messageRes = if (level.isMuted) {
                        Res.string.compose_player_muted
                    } else {
                        Res.string.compose_player_volume_level
                    },
                    messageArgs = if (level.isMuted) emptyList() else listOf("$percentage%"),
                    icon = if (level.isMuted) GestureFeedbackIcon.VolumeMuted else GestureFeedbackIcon.Volume,
                    isDanger = level.isMuted,
                ),
            )
        }

        fun togglePlayback() {
            if (playbackSnapshot.isPlaying) {
                shouldPlay = false
                playerController?.pause()
            } else {
                if (playbackSnapshot.isEnded) {
                    playerController?.seekTo(0L)
                }
                shouldPlay = true
                playerController?.play()
            }
            controlsVisible = true
        }

        fun seekBy(offsetMs: Long) {
            playerController?.seekBy(offsetMs)
            controlsVisible = true
            when {
                offsetMs > 0L -> showSeekFeedback(PlayerSeekDirection.Forward, offsetMs)
                offsetMs < 0L -> showSeekFeedback(PlayerSeekDirection.Backward, abs(offsetMs))
            }
        }

        fun handleDoubleTapSeek(direction: PlayerSeekDirection) {
            val currentPositionMs = playbackSnapshot.positionMs.coerceAtLeast(0L)
            val nextState = if (accumulatedSeekState?.direction == direction) {
                accumulatedSeekState!!.copy(amountMs = accumulatedSeekState!!.amountMs + PlayerDoubleTapSeekStepMs)
            } else {
                PlayerAccumulatedSeekState(
                    direction = direction,
                    baselinePositionMs = currentPositionMs,
                    amountMs = PlayerDoubleTapSeekStepMs,
                )
            }
            accumulatedSeekState = nextState

            val maxDurationMs = playbackSnapshot.durationMs.takeIf { it > 0L }
            val targetPositionMs = when (direction) {
                PlayerSeekDirection.Backward -> {
                    (nextState.baselinePositionMs - nextState.amountMs).coerceAtLeast(0L)
                }

                PlayerSeekDirection.Forward -> {
                    val unclamped = nextState.baselinePositionMs + nextState.amountMs
                    maxDurationMs?.let { unclamped.coerceAtMost(it) } ?: unclamped
                }
            }
            playerController?.seekTo(targetPositionMs)
            showSeekFeedback(direction, nextState.amountMs)

            accumulatedSeekResetJob?.cancel()
            accumulatedSeekResetJob = scope.launch {
                delay(PlayerDoubleTapSeekResetDelayMs)
                accumulatedSeekState = null
            }
        }

        fun cycleResizeMode() {
            val nextMode = resizeMode.next()
            resizeMode = nextMode
            PlayerSettingsRepository.setResizeMode(nextMode)
            showGestureMessage(
                when (nextMode) {
                    PlayerResizeMode.Fit -> resizeModeFitLabel
                    PlayerResizeMode.Fill -> resizeModeFillLabel
                    PlayerResizeMode.Zoom -> resizeModeZoomLabel
                },
            )
            controlsVisible = true
        }

        fun cyclePlaybackSpeed() {
            val speeds = listOf(1f, 1.25f, 1.5f, 2f)
            val current = playbackSnapshot.playbackSpeed
            val next = speeds.firstOrNull { it > current + 0.01f } ?: speeds.first()
            playerController?.setPlaybackSpeed(next)
            showGestureMessage(formatPlaybackSpeedLabel(next))
            controlsVisible = true
        }

        fun activateHoldToSpeed() {
            if (!playerSettingsUiState.holdToSpeedEnabled) return
            val controller = playerController ?: return
            if (speedBoostRestoreSpeed != null) return

            val targetSpeed = playerSettingsUiState.holdToSpeedValue
            val currentSpeed = playbackSnapshot.playbackSpeed
            if (abs(currentSpeed - targetSpeed) < 0.01f) return

            isHoldToSpeedGestureActive = true
            speedBoostRestoreSpeed = currentSpeed
            controller.setPlaybackSpeed(targetSpeed)
            liveGestureFeedback = GestureFeedbackState(
                message = formatPlaybackSpeedLabel(targetSpeed),
                icon = GestureFeedbackIcon.Speed,
            )
            hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
        }

        fun deactivateHoldToSpeed() {
            isHoldToSpeedGestureActive = false
            val restoreSpeed = speedBoostRestoreSpeed ?: return
            playerController?.setPlaybackSpeed(restoreSpeed)
            speedBoostRestoreSpeed = null
            liveGestureFeedback = null
        }

        val onSurfaceTap = rememberUpdatedState { offset: Offset ->
            if (playerControlsLocked) {
                revealLockedOverlay()
                return@rememberUpdatedState
            }
            val centerStart = layoutSize.width * PlayerLeftGestureBoundary
            val centerEnd = layoutSize.width * PlayerRightGestureBoundary
            if (controlsVisible && offset.x in centerStart..centerEnd) {
                controlsVisible = false
            } else {
                controlsVisible = !controlsVisible
            }
        }
        val onSurfaceDoubleTap = rememberUpdatedState { offset: Offset ->
            if (playerControlsLocked) {
                revealLockedOverlay()
                return@rememberUpdatedState
            }
            when {
                offset.x < layoutSize.width * PlayerLeftGestureBoundary -> {
                    handleDoubleTapSeek(PlayerSeekDirection.Backward)
                }

                offset.x > layoutSize.width * PlayerRightGestureBoundary -> {
                    handleDoubleTapSeek(PlayerSeekDirection.Forward)
                }

                else -> controlsVisible = !controlsVisible
            }
        }
        val activateHoldToSpeedState = rememberUpdatedState(::activateHoldToSpeed)
        val deactivateHoldToSpeedState = rememberUpdatedState(::deactivateHoldToSpeed)
        val showHorizontalSeekPreviewState = rememberUpdatedState(::showHorizontalSeekPreview)
        val showBrightnessFeedbackState = rememberUpdatedState(::showBrightnessFeedback)
        val showVolumeFeedbackState = rememberUpdatedState(::showVolumeFeedback)
        val clearLiveGestureFeedbackState = rememberUpdatedState(::clearLiveGestureFeedback)
        val revealLockedOverlayState = rememberUpdatedState(::revealLockedOverlay)
        val isHoldToSpeedGestureActiveState = rememberUpdatedState(isHoldToSpeedGestureActive)
        val playerControlsLockedState = rememberUpdatedState(playerControlsLocked)
        val currentPositionMsState = rememberUpdatedState(playbackSnapshot.positionMs.coerceAtLeast(0L))
        val currentDurationMsState = rememberUpdatedState(playbackSnapshot.durationMs)
        val commitHorizontalSeekState = rememberUpdatedState { targetPositionMs: Long ->
            playerController?.seekTo(targetPositionMs)
        }

        fun switchToSource(stream: StreamItem) {
            val url = stream.directPlaybackUrl ?: return
            if (url == activeSourceUrl) return
            val currentPositionMs = playbackSnapshot.positionMs.coerceAtLeast(0L)
            flushWatchProgress()
            if (playerSettingsUiState.streamReuseLastLinkEnabled && activeVideoId != null) {
                val cacheKey = StreamLinkCacheRepository.contentKey(
                    contentType ?: parentMetaType,
                    activeVideoId!!,
                )
                StreamLinkCacheRepository.save(
                    contentKey = cacheKey,
                    url = url,
                    streamName = stream.streamLabel,
                    addonName = stream.addonName,
                    addonId = stream.addonId,
                    requestHeaders = sanitizePlaybackHeaders(stream.behaviorHints.proxyHeaders?.request),
                    responseHeaders = sanitizePlaybackResponseHeaders(stream.behaviorHints.proxyHeaders?.response),
                    filename = stream.behaviorHints.filename,
                    videoSize = stream.behaviorHints.videoSize,
                    bingeGroup = stream.behaviorHints.bingeGroup,
                )
            }
            activeSourceUrl = url
            activeSourceAudioUrl = null
            activeSourceHeaders = sanitizePlaybackHeaders(stream.behaviorHints.proxyHeaders?.request)
            activeSourceResponseHeaders = sanitizePlaybackResponseHeaders(stream.behaviorHints.proxyHeaders?.response)
            activeStreamTitle = stream.streamLabel
            activeStreamSubtitle = stream.streamSubtitle
            activeProviderName = stream.addonName
            activeProviderAddonId = stream.addonId
            currentStreamBingeGroup = stream.behaviorHints.bingeGroup
            activeInitialPositionMs = currentPositionMs
            activeInitialProgressFraction = null
            showSourcesPanel = false
            controlsVisible = true
        }

        fun switchToEpisodeStream(stream: StreamItem, episode: MetaVideo) {
            val url = stream.directPlaybackUrl ?: return
            showNextEpisodeCard = false
            showSourcesPanel = false
            showEpisodesPanel = false
            episodeStreamsPanelState = EpisodeStreamsPanelState()
            nextEpisodeAutoPlayJob?.cancel()
            nextEpisodeAutoPlaySearching = false
            nextEpisodeAutoPlaySourceName = null
            nextEpisodeAutoPlayCountdown = null
            PlayerStreamsRepository.clearEpisodeStreams()
            flushWatchProgress()
            val epVideoId = episode.id
            val epResumeVideoId = buildPlaybackVideoId(
                parentMetaId = parentMetaId,
                seasonNumber = episode.season,
                episodeNumber = episode.episode,
                fallbackVideoId = epVideoId,
            )
            val epEntry = WatchProgressRepository.progressForVideo(
                epVideoId.takeIf { it.isNotBlank() } ?: epResumeVideoId,
            )
                ?.takeIf { !it.isCompleted }
            val epResumeFraction = epEntry?.progressPercent
                ?.takeIf { it > 0f }
                ?.let { (it / 100f).coerceIn(0f, 1f) }
            val epResumePositionMs = epEntry?.lastPositionMs?.takeIf { it > 0L } ?: 0L
            if (playerSettingsUiState.streamReuseLastLinkEnabled) {
                val cacheKey = StreamLinkCacheRepository.contentKey(
                    contentType ?: parentMetaType,
                    epVideoId,
                )
                StreamLinkCacheRepository.save(
                    contentKey = cacheKey,
                    url = url,
                    streamName = stream.streamLabel,
                    addonName = stream.addonName,
                    addonId = stream.addonId,
                    requestHeaders = sanitizePlaybackHeaders(stream.behaviorHints.proxyHeaders?.request),
                    responseHeaders = sanitizePlaybackResponseHeaders(stream.behaviorHints.proxyHeaders?.response),
                    filename = stream.behaviorHints.filename,
                    videoSize = stream.behaviorHints.videoSize,
                    bingeGroup = stream.behaviorHints.bingeGroup,
                )
            }
            activeSourceUrl = url
            activeSourceAudioUrl = null
            activeSourceHeaders = sanitizePlaybackHeaders(stream.behaviorHints.proxyHeaders?.request)
            activeSourceResponseHeaders = sanitizePlaybackResponseHeaders(stream.behaviorHints.proxyHeaders?.response)
            activeStreamTitle = stream.streamLabel
            activeStreamSubtitle = stream.streamSubtitle
            activeProviderName = stream.addonName
            activeProviderAddonId = stream.addonId
            currentStreamBingeGroup = stream.behaviorHints.bingeGroup
            activeSeasonNumber = episode.season
            activeEpisodeNumber = episode.episode
            activeEpisodeTitle = episode.title
            activeEpisodeThumbnail = episode.thumbnail
            activeVideoId = episode.id
            activeInitialPositionMs = epResumePositionMs
            activeInitialProgressFraction = epResumeFraction
            controlsVisible = true
        }

        fun switchToDownloadedEpisode(downloadItem: DownloadItem, episode: MetaVideo) {
            val localFileUri = DownloadsRepository.playableLocalFileUri(downloadItem) ?: return
            showNextEpisodeCard = false
            showSourcesPanel = false
            showEpisodesPanel = false
            episodeStreamsPanelState = EpisodeStreamsPanelState()
            nextEpisodeAutoPlayJob?.cancel()
            nextEpisodeAutoPlaySearching = false
            nextEpisodeAutoPlaySourceName = null
            nextEpisodeAutoPlayCountdown = null
            PlayerStreamsRepository.clearEpisodeStreams()
            flushWatchProgress()

            val fallbackVideoId = buildPlaybackVideoId(
                parentMetaId = parentMetaId,
                seasonNumber = episode.season,
                episodeNumber = episode.episode,
                fallbackVideoId = episode.id,
            )
            val resolvedVideoId = episode.id.takeIf { it.isNotBlank() } ?: fallbackVideoId
            val epEntry = WatchProgressRepository.progressForVideo(resolvedVideoId)
                ?.takeIf { !it.isCompleted }
            val epResumeFraction = epEntry?.progressPercent
                ?.takeIf { it > 0f }
                ?.let { (it / 100f).coerceIn(0f, 1f) }
            val epResumePositionMs = epEntry?.lastPositionMs?.takeIf { it > 0L } ?: 0L

            activeSourceUrl = localFileUri
            activeSourceAudioUrl = null
            activeSourceHeaders = emptyMap()
            activeSourceResponseHeaders = emptyMap()
            activeStreamTitle = downloadItem.streamTitle.ifBlank {
                episode.title.ifBlank { title }
            }
            activeStreamSubtitle = downloadItem.streamSubtitle
            activeProviderName = downloadItem.providerName.ifBlank { downloadedLabel }
            activeProviderAddonId = downloadItem.providerAddonId
            currentStreamBingeGroup = null
            activeSeasonNumber = episode.season
            activeEpisodeNumber = episode.episode
            activeEpisodeTitle = episode.title
            activeEpisodeThumbnail = episode.thumbnail
            activeVideoId = resolvedVideoId
            activeInitialPositionMs = epResumePositionMs
            activeInitialProgressFraction = epResumeFraction
            controlsVisible = true
        }

        fun playNextEpisode() {
            val nextVideoId = nextEpisodeInfo?.videoId ?: return
            val nextVideo = allEpisodes.firstOrNull { video -> video.id == nextVideoId } ?: return
            if (nextEpisodeInfo?.hasAired != true) return

            val downloadedNextEpisode = DownloadsRepository.findPlayableDownload(
                parentMetaId = parentMetaId,
                seasonNumber = nextVideo.season,
                episodeNumber = nextVideo.episode,
                videoId = nextVideo.id,
            )
            if (downloadedNextEpisode != null) {
                switchToDownloadedEpisode(downloadedNextEpisode, nextVideo)
                return
            }

            nextEpisodeAutoPlayJob?.cancel()
            nextEpisodeAutoPlaySearching = true
            nextEpisodeAutoPlaySourceName = null
            nextEpisodeAutoPlayCountdown = null

            val type = contentType ?: parentMetaType
            val settings = playerSettingsUiState
            val shouldAutoSelectInManualMode =
                settings.streamAutoPlayMode == StreamAutoPlayMode.MANUAL &&
                    (
                        settings.streamAutoPlayNextEpisodeEnabled ||
                            settings.streamAutoPlayPreferBingeGroup
                        )

            // Determine auto-play mode for next episode
            val effectiveMode = if (shouldAutoSelectInManualMode) {
                StreamAutoPlayMode.FIRST_STREAM
            } else {
                settings.streamAutoPlayMode
            }
            val effectiveSource = if (shouldAutoSelectInManualMode) {
                com.nuvio.app.features.streams.StreamAutoPlaySource.ALL_SOURCES
            } else {
                settings.streamAutoPlaySource
            }
            val effectiveSelectedAddons = if (shouldAutoSelectInManualMode) {
                emptySet()
            } else {
                settings.streamAutoPlaySelectedAddons
            }
            val effectiveSelectedPlugins = if (shouldAutoSelectInManualMode) {
                emptySet()
            } else {
                settings.streamAutoPlaySelectedPlugins
            }
            val effectiveRegex = if (shouldAutoSelectInManualMode) {
                ""
            } else {
                settings.streamAutoPlayRegex
            }

            nextEpisodeAutoPlayJob = scope.launch {
                PlayerStreamsRepository.loadEpisodeStreams(
                    type = type,
                    videoId = nextVideo.id,
                    season = nextVideo.season,
                    episode = nextVideo.episode,
                )

                val installedAddonNames = AddonRepository.uiState.value.addons
                    .map { it.displayTitle }
                    .toSet()

                val timeoutMs = settings.streamAutoPlayTimeoutSeconds * 1000L
                val startTime = WatchProgressClock.nowEpochMs()

                // Collect streams as they arrive
                PlayerStreamsRepository.episodeStreamsState.collectLatest { state ->
                    if (state.groups.isEmpty() && state.isAnyLoading) return@collectLatest

                    val allStreams = state.groups.flatMap { it.streams }
                    val elapsed = WatchProgressClock.nowEpochMs() - startTime

                    val selected = if (allStreams.isNotEmpty()) {
                        StreamAutoPlaySelector.selectAutoPlayStream(
                            streams = allStreams,
                            mode = effectiveMode,
                            regexPattern = effectiveRegex,
                            source = effectiveSource,
                            installedAddonNames = installedAddonNames,
                            selectedAddons = effectiveSelectedAddons,
                            selectedPlugins = effectiveSelectedPlugins,
                            preferredBingeGroup = if (settings.streamAutoPlayPreferBingeGroup) {
                                currentStreamBingeGroup
                            } else {
                                null
                            },
                            preferBingeGroupInSelection = settings.streamAutoPlayPreferBingeGroup,
                        )
                    } else null

                    if (selected != null || !state.isAnyLoading || elapsed >= timeoutMs) {
                        nextEpisodeAutoPlaySearching = false
                        if (selected != null) {
                            nextEpisodeAutoPlaySourceName = selected.addonName
                            // Countdown before playing
                            for (i in 3 downTo 1) {
                                nextEpisodeAutoPlayCountdown = i
                                delay(1000)
                            }
                            switchToEpisodeStream(selected, nextVideo)
                            showNextEpisodeCard = false
                            nextEpisodeAutoPlayCountdown = null
                            nextEpisodeAutoPlaySourceName = null
                        } else if (!state.isAnyLoading || elapsed >= timeoutMs) {
                            // No stream found — open the episode streams panel for manual selection
                            episodeStreamsPanelState = EpisodeStreamsPanelState(
                                showStreams = true,
                                selectedEpisode = nextVideo,
                            )
                            showEpisodesPanel = true
                            showNextEpisodeCard = false
                        }
                        return@collectLatest
                    }
                }
            }
        }

        fun openSourcesPanel() {
            val type = contentType ?: parentMetaType
            val vid = activeVideoId ?: return
            PlayerStreamsRepository.loadSources(
                type = type,
                videoId = vid,
                season = activeSeasonNumber,
                episode = activeEpisodeNumber,
            )
            showSourcesPanel = true
            showEpisodesPanel = false
            controlsVisible = false
        }

        fun openEpisodesPanel() {
            // Ensure meta is loaded for episodes
            if (allEpisodes.isEmpty()) {
                scope.launch {
                    playerMetaVideos = MetaDetailsRepository.fetch(parentMetaType, parentMetaId)?.videos ?: emptyList()
                }
            }
            showEpisodesPanel = true
            showSourcesPanel = false
            controlsVisible = false
        }

        fun fetchAddonSubtitlesForActiveItem() {
            val type = contentType ?: return
            val videoId = activeVideoId ?: return
            SubtitleRepository.fetchAddonSubtitles(type, videoId)
        }

        LaunchedEffect(activeSourceUrl, activeSourceAudioUrl, activeSourceHeaders, activeSourceResponseHeaders) {
            errorMessage = null
            playerController = null
            playerControllerSourceUrl = null
            playbackSnapshot = PlayerPlaybackSnapshot()
            scrubbingPositionMs = null
            liveGestureFeedback = null
            renderedGestureFeedback = null
            lockedOverlayVisible = false
            initialLoadCompleted = false
            lastProgressPersistEpochMs = 0L
            previousIsPlaying = false
            accumulatedSeekResetJob?.cancel()
            accumulatedSeekResetJob = null
            accumulatedSeekState = null
            speedBoostRestoreSpeed = null
            preferredAudioSelectionApplied = false
            preferredSubtitleSelectionApplied = false
            showSourcesPanel = false
            showEpisodesPanel = false
            episodeStreamsPanelState = EpisodeStreamsPanelState()
            PlayerStreamsRepository.clearEpisodeStreams()
            SubtitleRepository.clear()
            WatchProgressRepository.ensureLoaded()
        }

        LaunchedEffect(playerController, subtitleStyle) {
            playerController?.applySubtitleStyle(subtitleStyle)
        }

        LaunchedEffect(showSubtitleModal, activeSubtitleTab, contentType, activeVideoId) {
            if (!showSubtitleModal || activeSubtitleTab != SubtitleTab.Addons) return@LaunchedEffect
            if (!isLoadingAddonSubtitles && addonSubtitles.isEmpty()) {
                fetchAddonSubtitlesForActiveItem()
            }
        }

        LaunchedEffect(playbackSnapshot.isLoading, playerController) {
            if (!playbackSnapshot.isLoading && playerController != null) {
                refreshTracks()
            }
        }

        LaunchedEffect(
            playerController,
            playbackSnapshot.isLoading,
            preferredAudioSelectionApplied,
            preferredSubtitleSelectionApplied,
        ) {
            if (playerController == null || playbackSnapshot.isLoading) {
                return@LaunchedEffect
            }
            if (preferredAudioSelectionApplied && preferredSubtitleSelectionApplied) {
                return@LaunchedEffect
            }

            repeat(10) {
                refreshTracks()
                if (preferredAudioSelectionApplied && preferredSubtitleSelectionApplied) {
                    return@LaunchedEffect
                }
                delay(300)
            }
        }

        LaunchedEffect(
            playerController,
            playerControllerSourceUrl,
            playbackSnapshot.isLoading,
            playbackSnapshot.durationMs,
            activeInitialPositionMs,
            activeInitialProgressFraction,
            initialSeekApplied,
        ) {
            val controller = playerController ?: return@LaunchedEffect
            if (playerControllerSourceUrl != activeSourceUrl) {
                return@LaunchedEffect
            }
            if (initialSeekApplied || playbackSnapshot.isLoading) {
                return@LaunchedEffect
            }

            val progressFraction = activeInitialProgressFraction
                ?.takeIf { it > 0f }
                ?.coerceIn(0f, 1f)
            val targetPositionMs = when {
                activeInitialPositionMs > 0L -> activeInitialPositionMs
                progressFraction != null && playbackSnapshot.durationMs > 0L -> {
                    (playbackSnapshot.durationMs.toDouble() * progressFraction.toDouble()).toLong()
                }
                progressFraction != null -> return@LaunchedEffect
                else -> 0L
            }
            if (targetPositionMs <= 0L) {
                initialSeekApplied = true
                return@LaunchedEffect
            }

            controller.seekTo(targetPositionMs)
            initialSeekApplied = true
        }

        LaunchedEffect(controlsVisible, playbackSnapshot.isPlaying, playbackSnapshot.isLoading, errorMessage) {
            if (!controlsVisible || !playbackSnapshot.isPlaying || playbackSnapshot.isLoading || errorMessage != null) {
                return@LaunchedEffect
            }
            delay(3500)
            controlsVisible = false
        }

        LaunchedEffect(playerControlsLocked, lockedOverlayVisible) {
            if (!playerControlsLocked || !lockedOverlayVisible) {
                return@LaunchedEffect
            }
            delay(PlayerLockedOverlayDurationMs)
            lockedOverlayVisible = false
        }

        LaunchedEffect(playbackSnapshot.isPlaying, playbackSnapshot.isLoading, playbackSnapshot.durationMs, errorMessage) {
            pausedOverlayVisible = false
            if (playbackSnapshot.isPlaying || playbackSnapshot.isLoading || playbackSnapshot.durationMs <= 0L || errorMessage != null) {
                return@LaunchedEffect
            }
            delay(5000)
            pausedOverlayVisible = true
        }

        LaunchedEffect(
            playbackSnapshot.positionMs,
            playbackSnapshot.isPlaying,
            playbackSnapshot.isLoading,
            playbackSnapshot.isEnded,
            playbackSnapshot.durationMs,
        ) {
            if (playbackSnapshot.isEnded) {
                flushWatchProgress()
                previousIsPlaying = false
                return@LaunchedEffect
            }

            if (previousIsPlaying && !playbackSnapshot.isPlaying && !playbackSnapshot.isLoading) {
                flushWatchProgress()
            }

            if (!previousIsPlaying && playbackSnapshot.isPlaying) {
                emitTraktScrobbleStart()
            }

            if (!playbackSnapshot.isLoading) {
                previousIsPlaying = playbackSnapshot.isPlaying
            }

            if (!playbackSnapshot.isPlaying) {
                return@LaunchedEffect
            }

            val now = WatchProgressClock.nowEpochMs()
            if (now - lastProgressPersistEpochMs < PlaybackProgressPersistIntervalMs) {
                return@LaunchedEffect
            }
            lastProgressPersistEpochMs = now
            WatchProgressRepository.upsertPlaybackProgress(
                session = playbackSession,
                snapshot = playbackSnapshot,
            )
        }

        // Fetch skip intervals when episode changes
        LaunchedEffect(activeVideoId, activeSeasonNumber, activeEpisodeNumber) {
            skipIntervals = emptyList()
            activeSkipInterval = null
            skipIntervalDismissed = false
            showNextEpisodeCard = false
            nextEpisodeAutoPlayJob?.cancel()
            nextEpisodeAutoPlaySearching = false

            val season = activeSeasonNumber
            val episode = activeEpisodeNumber
            val vid = activeVideoId

            if (season == null || episode == null || vid == null) return@LaunchedEffect

            launch {
                val imdbId = vid.split(":").firstOrNull()?.takeIf { it.startsWith("tt") }
                val intervals = SkipIntroRepository.getSkipIntervals(
                    imdbId = imdbId,
                    season = season,
                    episode = episode,
                )
                skipIntervals = intervals
            }
        }

        // Update active skip interval based on playback position
        LaunchedEffect(playbackSnapshot.positionMs, skipIntervals) {
            if (skipIntervals.isEmpty()) {
                activeSkipInterval = null
                return@LaunchedEffect
            }
            val positionSec = playbackSnapshot.positionMs / 1000.0
            val current = skipIntervals.firstOrNull { interval ->
                positionSec >= interval.startTime && positionSec < interval.endTime
            }
            if (current != activeSkipInterval) {
                activeSkipInterval = current
                if (current != null) skipIntervalDismissed = false
            }
        }

        // Resolve next episode info when episodes list or current episode changes
        LaunchedEffect(allEpisodes, activeSeasonNumber, activeEpisodeNumber) {
            if (!isSeries || allEpisodes.isEmpty()) {
                nextEpisodeInfo = null
                return@LaunchedEffect
            }
            val curSeason = activeSeasonNumber ?: return@LaunchedEffect
            val curEpisode = activeEpisodeNumber ?: return@LaunchedEffect
            val nextVideo = PlayerNextEpisodeRules.resolveNextEpisode(
                videos = allEpisodes,
                currentSeason = curSeason,
                currentEpisode = curEpisode,
            )
            nextEpisodeInfo = if (nextVideo != null && nextVideo.season != null && nextVideo.episode != null) {
                NextEpisodeInfo(
                    videoId = nextVideo.id,
                    season = nextVideo.season!!,
                    episode = nextVideo.episode!!,
                    title = nextVideo.title,
                    thumbnail = nextVideo.thumbnail,
                    overview = nextVideo.overview,
                    released = nextVideo.released,
                    hasAired = PlayerNextEpisodeRules.hasEpisodeAired(nextVideo.released),
                    unairedMessage = if (!PlayerNextEpisodeRules.hasEpisodeAired(nextVideo.released)) {
                        "$airsPrefix ${nextVideo.released ?: tbaLabel}"
                    } else null,
                )
            } else null
        }

        // Show next episode card at threshold
        LaunchedEffect(
            playbackSnapshot.positionMs,
            playbackSnapshot.durationMs,
            nextEpisodeInfo,
            skipIntervals,
            playerSettingsUiState.nextEpisodeThresholdMode,
            playerSettingsUiState.nextEpisodeThresholdPercent,
            playerSettingsUiState.nextEpisodeThresholdMinutesBeforeEnd,
        ) {
            if (nextEpisodeInfo == null || playbackSnapshot.durationMs <= 0L) {
                showNextEpisodeCard = false
                return@LaunchedEffect
            }
            val shouldShow = PlayerNextEpisodeRules.shouldShowNextEpisodeCard(
                positionMs = playbackSnapshot.positionMs,
                durationMs = playbackSnapshot.durationMs,
                skipIntervals = skipIntervals,
                thresholdMode = playerSettingsUiState.nextEpisodeThresholdMode,
                thresholdPercent = playerSettingsUiState.nextEpisodeThresholdPercent,
                thresholdMinutesBeforeEnd = playerSettingsUiState.nextEpisodeThresholdMinutesBeforeEnd,
            )
            if (shouldShow && !showNextEpisodeCard) {
                showNextEpisodeCard = true
                // Auto-play if enabled
                if (playerSettingsUiState.streamAutoPlayNextEpisodeEnabled && nextEpisodeInfo?.hasAired == true) {
                    playNextEpisode()
                }
            } else if (!shouldShow) {
                showNextEpisodeCard = false
            }
        }

        // Auto-play on video ended if next episode card isn't already showing
        LaunchedEffect(playbackSnapshot.isEnded, nextEpisodeInfo) {
            if (playbackSnapshot.isEnded && nextEpisodeInfo != null && !showNextEpisodeCard) {
                showNextEpisodeCard = true
                if (playerSettingsUiState.streamAutoPlayNextEpisodeEnabled && nextEpisodeInfo?.hasAired == true) {
                    playNextEpisode()
                }
            }
        }

        DisposableEffect(playbackSession.videoId, activeSourceUrl, activeSourceAudioUrl) {
            onDispose {
                flushWatchProgress()
            }
        }

        DisposableEffect(Unit) {
            onDispose {
                PlayerStreamsRepository.clearAll()
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .onSizeChanged { layoutSize = it }
                .pointerInput(layoutSize) {
                    detectTapGestures(
                        onPress = {
                            tryAwaitRelease()
                            deactivateHoldToSpeedState.value()
                        },
                        onTap = { offset -> onSurfaceTap.value(offset) },
                        onDoubleTap = { offset -> onSurfaceDoubleTap.value(offset) },
                        onLongPress = {
                            if (playerControlsLockedState.value) {
                                revealLockedOverlayState.value()
                            } else {
                                activateHoldToSpeedState.value()
                            }
                        },
                    )
                }
                .pointerInput(gestureController, layoutSize) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        if (playerControlsLockedState.value) {
                            while (true) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                                if (!change.pressed) break
                                change.consume()
                            }
                            return@awaitEachGesture
                        }
                        val controller = gestureController
                        val width = size.width.toFloat().takeIf { it > 0f } ?: return@awaitEachGesture
                        val height = size.height.toFloat().takeIf { it > 0f } ?: return@awaitEachGesture
                        val region = when {
                            down.position.x < width * PlayerLeftGestureBoundary -> PlayerSideGesture.Brightness
                            down.position.x > width * PlayerRightGestureBoundary -> PlayerSideGesture.Volume
                            else -> null
                        }

                        val initialBrightness = if (region == PlayerSideGesture.Brightness) {
                            controller?.currentBrightness()
                        } else {
                            null
                        }
                        val initialVolume = if (region == PlayerSideGesture.Volume) {
                            controller?.currentVolume()
                        } else {
                            null
                        }

                        var totalDx = 0f
                        var totalDy = 0f
                        var gestureMode: PlayerGestureMode? = null
                        val horizontalSeekBaselineMs = currentPositionMsState.value
                        var horizontalSeekPreviewMs = horizontalSeekBaselineMs

                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == down.id } ?: break
                            if (!change.pressed) break

                            val delta = change.position - change.previousPosition
                            totalDx += delta.x
                            totalDy += delta.y

                            if (gestureMode == null) {
                                val holdToSpeedActive = isHoldToSpeedGestureActiveState.value
                                val horizontalDominant =
                                    !holdToSpeedActive &&
                                        abs(totalDx) > viewConfiguration.touchSlop &&
                                        abs(totalDx) > abs(totalDy)
                                val verticalDominant =
                                    !holdToSpeedActive &&
                                        abs(totalDy) > viewConfiguration.touchSlop &&
                                        abs(totalDy) > abs(totalDx)

                                gestureMode = when {
                                    horizontalDominant -> {
                                        deactivateHoldToSpeedState.value()
                                        PlayerGestureMode.HorizontalSeek
                                    }

                                    verticalDominant && region == PlayerSideGesture.Brightness && initialBrightness != null -> {
                                        PlayerGestureMode.Brightness
                                    }

                                    verticalDominant && region == PlayerSideGesture.Volume && initialVolume != null -> {
                                        PlayerGestureMode.Volume
                                    }

                                    else -> null
                                }

                                if (gestureMode == null) {
                                    continue
                                }
                            }

                            when (gestureMode) {
                                PlayerGestureMode.HorizontalSeek -> {
                                    val sensitivitySeconds = when {
                                        currentDurationMsState.value >= 3_600_000L -> 120f
                                        currentDurationMsState.value >= 1_800_000L -> 90f
                                        else -> 60f
                                    }
                                    val previewOffsetMs =
                                        ((totalDx / width) * sensitivitySeconds * 1000f).roundToLong()
                                    val unclampedPreviewMs = horizontalSeekBaselineMs + previewOffsetMs
                                    horizontalSeekPreviewMs = currentDurationMsState.value
                                        .takeIf { it > 0L }
                                        ?.let { durationMs ->
                                            unclampedPreviewMs.coerceIn(0L, durationMs)
                                        }
                                        ?: unclampedPreviewMs.coerceAtLeast(0L)
                                    showHorizontalSeekPreviewState.value(
                                        horizontalSeekPreviewMs,
                                        horizontalSeekBaselineMs,
                                    )
                                }

                                PlayerGestureMode.Brightness -> {
                                    val gestureDeltaFraction =
                                        (-totalDy / height) * PlayerVerticalGestureSensitivity
                                    controller?.setBrightness((initialBrightness ?: 0f) + gestureDeltaFraction)
                                        ?.let(showBrightnessFeedbackState.value)
                                }

                                PlayerGestureMode.Volume -> {
                                    val gestureDeltaFraction =
                                        (-totalDy / height) * PlayerVerticalGestureSensitivity
                                    controller?.setVolume((initialVolume?.fraction ?: 0f) + gestureDeltaFraction)
                                        ?.let(showVolumeFeedbackState.value)
                                }

                                null -> Unit
                            }
                            change.consume()
                        }

                        if (gestureMode == PlayerGestureMode.HorizontalSeek && !isHoldToSpeedGestureActiveState.value) {
                            commitHorizontalSeekState.value(horizontalSeekPreviewMs)
                            clearLiveGestureFeedbackState.value()
                        }
                    }
                },
        ) {
            PlatformPlayerSurface(
                sourceUrl = activeSourceUrl,
                sourceAudioUrl = activeSourceAudioUrl,
                sourceHeaders = activeSourceHeaders,
                sourceResponseHeaders = activeSourceResponseHeaders,
                modifier = Modifier.fillMaxSize(),
                playWhenReady = shouldPlay,
                resizeMode = resizeMode,
                onControllerReady = { controller ->
                    playerController = controller
                    playerControllerSourceUrl = activeSourceUrl
                },
                onSnapshot = { snapshot ->
                    playbackSnapshot = snapshot
                    if (!snapshot.isLoading) {
                        initialLoadCompleted = true
                    }
                    if (snapshot.isEnded) {
                        shouldPlay = false
                        controlsVisible = !playerControlsLocked
                    }
                },
                onError = { message ->
                    errorMessage = message
                    if (message != null) {
                        controlsVisible = !playerControlsLocked
                        val currentVideoId = activeVideoId
                        if (currentVideoId != null) {
                            val cacheKey = StreamLinkCacheRepository.contentKey(
                                contentType ?: parentMetaType,
                                currentVideoId,
                            )
                            StreamLinkCacheRepository.remove(cacheKey)
                        }
                    }
                },
            )

            AnimatedVisibility(
                visible = pausedOverlayVisible && !controlsVisible && !playerControlsLocked,
                enter = fadeIn(animationSpec = tween(durationMillis = 220)),
                exit = fadeOut(animationSpec = tween(durationMillis = 180)),
            ) {
                PauseMetadataOverlay(
                    title = title,
                    logo = logo,
                    isEpisode = isEpisode,
                    seasonNumber = activeSeasonNumber,
                    episodeNumber = activeEpisodeNumber,
                    episodeTitle = activeEpisodeTitle,
                    pauseDescription = pauseDescription ?: activeStreamSubtitle,
                    providerName = activeProviderName,
                    metrics = metrics,
                    horizontalSafePadding = horizontalSafePadding,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            AnimatedVisibility(
                visible = controlsVisible && !playerControlsLocked,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                PlayerControlsShell(
                    title = title,
                    streamTitle = activeStreamTitle,
                    providerName = activeProviderName,
                    seasonNumber = activeSeasonNumber,
                    episodeNumber = activeEpisodeNumber,
                    episodeTitle = activeEpisodeTitle,
                    playbackSnapshot = playbackSnapshot,
                    displayedPositionMs = displayedPositionMs,
                    metrics = metrics,
                    resizeMode = resizeMode,
                    isLocked = playerControlsLocked,
                    onLockToggle = {
                        if (playerControlsLocked) {
                            unlockPlayerControls()
                        } else {
                            lockPlayerControls()
                        }
                    },
                    onBack = onBackWithProgress,
                    onTogglePlayback = ::togglePlayback,
                    onSeekBack = { seekBy(-10_000L) },
                    onSeekForward = { seekBy(10_000L) },
                    onResizeModeClick = ::cycleResizeMode,
                    onSpeedClick = ::cyclePlaybackSpeed,
                    onSubtitleClick = {
                        refreshTracks()
                        showSubtitleModal = true
                    },
                    onAudioClick = {
                        refreshTracks()
                        showAudioModal = true
                    },
                    onSourcesClick = if (activeVideoId != null) { { openSourcesPanel() } } else null,
                    onEpisodesClick = if (isSeries) { { openEpisodesPanel() } } else null,
                    onSubmitIntroClick = if (isSeries && playerSettingsUiState.introSubmitEnabled && playerSettingsUiState.introDbApiKey.isNotBlank()) { { showSubmitIntroModal = true } } else null,
                    onScrubChange = { positionMs -> scrubbingPositionMs = positionMs },
                    onScrubFinished = { positionMs ->
                        scrubbingPositionMs = null
                        playerController?.seekTo(positionMs)
                    },
                    horizontalSafePadding = horizontalSafePadding,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            AnimatedVisibility(
                visible = playerControlsLocked && lockedOverlayVisible,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                LockedPlayerOverlay(
                    playbackSnapshot = playbackSnapshot,
                    displayedPositionMs = displayedPositionMs,
                    metrics = metrics,
                    horizontalSafePadding = horizontalSafePadding,
                    onUnlock = ::unlockPlayerControls,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            AnimatedVisibility(
                visible = playerSettingsUiState.showLoadingOverlay && !initialLoadCompleted && errorMessage == null,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                OpeningOverlay(
                    artwork = backdropArtwork,
                    logo = logo,
                    title = title,
                    onBack = onBackWithProgress,
                    horizontalSafePadding = horizontalSafePadding,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            AnimatedVisibility(
                visible = currentGestureFeedback != null,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                ) {
                    renderedGestureFeedback?.let { feedback ->
                        GestureFeedbackPill(
                            feedback = feedback,
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .windowInsetsPadding(WindowInsets.safeContent.only(WindowInsetsSides.Top))
                                .padding(horizontal = horizontalSafePadding)
                                .padding(top = 40.dp),
                        )
                    }
                }
            }

            // Skip intro/recap/outro button
            if (!playerControlsLocked) {
                SkipIntroButton(
                    interval = activeSkipInterval,
                    dismissed = skipIntervalDismissed,
                    controlsVisible = controlsVisible,
                    onSkip = {
                        val interval = activeSkipInterval ?: return@SkipIntroButton
                        playerController?.seekTo((interval.endTime * 1000).toLong())
                        skipIntervalDismissed = true
                    },
                    onDismiss = { skipIntervalDismissed = true },
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(start = sliderEdgePadding, bottom = overlayBottomPadding),
                )
            }

            // Next episode card
            if (isSeries && !playerControlsLocked) {
                NextEpisodeCard(
                    nextEpisode = nextEpisodeInfo,
                    visible = showNextEpisodeCard,
                    isAutoPlaySearching = nextEpisodeAutoPlaySearching,
                    autoPlaySourceName = nextEpisodeAutoPlaySourceName,
                    autoPlayCountdownSec = nextEpisodeAutoPlayCountdown,
                    onPlayNext = {
                        nextEpisodeAutoPlayJob?.cancel()
                        playNextEpisode()
                    },
                    onDismiss = {
                        nextEpisodeAutoPlayJob?.cancel()
                        showNextEpisodeCard = false
                        nextEpisodeAutoPlaySearching = false
                        nextEpisodeAutoPlaySourceName = null
                        nextEpisodeAutoPlayCountdown = null
                    },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = sliderEdgePadding, bottom = overlayBottomPadding),
                )
            }

            if (errorMessage != null) {
                ErrorModal(
                    message = errorMessage.orEmpty(),
                    onDismiss = onBackWithProgress,
                )
            }

            AudioTrackModal(
                visible = showAudioModal,
                audioTracks = audioTracks,
                selectedIndex = selectedAudioIndex,
                onTrackSelected = { index ->
                    selectedAudioIndex = index
                    playerController?.selectAudioTrack(index)
                    scope.launch {
                        delay(200)
                        showAudioModal = false
                    }
                },
                onDismiss = { showAudioModal = false },
            )

            SubtitleModal(
                visible = showSubtitleModal,
                activeTab = activeSubtitleTab,
                subtitleTracks = subtitleTracks,
                selectedSubtitleIndex = selectedSubtitleIndex,
                addonSubtitles = addonSubtitles,
                selectedAddonSubtitleId = selectedAddonSubtitleId,
                isLoadingAddonSubtitles = isLoadingAddonSubtitles,
                subtitleStyle = subtitleStyle,
                onTabSelected = { activeSubtitleTab = it },
                onBuiltInTrackSelected = { index ->
                    val wasCustom = useCustomSubtitles
                    selectedSubtitleIndex = index
                    selectedAddonSubtitleId = null
                    useCustomSubtitles = false
                    if (wasCustom) {
                        playerController?.clearExternalSubtitleAndSelect(index)
                    } else {
                        playerController?.selectSubtitleTrack(index)
                    }
                },
                onAddonSubtitleSelected = { addon ->
                    selectedAddonSubtitleId = addon.id
                    selectedSubtitleIndex = -1
                    useCustomSubtitles = true
                    playerController?.setSubtitleUri(addon.url)
                },
                onFetchAddonSubtitles = ::fetchAddonSubtitlesForActiveItem,
                onStyleChanged = PlayerSettingsRepository::setSubtitleStyle,
                onDismiss = { showSubtitleModal = false },
            )

            // Sources Panel
            PlayerSourcesPanel(
                visible = showSourcesPanel,
                streamsUiState = sourceStreamsState,
                currentStreamUrl = activeSourceUrl,
                currentStreamName = activeStreamTitle,
                onFilterSelected = { PlayerStreamsRepository.selectSourceFilter(it) },
                onStreamSelected = ::switchToSource,
                onReload = {
                    val type = contentType ?: parentMetaType
                    val vid = activeVideoId ?: return@PlayerSourcesPanel
                    PlayerStreamsRepository.loadSources(
                        type = type,
                        videoId = vid,
                        season = activeSeasonNumber,
                        episode = activeEpisodeNumber,
                        forceRefresh = true,
                    )
                },
                onDismiss = {
                    showSourcesPanel = false
                    controlsVisible = true
                },
            )

            // Episodes Panel
            if (isSeries) {
                PlayerEpisodesPanel(
                    visible = showEpisodesPanel,
                    episodes = allEpisodes,
                    parentMetaType = parentMetaType,
                    parentMetaId = parentMetaId,
                    currentSeason = activeSeasonNumber,
                    currentEpisode = activeEpisodeNumber,
                    progressByVideoId = watchProgressUiState.byVideoId,
                    watchedKeys = watchedUiState.watchedKeys,
                    blurUnwatchedEpisodes = metaScreenSettingsUiState.blurUnwatchedEpisodes,
                    episodeStreamsState = episodeStreamsPanelState.copy(
                        streamsUiState = episodeStreamsRepoState,
                    ),
                    onSeasonSelected = { /* season tab change handled internally */ },
                    onEpisodeSelected = { episode ->
                        val downloadedEpisode = DownloadsRepository.findPlayableDownload(
                            parentMetaId = parentMetaId,
                            seasonNumber = episode.season,
                            episodeNumber = episode.episode,
                            videoId = episode.id,
                        )
                        if (downloadedEpisode != null) {
                            switchToDownloadedEpisode(downloadedEpisode, episode)
                            return@PlayerEpisodesPanel
                        }

                        val type = contentType ?: parentMetaType
                        PlayerStreamsRepository.loadEpisodeStreams(
                            type = type,
                            videoId = episode.id,
                            season = episode.season,
                            episode = episode.episode,
                        )
                        episodeStreamsPanelState = EpisodeStreamsPanelState(
                            showStreams = true,
                            selectedEpisode = episode,
                        )
                    },
                    onEpisodeStreamFilterSelected = {
                        PlayerStreamsRepository.selectEpisodeStreamsFilter(it)
                    },
                    onEpisodeStreamSelected = ::switchToEpisodeStream,
                    onBackToEpisodes = {
                        episodeStreamsPanelState = EpisodeStreamsPanelState()
                        PlayerStreamsRepository.clearEpisodeStreams()
                    },
                    onReloadEpisodeStreams = {
                        val episode = episodeStreamsPanelState.selectedEpisode ?: return@PlayerEpisodesPanel
                        val type = contentType ?: parentMetaType
                        PlayerStreamsRepository.loadEpisodeStreams(
                            type = type,
                            videoId = episode.id,
                            season = episode.season,
                            episode = episode.episode,
                            forceRefresh = true,
                        )
                    },
                    onDismiss = {
                        showEpisodesPanel = false
                        episodeStreamsPanelState = EpisodeStreamsPanelState()
                        PlayerStreamsRepository.clearEpisodeStreams()
                        controlsVisible = true
                    },
                )
            }

            val season = activeSeasonNumber
            val episode = activeEpisodeNumber
            val imdbId = activeVideoId?.split(":")?.firstOrNull()?.takeIf { it.startsWith("tt") }
                ?: parentMetaId.takeIf { it.startsWith("tt") }
                ?: metaUiState.meta?.id?.takeIf { it.startsWith("tt") }

            if (showSubmitIntroModal && season != null && episode != null && !imdbId.isNullOrBlank()) {
                com.nuvio.app.features.player.skip.SubmitIntroDialog(
                    imdbId = imdbId,
                    season = season,
                    episode = episode,
                    currentTimeSec = (displayedPositionMs / 1000.0),
                    segmentType = submitIntroSegmentType,
                    onSegmentTypeChange = { submitIntroSegmentType = it },
                    startTimeStr = submitIntroStartTimeStr,
                    onStartTimeChange = { submitIntroStartTimeStr = it },
                    endTimeStr = submitIntroEndTimeStr,
                    onEndTimeChange = { submitIntroEndTimeStr = it },
                    onDismiss = { showSubmitIntroModal = false },
                    onSuccess = {
                        submitIntroStartTimeStr = "00:00"
                        submitIntroEndTimeStr = "00:00"
                        submitIntroSegmentType = "intro"
                        showSubmitIntroModal = false
                    }
                )
            }
        }
    }
}

private fun <T> findPreferredTrackIndex(
    tracks: List<T>,
    targets: List<String>,
    language: (T) -> String?,
): Int {
    if (targets.isEmpty()) return -1
    for (target in targets) {
        val matchIndex = tracks.indexOfFirst { track ->
            languageMatchesPreference(
                trackLanguage = language(track),
                targetLanguage = target,
            )
        }
        if (matchIndex >= 0) {
            return matchIndex
        }
    }
    return -1
}

private fun findPreferredSubtitleTrackIndex(
    tracks: List<SubtitleTrack>,
    targets: List<String>,
): Int {
    if (targets.isEmpty()) return -1

    for ((targetPosition, target) in targets.withIndex()) {
        val normalizedTarget = normalizeLanguageCode(target) ?: continue
        if (normalizedTarget == SubtitleLanguageOption.FORCED) {
            val forcedIndex = tracks.indexOfFirst { it.isForced }
            if (forcedIndex >= 0) return forcedIndex
            if (targetPosition == 0) return -1
            continue
        }

        val matchIndex = tracks.indexOfFirst { track ->
            languageMatchesPreference(
                trackLanguage = track.language,
                targetLanguage = normalizedTarget,
            )
        }
        if (matchIndex >= 0) return matchIndex
    }

    return -1
}
