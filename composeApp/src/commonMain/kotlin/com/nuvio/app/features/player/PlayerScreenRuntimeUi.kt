package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Audiotrack
import androidx.compose.material.icons.rounded.CastConnected
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Forward10
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Subtitles
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.cast.DlnaCastRepository
import com.nuvio.app.features.cast.DlnaCastRequest
import com.nuvio.app.features.cast.DlnaCastState
import com.nuvio.app.features.p2p.P2pStreamingState
import com.nuvio.app.features.p2p.formatP2pMegabytes
import com.nuvio.app.features.p2p.formatP2pSpeed
import com.nuvio.app.isIos
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun PlayerScreenRuntime.RenderPlayerRuntimeUi() {
    val runtime = this
    val isInPip = rememberIsInPictureInPicture()
    val displayedPositionMs = scrubbingPositionMs ?: playbackSnapshot.positionMs
    val isEpisode = activeSeasonNumber != null && activeEpisodeNumber != null
    val currentGestureFeedback = liveGestureFeedback ?: gestureFeedback
    val isP2pPlaybackActive = activeTorrentInfoHash != null
    val p2pConnecting = p2pStreamingState as? P2pStreamingState.Connecting
    val p2pStats = p2pStreamingState as? P2pStreamingState.Streaming
    val p2pPeerInfo = p2pStats?.let { stats ->
        org.jetbrains.compose.resources.stringResource(
            nuvio.composeapp.generated.resources.Res.string.player_torrent_peer_info,
            stats.seeds,
            stats.peers,
        )
    }
    val p2pDownloadSpeed = p2pStats?.let { formatP2pSpeed(it.downloadSpeed) }
    val p2pLoadingBytes = p2pStats?.let { maxOf(it.downloadedBytes, it.deliveredBytes) } ?: 0L
    val connectingPeerInfo = p2pConnecting?.let { state ->
        org.jetbrains.compose.resources.stringResource(
            nuvio.composeapp.generated.resources.Res.string.player_torrent_peer_info,
            state.seeds,
            state.peers,
        )
    }
    val p2pInitialLoadingMessage = when {
        !isP2pPlaybackActive || initialLoadCompleted -> null
        p2pConnecting != null -> {
            if (p2pSettingsUiState.hideTorrentStats) {
                p2pConnectingPhaseLabel(p2pConnecting.phase)
            } else {
                org.jetbrains.compose.resources.stringResource(
                    nuvio.composeapp.generated.resources.Res.string.player_torrent_connecting_status,
                    p2pConnectingPhaseLabel(p2pConnecting.phase),
                    connectingPeerInfo.orEmpty(),
                    formatP2pSpeed(p2pConnecting.downloadSpeed),
                )
            }
        }
        p2pStats != null -> {
            if (p2pSettingsUiState.hideTorrentStats) {
                null
            } else {
                org.jetbrains.compose.resources.stringResource(
                    nuvio.composeapp.generated.resources.Res.string.player_torrent_loading_status,
                    formatP2pMegabytes(p2pLoadingBytes),
                    p2pPeerInfo.orEmpty(),
                    p2pDownloadSpeed.orEmpty(),
                )
            }
        }
        else -> org.jetbrains.compose.resources.stringResource(
            nuvio.composeapp.generated.resources.Res.string.player_torrent_starting_engine,
        )
    }
    val bufferedAheadMs = (playbackSnapshot.bufferedPositionMs - playbackSnapshot.positionMs)
        .coerceAtLeast(0L)
    val p2pInitialLoadingProgress = when {
        !isP2pPlaybackActive || initialLoadCompleted || p2pStats == null -> null
        else -> p2pInitialLoadingProgress(
            bufferedAheadMs = bufferedAheadMs,
            downloadedBytes = p2pStats.downloadedBytes,
            deliveredBytes = p2pStats.deliveredBytes,
        )
    }
    val showP2pRebufferStats = isP2pPlaybackActive &&
        initialLoadCompleted &&
        playbackSnapshot.isLoading &&
        p2pStats != null &&
        !p2pSettingsUiState.hideTorrentStats
    val p2pRebufferMessage = when {
        !showP2pRebufferStats -> null
        else -> {
            val bufferedSeconds = ((playbackSnapshot.bufferedPositionMs - playbackSnapshot.positionMs) / 1000L)
                .coerceAtLeast(0L)
            "${bufferedSeconds}s buffered · ${p2pPeerInfo.orEmpty()} · ${p2pDownloadSpeed.orEmpty()}"
        }
    }
    val p2pRebufferProgress = when {
        !showP2pRebufferStats -> null
        else -> {
            val bufferedSeconds = ((playbackSnapshot.bufferedPositionMs - playbackSnapshot.positionMs) / 1000f)
                .coerceAtLeast(0f)
            (bufferedSeconds / 10f).coerceIn(0f, 1f)
        }
    }
    val gestureCallbacks = rememberSurfaceGestureCallbacks()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .onSizeChanged { layoutSize = it }
            .playerSurfaceTapGestures(
                layoutSize = layoutSize,
                playerControlsLockedState = gestureCallbacks.playerControlsLocked,
                onSurfaceTap = gestureCallbacks.onSurfaceTap,
                onSurfaceDoubleTap = gestureCallbacks.onSurfaceDoubleTap,
                activateHoldToSpeedState = gestureCallbacks.activateHoldToSpeed,
                deactivateHoldToSpeedState = gestureCallbacks.deactivateHoldToSpeed,
                revealLockedOverlayState = gestureCallbacks.revealLockedOverlay,
            )
            .playerSurfaceDragGestures(
                gestureController = gestureController,
                layoutSize = layoutSize,
                sideGestureSystemEdgeExclusionPx = sideGestureSystemEdgeExclusionPx,
                playerControlsLockedState = gestureCallbacks.playerControlsLocked,
                touchGesturesEnabledState = gestureCallbacks.touchGesturesEnabled,
                isHoldToSpeedGestureActiveState = gestureCallbacks.isHoldToSpeedGestureActive,
                currentPositionMsState = gestureCallbacks.currentPositionMs,
                currentDurationMsState = gestureCallbacks.currentDurationMs,
                deactivateHoldToSpeedState = gestureCallbacks.deactivateHoldToSpeed,
                showHorizontalSeekPreviewState = gestureCallbacks.showHorizontalSeekPreview,
                showBrightnessFeedbackState = gestureCallbacks.showBrightnessFeedback,
                showVolumeFeedbackState = gestureCallbacks.showVolumeFeedback,
                clearLiveGestureFeedbackState = gestureCallbacks.clearLiveGestureFeedback,
                revealLockedOverlayState = gestureCallbacks.revealLockedOverlay,
                commitHorizontalSeekState = gestureCallbacks.commitHorizontalSeek,
            ),
    ) {
        val playerSurfaceSourceUrl = if (isP2pPlaybackActive) p2pResolvedSourceUrl else activeSourceUrl
        val initialPositionRequestKey = currentInitialPositionRequestKey()
        if (playerSurfaceSourceUrl != null) {
            PlatformPlayerSurface(
                sourceUrl = playerSurfaceSourceUrl,
                sourceAudioUrl = activeSourceAudioUrl,
                sourceHeaders = activeSourceHeaders,
                sourceResponseHeaders = activeSourceResponseHeaders,
                externalSubtitles = externalSubtitles,
                streamType = activeStreamType,
                modifier = Modifier.fillMaxSize(),
                playWhenReady = shouldPlay,
                initialPositionMs = activeInitialPositionMs.takeIf { it > 0L },
                initialPositionRequestKey = initialPositionRequestKey,
                resizeMode = resizeMode,
                onInitialPositionHandled = { key, handled ->
                    if (key == currentInitialPositionRequestKey()) {
                        initialSeekApplied = handled
                    }
                },
                onControllerReady = { controller ->
                    playerController = controller
                    playerControllerSourceUrl = activeSourceUrl
                },
                onSnapshot = { snapshot ->
                    playbackSnapshot = snapshot
                    refreshAudioTracksIfChanged()
                    if (!snapshot.isLoading) initialLoadCompleted = true
                    if (snapshot.isEnded) {
                        shouldPlay = false
                        controlsVisible = !playerControlsLocked
                    }
                },
                onError = { message ->
                    if (message != null && tryRefreshCredentialedSourceAfterError(message)) {
                        return@PlatformPlayerSurface
                    }
                    errorMessage = message
                    if (message != null) {
                        controlsVisible = !playerControlsLocked
                        removeFailedStreamFromCache()
                    }
                },
            )
        }

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
                pauseDescription = activePauseDescription ?: activeStreamSubtitle,
                providerName = activeProviderName,
                metrics = metrics,
                horizontalSafePadding = horizontalSafePadding,
                modifier = Modifier.fillMaxSize(),
            )
        }

        // Casting overlay below modals so subtitle/audio sheets are usable (on top)
        RenderCastingOverlay()
        RenderPlayerControls(displayedPositionMs = displayedPositionMs, isEpisode = isEpisode)
        RenderPlaybackOverlays(
            runtime = runtime,
            displayedPositionMs = displayedPositionMs,
            currentGestureFeedback = currentGestureFeedback,
            p2pInitialLoadingMessage = p2pInitialLoadingMessage,
            p2pInitialLoadingProgress = p2pInitialLoadingProgress,
            showP2pRebufferStats = showP2pRebufferStats,
            p2pRebufferMessage = p2pRebufferMessage,
            p2pRebufferProgress = p2pRebufferProgress,
        )
        RenderPlayerModals(displayedPositionMs = displayedPositionMs)
    }
}

@Composable
private fun p2pConnectingPhaseLabel(phase: String): String = when (phase) {
    "add_magnet" -> org.jetbrains.compose.resources.stringResource(
        nuvio.composeapp.generated.resources.Res.string.player_torrent_fetching_metadata,
    )
    "prepare_stream", "attach_route" -> org.jetbrains.compose.resources.stringResource(
        nuvio.composeapp.generated.resources.Res.string.player_torrent_preparing_stream,
    )
    else -> org.jetbrains.compose.resources.stringResource(
        nuvio.composeapp.generated.resources.Res.string.player_torrent_starting_engine,
    )
}

private fun PlayerScreenRuntime.currentInitialPositionRequestKey(): String? {
    val positionMs = activeInitialPositionMs.takeIf { it > 0L } ?: return null
    return "$activePlaybackIdentity:${activeVideoId.orEmpty()}:$positionMs"
}

@Composable
private fun PlayerScreenRuntime.RenderPlayerControls(displayedPositionMs: Long, isEpisode: Boolean) {
    val isInPip = rememberIsInPictureInPicture()
    // Hide local controls when casting to TV - remote controls shown instead
    val dlnaState by DlnaCastRepository.state.collectAsState()
    val unifiedState by com.nuvio.app.features.cast.UnifiedCastRepository.state.collectAsState()
    val isCastingLocal = dlnaState is DlnaCastState.Casting || unifiedState is com.nuvio.app.features.cast.UnifiedCastState.Casting
    if (isCastingLocal) return
    AnimatedVisibility(
        visible = (controlsVisible || showParentalGuide) && !playerControlsLocked && !isInPip,
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
            showPlaybackControls = controlsVisible,
            onLockToggle = {
                if (playerControlsLocked) unlockPlayerControls() else lockPlayerControls()
            },
            onBack = {
                flushWatchProgress()
                args.onBack()
            },
            onTogglePlayback = { togglePlayback() },
            onSeekBack = { seekBy(-10_000L) },
            onSeekForward = { seekBy(10_000L) },
            onResizeModeClick = { cycleResizeMode() },
            onSpeedClick = { cyclePlaybackSpeed() },
            onSubtitleClick = {
                refreshTracks()
                showSubtitleModal = true
            },
            onAudioClick = {
                refreshTracks()
                showAudioModal = true
            },
            onVideoSettingsClick = if (isIos) {
                {
                    showVideoSettingsModal = true
                    controlsVisible = true
                }
            } else {
                null
            },
            onSourcesClick = if (activeVideoId != null) { { openSourcesPanel() } } else null,
            onEpisodesClick = if (isSeries) { { openEpisodesPanel() } } else null,
            onCastClick = { showCastSheet = true },
            onOpenInExternalPlayer = args.onOpenInExternalPlayer?.let { openExternal ->
                {
                    val loadedSubtitles = addonSubtitles
                        .takeIf { it.isNotEmpty() }
                        ?.map { sub ->
                            SubtitleInput(
                                url = sub.url,
                                name = buildString {
                                    if (!sub.addonName.isNullOrBlank()) append("[${sub.addonName}] ")
                                    append(sub.display)
                                },
                                lang = sub.language,
                            )
                        }
                    openExternal(
                        ExternalPlayerPlaybackRequest(
                            sourceUrl = activeSourceUrl,
                            title = title,
                            streamTitle = activeStreamTitle,
                            sourceHeaders = activeSourceHeaders,
                            resumePositionMs = playbackSnapshot.positionMs,
                            subtitles = loadedSubtitles,
                            season = activeSeasonNumber,
                            episode = activeEpisodeNumber,
                            episodeTitle = activeEpisodeTitle,
                        ),
                    )
                }
            },
            onSubmitIntroClick = if (
                isSeries &&
                playerSettingsUiState.introSubmitEnabled &&
                playerSettingsUiState.introDbApiKey.isNotBlank()
            ) {
                { showSubmitIntroModal = true }
            } else {
                null
            },
            parentalWarnings = parentalWarnings,
            showParentalGuide = showParentalGuide,
            onParentalGuideAnimationComplete = { showParentalGuide = false },
            onScrubChange = { positionMs ->
                isScrubbingTimeline = true
                scrubbingPositionMs = positionMs
            },
            onScrubFinished = { positionMs ->
                isScrubbingTimeline = false
                scrubbingPositionMs = null
                playerController?.seekTo(positionMs)
                scheduleProgressSyncAfterSeek()
            },
            horizontalSafePadding = horizontalSafePadding,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun BoxScope.RenderPlaybackOverlays(
    runtime: PlayerScreenRuntime,
    displayedPositionMs: Long,
    currentGestureFeedback: GestureFeedbackState?,
    p2pInitialLoadingMessage: String?,
    p2pInitialLoadingProgress: Float?,
    showP2pRebufferStats: Boolean,
    p2pRebufferMessage: String?,
    p2pRebufferProgress: Float?,
) {
    runtime.run {
        PlayerPlaybackOverlays(
            playerControlsLocked = playerControlsLocked,
            lockedOverlayVisible = lockedOverlayVisible,
            playbackSnapshot = playbackSnapshot,
        displayedPositionMs = displayedPositionMs,
        metrics = metrics,
        horizontalSafePadding = horizontalSafePadding,
        onUnlock = { unlockPlayerControls() },
        showOpeningOverlay = playerSettingsUiState.showLoadingOverlay && !initialLoadCompleted && errorMessage == null,
        backdropArtwork = background ?: poster,
        logo = logo,
        title = title,
        onBackWithProgress = {
            flushWatchProgress()
            args.onBack()
        },
        p2pInitialLoadingMessage = p2pInitialLoadingMessage,
        p2pInitialLoadingProgress = p2pInitialLoadingProgress,
        showP2pRebufferStats = showP2pRebufferStats,
        p2pRebufferMessage = p2pRebufferMessage,
        p2pRebufferProgress = p2pRebufferProgress,
        currentGestureFeedback = currentGestureFeedback,
        renderedGestureFeedback = renderedGestureFeedback,
        initialLoadCompleted = initialLoadCompleted,
        pausedOverlayVisible = pausedOverlayVisible,
        activeSkipInterval = activeSkipInterval,
        skipIntervalDismissed = skipIntervalDismissed,
        controlsVisible = controlsVisible,
        onSkipInterval = { interval ->
            val rawMs = (interval.endTime * 1000.0).toLong()
            val durationMs = playbackSnapshot.durationMs
            val seekMs = if (durationMs > 0L) rawMs.coerceAtMost(durationMs - 1) else rawMs
            playerController?.seekTo(seekMs)
            scheduleProgressSyncAfterSeek()
            skipIntervalDismissed = true
        },
        onDismissSkipInterval = { skipIntervalDismissed = true },
        sliderEdgePadding = sliderEdgePadding,
        overlayBottomPadding = overlayBottomPadding,
        isSeries = isSeries,
        nextEpisodeInfo = nextEpisodeInfo,
        showNextEpisodeCard = showNextEpisodeCard,
        nextEpisodeAutoPlaySearching = nextEpisodeAutoPlaySearching,
        nextEpisodeAutoPlaySourceName = nextEpisodeAutoPlaySourceName,
        nextEpisodeAutoPlayCountdown = nextEpisodeAutoPlayCountdown,
        blurUnwatchedEpisodes = metaScreenSettingsUiState.blurUnwatchedEpisodes,
        onPlayNextEpisode = {
            nextEpisodeAutoPlayJob?.cancel()
            playNextEpisode()
        },
        onDismissNextEpisode = {
            nextEpisodeAutoPlayJob?.cancel()
            nextEpisodeCardDismissed = true
            showNextEpisodeCard = false
            nextEpisodeAutoPlaySearching = false
            nextEpisodeAutoPlaySourceName = null
            nextEpisodeAutoPlayCountdown = null
        },
        errorMessage = errorMessage,
            onDismissError = {
                flushWatchProgress()
                args.onBack()
            },
        )
    }
}

@Composable
private fun PlayerScreenRuntime.RenderPlayerModals(displayedPositionMs: Long) {
    // DLNA Cast sheet - respects iOS note: on iOS it just shows error via repository
    if (showCastSheet) {
        val p2pUrl = p2pResolvedSourceUrl
        val effectiveUrl = if (activeTorrentInfoHash != null && p2pUrl != null) p2pUrl else activeSourceUrl
        val codecHint = activeStreamTitle + " " + (activeStreamSubtitle ?: "") + " " + (selectedAddonSubtitle?.url ?: "")
        // Subtitle for burn-in when transcode enabled
        val subUrl = if (useCustomSubtitles) selectedAddonSubtitle?.url else null
        val subHeaders = if (subUrl != null) {
            // Find headers for this subtitle from externalSubtitles or addon list
            (externalSubtitles.firstOrNull { it.url == subUrl }?.headers
                ?: addonSubtitles.firstOrNull { it.url == subUrl }?.let { emptyMap() } // addon subs have no headers
                ?: emptyMap())
        } else emptyMap()
        val castRequest = DlnaCastRequest(
            sourceUrl = effectiveUrl,
            sourceHeaders = activeSourceHeaders,
            title = title,
            subtitle = activeStreamSubtitle,
            mimeType = when {
                effectiveUrl.contains(".m3u8", ignoreCase = true) -> "application/x-mpegURL"
                effectiveUrl.contains(".mpd", ignoreCase = true) -> "application/dash+xml"
                effectiveUrl.endsWith(".mkv", ignoreCase = true) -> "video/x-matroska"
                else -> "video/mp4"
            },
            codecHint = codecHint,
            durationMs = playbackSnapshot.durationMs.takeIf { it > 0 },
            subtitleUrl = subUrl,
            subtitleHeaders = subHeaders,
            startPositionMs = playbackSnapshot.positionMs,
        )
        com.nuvio.app.features.cast.CastBottomSheet(
            isVisible = showCastSheet,
            castRequest = castRequest,
            onDismiss = { showCastSheet = false },
            onDeviceSelected = { /* handled inside sheet */ },
        )
    }
    PlayerScreenModalHosts(
        pendingP2pSwitch = pendingP2pSwitch,
        onPendingP2pSwitchChanged = { pendingP2pSwitch = it },
        onP2pEpisodeStreamSelected = { stream, episode, isAutoPlay ->
            switchToP2pEpisodeStream(stream, episode, isAutoPlay)
        },
        onP2pSourceStreamSelected = { stream -> switchToP2pSourceStream(stream) },
        onNextEpisodeAutoPlaySearchingChanged = { nextEpisodeAutoPlaySearching = it },
        onNextEpisodeAutoPlayCountdownChanged = { nextEpisodeAutoPlayCountdown = it },
        onNextEpisodeAutoPlaySourceNameChanged = { nextEpisodeAutoPlaySourceName = it },
        showAudioModal = showAudioModal,
        audioTracks = audioTracks,
        selectedAudioIndex = selectedAudioIndex,
        onAudioTrackSelected = { index ->
            selectedAudioIndex = index
            persistAudioPreference(audioTracks.firstOrNull { it.index == index })
            playerController?.selectAudioTrack(index)
            scope.launch {
                kotlinx.coroutines.delay(200)
                showAudioModal = false
            }
        },
        onAudioModalDismissed = { showAudioModal = false },
        showSubtitleModal = showSubtitleModal,
        subtitleTracks = subtitleTracks,
        selectedSubtitleIndex = selectedSubtitleIndex,
        addonSubtitles = visibleAddonSubtitles,
        selectedAddonSubtitleId = selectedAddonSubtitleId,
        isLoadingAddonSubtitles = isLoadingAddonSubtitles,
        subtitleStyle = subtitleStyle,
        subtitleDelayMs = subtitleDelayMs,
        selectedAddonSubtitle = selectedAddonSubtitle,
        subtitleAutoSyncState = subtitleAutoSyncState,
        onBuiltInSubtitleTrackSelected = { index ->
            val wasCustom = useCustomSubtitles
            isUserExplicitSubtitleSelection = true
            preferredSubtitleSelectionApplied = true
            selectedSubtitleIndex = index
            selectedAddonSubtitleId = null
            useCustomSubtitles = false
            persistInternalSubtitlePreference(subtitleTracks.firstOrNull { it.index == index })
            if (wasCustom) {
                playerController?.clearExternalSubtitleAndSelect(index)
            } else {
                playerController?.selectSubtitleTrack(index)
            }
        },
        onAddonSubtitleSelected = { addon ->
            isUserExplicitSubtitleSelection = true
            selectedAddonSubtitleId = addon.selectionKey
            selectedSubtitleIndex = -1
            useCustomSubtitles = true
            preferredSubtitleSelectionApplied = true
            persistAddonSubtitlePreference(addon)
            playerController?.setSubtitleUri(addon.url)
        },
        onFetchAddonSubtitles = { fetchAddonSubtitlesForActiveItem() },
        onSubtitleStyleChanged = PlayerSettingsRepository::setSubtitleStyle,
        onSubtitleDelayChanged = { delayMs -> setSubtitleDelay(delayMs) },
        onSubtitleDelayReset = { setSubtitleDelay(0) },
        onAutoSyncCapture = { captureSubtitleAutoSyncTime() },
        onAutoSyncCueSelected = { cue -> applySubtitleAutoSyncCue(cue) },
        onAutoSyncReload = { loadSubtitleAutoSyncCues(force = true) },
        onSubtitleModalDismissed = { showSubtitleModal = false },
        showVideoSettingsModal = showVideoSettingsModal,
        playerSettings = playerSettingsUiState,
        onVideoSettingsChanged = {
            playerController?.configureIosVideoOutput(PlayerSettingsRepository.uiState.value)
        },
        onVideoSettingsModalDismissed = { showVideoSettingsModal = false },
        showSourcesPanel = showSourcesPanel,
        sourceStreamsState = sourceStreamsState,
        contentTitle = title,
        activeEpisodeTitle = activeEpisodeTitle,
        activeSourceUrl = activeSourceUrl,
        activeStreamTitle = activeStreamTitle,
        onSourceFilterSelected = PlayerStreamsRepository::selectSourceFilter,
        onSourceStreamSelected = { stream -> switchToSource(stream) },
        onReloadSources = {
            val vid = activeVideoId
            if (vid != null) {
                PlayerStreamsRepository.loadSources(
                    type = contentType ?: parentMetaType,
                    videoId = vid,
                    season = activeSeasonNumber,
                    episode = activeEpisodeNumber,
                    forceRefresh = true,
                )
            }
        },
        onSourcesPanelDismissed = {
            showSourcesPanel = false
            controlsVisible = true
        },
        isSeries = isSeries,
        showEpisodesPanel = showEpisodesPanel,
        allEpisodes = playerMetaVideos,
        parentMetaType = parentMetaType,
        parentMetaId = parentMetaId,
        activeSeasonNumber = activeSeasonNumber,
        activeEpisodeNumber = activeEpisodeNumber,
        watchProgressByVideoId = watchProgressUiState.byVideoIdForContent(parentMetaId),
        watchedKeys = watchedUiState.watchedKeys,
        blurUnwatchedEpisodes = metaScreenSettingsUiState.blurUnwatchedEpisodes,
        episodeStreamsPanelState = episodeStreamsPanelState,
        episodeStreamsRepoState = episodeStreamsRepoState,
        onEpisodeSelectedForDownload = { episode ->
            selectDownloadedEpisodeForPlayback(
                parentMetaId = parentMetaId,
                episode = episode,
                onDownloadedEpisodeSelected = { item, video -> switchToDownloadedEpisode(item, video) },
            )
        },
        onEpisodeStreamsRequested = { episode ->
            PlayerStreamsRepository.loadEpisodeStreams(
                type = contentType ?: parentMetaType,
                videoId = episode.id,
                season = episode.season,
                episode = episode.episode,
            )
            episodeStreamsPanelState = EpisodeStreamsPanelState(showStreams = true, selectedEpisode = episode)
        },
        onEpisodeStreamFilterSelected = PlayerStreamsRepository::selectEpisodeStreamsFilter,
        onEpisodeStreamSelected = { stream, episode -> switchToEpisodeStream(stream, episode) },
        onBackToEpisodes = {
            episodeStreamsPanelState = EpisodeStreamsPanelState()
            PlayerStreamsRepository.clearEpisodeStreams()
        },
        onReloadEpisodeStreams = {
            val episode = episodeStreamsPanelState.selectedEpisode
            if (episode != null) {
                PlayerStreamsRepository.loadEpisodeStreams(
                    type = contentType ?: parentMetaType,
                    videoId = episode.id,
                    season = episode.season,
                    episode = episode.episode,
                    forceRefresh = true,
                )
            }
        },
        onEpisodesPanelDismissed = {
            showEpisodesPanel = false
            episodeStreamsPanelState = EpisodeStreamsPanelState()
            PlayerStreamsRepository.clearEpisodeStreams()
            controlsVisible = true
        },
        showSubmitIntroModal = showSubmitIntroModal,
        activeVideoId = activeVideoId,
        metaUiState = metaUiState,
        displayedPositionMs = displayedPositionMs,
        submitIntroSegmentType = submitIntroSegmentType,
        onSubmitIntroSegmentTypeChanged = { submitIntroSegmentType = it },
        submitIntroStartTimeStr = submitIntroStartTimeStr,
        onSubmitIntroStartTimeChanged = { submitIntroStartTimeStr = it },
        submitIntroEndTimeStr = submitIntroEndTimeStr,
        onSubmitIntroEndTimeChanged = { submitIntroEndTimeStr = it },
        onSubmitIntroDismissed = { showSubmitIntroModal = false },
        onSubmitIntroSuccess = {
            submitIntroStartTimeStr = "00:00"
            submitIntroEndTimeStr = "00:00"
            submitIntroSegmentType = "intro"
            showSubmitIntroModal = false
        },
    )
}

@Composable
private fun PlayerScreenRuntime.RenderCastingOverlay() {
    val dlnaState by DlnaCastRepository.state.collectAsState()
    val unifiedState by com.nuvio.app.features.cast.UnifiedCastRepository.state.collectAsState()
    val isDlnaCasting = dlnaState is DlnaCastState.Casting
    val isUnifiedCasting = unifiedState is com.nuvio.app.features.cast.UnifiedCastState.Casting
    val isCasting = isDlnaCasting || isUnifiedCasting
    // Pause local playback when casting starts
    LaunchedEffect(isCasting) {
        if (isCasting) {
            shouldPlay = false
            playerController?.pause()
            controlsVisible = true
        }
    }
    if (!isCasting) return
    // Prefer unified device name, fallback to DLNA
    val castingName = when {
        isUnifiedCasting -> (unifiedState as com.nuvio.app.features.cast.UnifiedCastState.Casting).device.name
        else -> (dlnaState as DlnaCastState.Casting).device.friendlyName
    }
    val castingProxy = when {
        isUnifiedCasting -> (unifiedState as com.nuvio.app.features.cast.UnifiedCastState.Casting).proxyUrl
        else -> (dlnaState as DlnaCastState.Casting).proxyUrl
    }
    val castingProtocol = when {
        isUnifiedCasting -> (unifiedState as com.nuvio.app.features.cast.UnifiedCastState.Casting).device.protocol.name
        else -> "DLNA"
    }
    var remotePosMs by remember { mutableStateOf(0L) }
    var remoteDurationMs by remember { mutableStateOf(playbackSnapshot.durationMs) }
    var isRemotePaused by remember { mutableStateOf(false) }
    var isScrubbingRemote by remember { mutableStateOf(false) }
    var scrubRemoteMs by remember { mutableStateOf<Long?>(null) }

    // Poll position from TV every 1s for progress sync (DLNA or Chromecast)
    val pollingDeviceId = if (isUnifiedCasting) (unifiedState as com.nuvio.app.features.cast.UnifiedCastState.Casting).device.id else (dlnaState as DlnaCastState.Casting).device.id
    LaunchedEffect(pollingDeviceId) {
        while (isCasting) {
            try {
                val pos = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    if (isUnifiedCasting) com.nuvio.app.features.cast.UnifiedCastRepository.getPosition()
                    else DlnaCastRepository.getRemotePosition()
                }
                if (pos != null) {
                    remotePosMs = pos
                }
            } catch (_: Exception) {}
            delay(1000)
        }
    }

    val displayPos = scrubRemoteMs ?: remotePosMs
    val duration = remoteDurationMs.coerceAtLeast(1L)

    androidx.compose.animation.AnimatedVisibility(
        visible = true,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.72f))
                .padding(horizontal = horizontalSafePadding + metrics.horizontalPadding, vertical = metrics.verticalPadding),
        ) {
            // Top bar
            Row(
                modifier = Modifier.align(Alignment.TopStart).fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(modifier = Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.CastConnected, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                    Column {
                        Text("$castingProtocol • Playing on TV", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
                        Text(castingName, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = Color.White)
                    }
                }
                IconButton(onClick = {
                    if (isUnifiedCasting) com.nuvio.app.features.cast.UnifiedCastRepository.stop() else DlnaCastRepository.stopCasting()
                    shouldPlay = true
                    playerController?.play()
                }) {
                    Icon(Icons.Rounded.Close, contentDescription = "Stop casting", tint = Color.White)
                }
            }

            // Center controls
            Column(
                modifier = Modifier.align(Alignment.Center).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Text(title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), color = Color.White, maxLines = 2)
                if (activeEpisodeTitle != null) {
                    Text("S${activeSeasonNumber}E${activeEpisodeNumber} • $activeEpisodeTitle", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = {
                        val target = (displayPos - 10_000).coerceAtLeast(0)
                        if (isUnifiedCasting) com.nuvio.app.features.cast.UnifiedCastRepository.seek(target) else DlnaCastRepository.seekCasting(target)
                    }) {
                        Icon(Icons.Rounded.Replay10, contentDescription = "Rewind 10s", tint = Color.White, modifier = Modifier.size(32.dp))
                    }
                    Box(modifier = Modifier.size(64.dp).clip(CircleShape).background(Color.White).padding(10.dp).then(Modifier), contentAlignment = Alignment.Center) {
                        IconButton(onClick = {
                            if (isRemotePaused) {
                                if (isUnifiedCasting) com.nuvio.app.features.cast.UnifiedCastRepository.resume() else DlnaCastRepository.resumeCasting()
                                isRemotePaused = false
                            } else {
                                if (isUnifiedCasting) com.nuvio.app.features.cast.UnifiedCastRepository.pause() else DlnaCastRepository.pauseCasting()
                                isRemotePaused = true
                            }
                        }) {
                            Icon(
                                imageVector = if (isRemotePaused) Icons.Rounded.PlayArrow else Icons.Rounded.Pause,
                                contentDescription = if (isRemotePaused) "Resume" else "Pause",
                                tint = Color.Black,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                    IconButton(onClick = {
                        val target = displayPos + 10_000
                        if (isUnifiedCasting) com.nuvio.app.features.cast.UnifiedCastRepository.seek(target) else DlnaCastRepository.seekCasting(target)
                    }) {
                        Icon(Icons.Rounded.Forward10, contentDescription = "Forward 10s", tint = Color.White, modifier = Modifier.size(32.dp))
                    }
                }
                // Slider
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Slider(
                        value = displayPos.toFloat(),
                        onValueChange = {
                            isScrubbingRemote = true
                            scrubRemoteMs = it.toLong()
                        },
                        onValueChangeFinished = {
                            val target = scrubRemoteMs ?: displayPos
                            isScrubbingRemote = false
                            scrubRemoteMs = null
                            if (isUnifiedCasting) com.nuvio.app.features.cast.UnifiedCastRepository.seek(target) else DlnaCastRepository.seekCasting(target)
                            remotePosMs = target
                        },
                        valueRange = 0f..duration.toFloat(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(formatPlaybackTime(displayPos), style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f))
                        Text(formatPlaybackTime(duration), style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f))
                    }
                }
                // Subtitle / Audio actions - now with icons and working above overlay (modals on top)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Subtitles - with icon
                    androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        IconButton(
                            onClick = {
                                // Ensure tracks are fresh before opening
                                refreshTracks()
                                showSubtitleModal = true
                            },
                            modifier = Modifier.size(48.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.15f))
                        ) {
                            Icon(Icons.Rounded.Subtitles, contentDescription = "Subtitles", tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (useCustomSubtitles) selectedAddonSubtitle?.language?.uppercase() ?: "On" else "Off",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.8f),
                            maxLines = 1
                        )
                    }
                    // Audio - with icon, opens audio track picker
                    androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        IconButton(
                            onClick = {
                                refreshTracks()
                                showAudioModal = true
                            },
                            modifier = Modifier.size(48.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.15f))
                        ) {
                            Icon(Icons.Rounded.Audiotrack, contentDescription = "Audio", tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = audioTracks.firstOrNull { it.index == selectedAudioIndex }?.label?.take(8) ?: "Audio",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.8f),
                            maxLines = 1
                        )
                    }
                    Spacer(modifier = Modifier.size(8.dp))
                    // Stop
                    IconButton(
                        onClick = {
                            if (isUnifiedCasting) com.nuvio.app.features.cast.UnifiedCastRepository.stop() else DlnaCastRepository.stopCasting()
                            shouldPlay = true; playerController?.play()
                        },
                        modifier = Modifier.size(48.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.15f))
                    ) {
                        Icon(Icons.Rounded.Stop, contentDescription = "Stop", tint = Color.White, modifier = Modifier.size(22.dp))
                    }
                }
                Text("$castingProtocol • Proxy: ${castingProxy.take(55)}...", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.5f))
            }
        }
    }
}
