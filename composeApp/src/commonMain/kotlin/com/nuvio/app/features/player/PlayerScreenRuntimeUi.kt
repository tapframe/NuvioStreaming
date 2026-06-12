package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.p2p.P2pSettingsRepository
import com.nuvio.app.features.p2p.P2pStreamingState
import com.nuvio.app.features.p2p.formatP2pMegabytes
import com.nuvio.app.features.p2p.formatP2pSpeed
import com.nuvio.app.features.player.skip.SkipIntroRepository
import com.nuvio.app.features.streams.AddonStreamGroup
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.isSelectableForPlayback
import com.nuvio.app.features.watchprogress.buildPlaybackVideoId
import com.nuvio.app.features.watching.application.WatchingState
import com.nuvio.app.isDesktop
import com.nuvio.app.isIos
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

private val EmptyPlayerControlsState = PlayerControlsState()
private val IgnorePlayerControlsAction: (PlayerControlsAction) -> Boolean = { false }
private val IgnorePlayerControlsEvent: (String, Double) -> Boolean = { _, _ -> false }
private val IgnorePlayerControlsScrub: (Long) -> Boolean = { false }

@Composable
internal fun PlayerScreenRuntime.RenderPlayerRuntimeUi() {
    val runtime = this
    val displayedPositionMs = scrubbingPositionMs ?: playbackSnapshot.positionMs
    val seasonNumber = activeSeasonNumber
    val episodeNumber = activeEpisodeNumber
    val episodeTitle = activeEpisodeTitle
    val isEpisode = seasonNumber != null && episodeNumber != null
    val currentGestureFeedback = liveGestureFeedback ?: gestureFeedback
    val isP2pPlaybackActive = activeTorrentInfoHash != null
    val p2pStats = p2pStreamingState as? P2pStreamingState.Streaming
    val p2pPeerInfo = p2pStats?.let { stats ->
        org.jetbrains.compose.resources.stringResource(
            nuvio.composeapp.generated.resources.Res.string.player_torrent_peer_info,
            stats.seeds,
            stats.peers,
        )
    }
    val p2pDownloadSpeed = p2pStats?.let { formatP2pSpeed(it.downloadSpeed) }
    val p2pInitialLoadingMessage = when {
        !isP2pPlaybackActive || initialLoadCompleted -> null
        p2pStreamingState is P2pStreamingState.Connecting -> {
            org.jetbrains.compose.resources.stringResource(
                nuvio.composeapp.generated.resources.Res.string.player_torrent_connecting_peers,
            )
        }
        p2pStats != null -> {
            if (p2pSettingsUiState.hideTorrentStats) {
                null
            } else {
                org.jetbrains.compose.resources.stringResource(
                    nuvio.composeapp.generated.resources.Res.string.player_torrent_buffered_status,
                    formatP2pMegabytes(p2pStats.preloadedBytes),
                    p2pPeerInfo.orEmpty(),
                    p2pDownloadSpeed.orEmpty(),
                )
            }
        }
        else -> org.jetbrains.compose.resources.stringResource(
            nuvio.composeapp.generated.resources.Res.string.player_torrent_starting_engine,
        )
    }
    val p2pInitialLoadingProgress = when {
        !isP2pPlaybackActive || initialLoadCompleted || p2pStats == null -> null
        else -> (p2pStats.preloadedBytes.toFloat() / P2pInitialPreloadTargetBytes.toFloat()).coerceIn(0f, 1f)
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
    val playerSurfaceSourceUrl = if (isP2pPlaybackActive) p2pResolvedSourceUrl else activeSourceUrl
    val openingOverlayWanted = playerSettingsUiState.showLoadingOverlay &&
        !initialLoadCompleted &&
        errorMessage == null
    val playerControlsState = if (isDesktop) {
        val episodeText = if (seasonNumber != null && episodeNumber != null && !episodeTitle.isNullOrBlank()) {
            stringResource(
                Res.string.compose_player_episode_title_format,
                seasonNumber,
                episodeNumber,
                episodeTitle.orEmpty(),
            )
        } else {
            ""
        }
        val allFilterLabel = stringResource(Res.string.collections_tab_all)
        val playingLabel = stringResource(Res.string.compose_player_playing)
        val sourceFilters = buildPlayerControlFilters(
            allLabel = allFilterLabel,
            selectedFilter = null,
        )
        val sourceItems = buildPlayerControlSourceItems()
        val episodeItems = buildPlayerControlEpisodeItems()
        val episodeSeasons = buildPlayerControlSeasonItems(episodeItems)
        val episodeStreamFilters = buildPlayerControlEpisodeStreamFilters(
            allLabel = allFilterLabel,
            selectedFilter = null,
        )
        val episodeStreamItems = buildPlayerControlEpisodeStreamItems()
        val playerControlAddonSubtitles = buildPlayerControlAddonSubtitleItems()
        val playerControlAutoSyncCues = buildPlayerControlSubtitleCueItems()
        val themeColors = MaterialTheme.nuvio.colors
        val selectedEpisodeLabel = episodeStreamsPanelState.selectedEpisode?.let { selected ->
            val selectedCode = selected.playerControlsEpisodeCode()
            buildString {
                append(selectedCode)
                if (selected.title.isNotBlank()) {
                    if (isNotEmpty()) append(" • ")
                    append(selected.title)
                }
            }
        }.orEmpty()
        val nativeSkipInterval = activeSkipInterval.takeIf { initialLoadCompleted && !pausedOverlayVisible }
        val nextEpisodeForControls = nextEpisodeInfo.takeIf { isSeries && showNextEpisodeCard }
        val nextEpisodeStatus = when {
            nextEpisodeForControls == null -> ""
            !nextEpisodeForControls.hasAired && !nextEpisodeForControls.unairedMessage.isNullOrBlank() ->
                nextEpisodeForControls.unairedMessage.orEmpty()
            nextEpisodeAutoPlaySearching -> stringResource(Res.string.player_next_episode_finding_source)
            !nextEpisodeAutoPlaySourceName.isNullOrBlank() && nextEpisodeAutoPlayCountdown != null ->
                stringResource(
                    Res.string.player_next_episode_playing_via_countdown,
                    nextEpisodeAutoPlaySourceName.orEmpty(),
                    nextEpisodeAutoPlayCountdown ?: 0,
                )
            else -> ""
        }
        PlayerControlsState(
            title = title,
            episodeText = episodeText,
            streamTitle = activeStreamTitle,
            providerName = activeProviderName,
            pauseOverlayWatchingLabel = stringResource(Res.string.compose_player_youre_watching),
            pauseOverlayLogo = logo,
            pauseOverlayEpisodeInfo = if (seasonNumber != null && episodeNumber != null) {
                stringResource(Res.string.compose_player_episode_code_full, seasonNumber, episodeNumber)
            } else {
                activeProviderName
            },
            pauseOverlayEpisodeTitle = activeEpisodeTitle.orEmpty(),
            pauseOverlayDescription = (pauseDescription ?: activeStreamSubtitle).orEmpty(),
            resizeModeLabel = stringResource(resizeMode.labelRes),
            playbackSpeedLabel = formatPlaybackSpeedLabel(playbackSnapshot.playbackSpeed),
            subtitlesLabel = stringResource(Res.string.compose_player_subs),
            audioLabel = stringResource(Res.string.compose_player_audio),
            sourcesLabel = stringResource(Res.string.compose_player_sources),
            episodesLabel = stringResource(Res.string.compose_player_episodes),
            externalPlayerLabel = stringResource(Res.string.streams_open_external_player),
            playLabel = stringResource(Res.string.detail_btn_play),
            pauseLabel = stringResource(Res.string.compose_action_pause),
            closeLabel = stringResource(Res.string.compose_player_close),
            lockLabel = stringResource(Res.string.compose_player_lock_controls),
            unlockLabel = stringResource(Res.string.compose_player_unlock_controls),
            submitIntroLabel = stringResource(Res.string.submit_intro_action),
            videoSettingsLabel = stringResource(Res.string.player_action_video_settings),
            tapToUnlockLabel = stringResource(Res.string.compose_player_tap_to_unlock),
            playbackErrorTitle = stringResource(Res.string.compose_player_playback_error),
            playbackErrorMessage = errorMessage.orEmpty(),
            playbackErrorActionLabel = stringResource(Res.string.compose_player_go_back),
            sourcesPanelTitle = stringResource(Res.string.compose_player_panel_sources),
            episodesPanelTitle = stringResource(Res.string.compose_player_panel_episodes),
            streamsPanelTitle = stringResource(Res.string.compose_player_panel_streams),
            allFilterLabel = allFilterLabel,
            reloadLabel = stringResource(Res.string.compose_action_reload),
            backLabel = stringResource(Res.string.action_back),
            panelCloseLabel = stringResource(Res.string.action_close),
            cancelLabel = stringResource(Res.string.action_cancel),
            playingLabel = playingLabel,
            noStreamsLabel = stringResource(Res.string.compose_player_no_streams_found),
            noEpisodesLabel = stringResource(Res.string.compose_player_no_episodes_available),
            submitIntroPanelTitle = stringResource(Res.string.submit_intro_title),
            submitIntroSegmentTypeLabel = stringResource(Res.string.submit_intro_segment_type_label),
            submitIntroSegmentIntroLabel = stringResource(Res.string.submit_intro_segment_intro),
            submitIntroSegmentRecapLabel = stringResource(Res.string.submit_intro_segment_recap),
            submitIntroSegmentOutroLabel = stringResource(Res.string.submit_intro_segment_outro),
            submitIntroStartTimeLabel = stringResource(Res.string.submit_intro_start_time_label),
            submitIntroEndTimeLabel = stringResource(Res.string.submit_intro_end_time_label),
            submitIntroCaptureLabel = stringResource(Res.string.submit_intro_capture_button),
            submitIntroSubmitLabel = stringResource(Res.string.submit_intro_button_submit),
            p2pConsentTitle = stringResource(Res.string.p2p_consent_title),
            p2pConsentBody = stringResource(Res.string.p2p_consent_body),
            p2pConsentEnableLabel = stringResource(Res.string.p2p_consent_enable),
            p2pConsentCancelLabel = stringResource(Res.string.p2p_consent_cancel),
            subtitlesPanelTitle = stringResource(Res.string.compose_player_subtitles),
            subtitleBuiltInTabLabel = stringResource(Res.string.compose_player_built_in),
            subtitleAddonsTabLabel = stringResource(Res.string.addon_title),
            subtitleStyleTabLabel = stringResource(Res.string.compose_player_style),
            noneLabel = stringResource(Res.string.compose_player_none),
            fetchSubtitlesLabel = stringResource(Res.string.compose_player_fetch_subtitles),
            subtitleDelayLabel = stringResource(Res.string.compose_player_subtitle_delay),
            resetLabel = stringResource(Res.string.compose_player_reset),
            autoSyncLabel = stringResource(Res.string.compose_player_auto_sync),
            reloadSmallLabel = stringResource(Res.string.compose_player_reload),
            captureLineLabel = stringResource(Res.string.compose_player_capture_line),
            selectAddonSubtitleFirstLabel = stringResource(Res.string.compose_player_select_addon_subtitle_first),
            loadingSubtitleLinesLabel = stringResource(Res.string.compose_player_loading_lines),
            fontSizeLabel = stringResource(Res.string.compose_player_font_size),
            outlineLabel = stringResource(Res.string.compose_player_outline),
            boldLabel = stringResource(Res.string.compose_player_bold),
            bottomOffsetLabel = stringResource(Res.string.compose_player_bottom_offset),
            colorLabel = stringResource(Res.string.compose_player_color),
            textOpacityLabel = stringResource(Res.string.compose_player_text_opacity),
            outlineColorLabel = stringResource(Res.string.compose_player_outline_color),
            resetDefaultsLabel = stringResource(Res.string.compose_player_reset_defaults),
            onLabel = stringResource(Res.string.compose_action_on),
            offLabel = stringResource(Res.string.compose_action_off),
            themeAccentColor = themeColors.accent.toCssColorString(),
            themeAccentStrongColor = themeColors.accentStrong.toCssColorString(),
            themeOnAccentColor = themeColors.onAccent.toCssColorString(),
            themeFocusColor = themeColors.focusRing.toCssColorString(),
            themeSelectedSurfaceColor = themeColors.accent.copy(alpha = 0.24f).toCssColorString(),
            themeSelectedSurfaceHoverColor = themeColors.accent.copy(alpha = 0.34f).toCssColorString(),
            themeSelectedRingColor = themeColors.accent.copy(alpha = 0.35f).toCssColorString(),
            themeTimelineFillColor = themeColors.playerTimelineFill.toCssColorString(),
            themeTimelineTrackColor = themeColors.playerTimelineTrack.toCssColorString(),
            themeBufferingColor = themeColors.playerBuffering.toCssColorString(),
            themeBufferingTrackColor = themeColors.playerBuffering.copy(alpha = 0.28f).toCssColorString(),
            themeControlForegroundColor = themeColors.playerControlsForeground.toCssColorString(),
            isPlaying = playbackSnapshot.isPlaying,
            isLoading = playbackSnapshot.isLoading,
            isLocked = playerControlsLocked,
            lockedOverlayVisible = lockedOverlayVisible,
            controlsVisible = controlsVisible && !playerControlsLocked,
            parentalWarnings = parentalWarnings,
            showParentalGuide = showParentalGuide,
            showSubmitIntro = isSeries &&
                playerSettingsUiState.introSubmitEnabled &&
                playerSettingsUiState.introDbApiKey.isNotBlank() &&
                !activeSubmitIntroImdbId().isNullOrBlank(),
            showVideoSettings = isIos,
            showSources = activeVideoId != null,
            showEpisodes = isSeries,
            showExternalPlayer = args.onOpenInExternalPlayer != null,
            durationMs = playbackSnapshot.durationMs,
            positionMs = displayedPositionMs,
            sourceIsLoading = sourceStreamsState.isAnyLoading,
            sourceFilters = sourceFilters,
            sourceItems = sourceItems,
            episodeItems = episodeItems,
            episodeSeasons = episodeSeasons,
            episodeStreamsVisible = episodeStreamsPanelState.showStreams,
            episodeStreamsIsLoading = episodeStreamsRepoState.isAnyLoading,
            selectedEpisodeLabel = selectedEpisodeLabel,
            episodeStreamFilters = episodeStreamFilters,
            episodeStreamItems = episodeStreamItems,
            submitIntroSegmentType = submitIntroSegmentType,
            submitIntroStartTime = submitIntroStartTimeStr,
            submitIntroEndTime = submitIntroEndTimeStr,
            isSubmitIntroSubmitting = isSubmitIntroSubmitting,
            submitIntroStatusMessage = submitIntroStatusMessage.orEmpty(),
            showP2pConsent = playerControlsPendingP2pSwitch != null,
            subtitleActiveTab = activeSubtitleTab.name,
            addonSubtitleItems = playerControlAddonSubtitles,
            isLoadingAddonSubtitles = isLoadingAddonSubtitles,
            selectedAddonSubtitleId = selectedAddonSubtitleId.orEmpty(),
            useCustomSubtitles = useCustomSubtitles,
            subtitleStyle = subtitleStyle,
            subtitleDelayMs = subtitleDelayMs,
            hasSelectedAddonSubtitle = selectedAddonSubtitle != null,
            subtitleAutoSyncCapturedPositionMs = subtitleAutoSyncState.capturedPositionMs ?: -1L,
            subtitleAutoSyncCues = playerControlAutoSyncCues,
            subtitleAutoSyncIsLoading = subtitleAutoSyncState.isLoading,
            subtitleAutoSyncErrorMessage = subtitleAutoSyncState.errorMessage.orEmpty(),
            closeModalsToken = playerControlsCloseModalsToken,
            showOpeningOverlay = openingOverlayWanted,
            openingArtwork = background ?: poster,
            openingLogo = logo,
            openingTitle = title,
            openingMessage = p2pInitialLoadingMessage,
            openingProgress = p2pInitialLoadingProgress,
            skipPromptVisible = nativeSkipInterval != null && !playerControlsLocked,
            skipPromptLabel = skipPromptLabel(nativeSkipInterval?.type),
            skipPromptStartMs = ((nativeSkipInterval?.startTime ?: 0.0) * 1000).toLong().coerceAtLeast(0L),
            skipPromptEndMs = ((nativeSkipInterval?.endTime ?: 0.0) * 1000).toLong().coerceAtLeast(0L),
            skipPromptDismissed = skipIntervalDismissed,
            nextEpisodeVisible = nextEpisodeForControls != null && !playerControlsLocked,
            nextEpisodeHeaderLabel = stringResource(Res.string.player_next_episode),
            nextEpisodeTitle = nextEpisodeForControls?.let {
                stringResource(
                    Res.string.compose_player_episode_title_format,
                    it.season,
                    it.episode,
                    it.title,
                )
            }.orEmpty(),
            nextEpisodeThumbnail = nextEpisodeForControls?.thumbnail.orEmpty(),
            nextEpisodeStatus = nextEpisodeStatus,
            nextEpisodeActionLabel = if (nextEpisodeForControls?.hasAired == true) {
                stringResource(Res.string.detail_btn_play)
            } else {
                stringResource(Res.string.player_next_episode_unaired)
            },
            nextEpisodePlayable = nextEpisodeForControls?.hasAired == true,
        )
    } else {
        EmptyPlayerControlsState
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
                playerController = playerController,
                layoutSize = layoutSize,
                sideGestureSystemEdgeExclusionPx = sideGestureSystemEdgeExclusionPx,
                playerControlsLockedState = gestureCallbacks.playerControlsLocked,
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
        if (playerSurfaceSourceUrl != null) {
            PlatformPlayerSurface(
                sourceUrl = playerSurfaceSourceUrl,
                sourceAudioUrl = activeSourceAudioUrl,
                sourceHeaders = activeSourceHeaders,
                sourceResponseHeaders = activeSourceResponseHeaders,
                modifier = Modifier.fillMaxSize(),
                playWhenReady = shouldPlay,
                resizeMode = resizeMode,
                initialPositionMs = activeInitialPositionMs.takeIf { isDesktop } ?: 0L,
                playerControlsState = playerControlsState,
                onPlayerControlsAction = if (isDesktop) {
                    { action -> handlePlayerControlsAction(action) }
                } else {
                    IgnorePlayerControlsAction
                },
                onPlayerControlsEvent = if (isDesktop) {
                    { type, value -> handlePlayerControlsEvent(type, value) }
                } else {
                    IgnorePlayerControlsEvent
                },
                onPlayerControlsScrubChange = if (isDesktop) {
                    { positionMs ->
                        handlePlayerControlsScrubChange(positionMs)
                        true
                    }
                } else {
                    IgnorePlayerControlsScrub
                },
                onPlayerControlsScrubFinished = if (isDesktop) {
                    { positionMs ->
                        handlePlayerControlsScrubFinished(positionMs)
                        true
                    }
                } else {
                    IgnorePlayerControlsScrub
                },
                onControllerReady = { controller ->
                    playerController = controller
                    playerControllerSourceUrl = activeSourceUrl
                },
                onSnapshot = { snapshot ->
                    playbackSnapshot = snapshot
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
                pauseDescription = pauseDescription ?: activeStreamSubtitle,
                providerName = activeProviderName,
                metrics = metrics,
                horizontalSafePadding = horizontalSafePadding,
                modifier = Modifier.fillMaxSize(),
            )
        }

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
            suppressOpeningOverlay = isDesktop && playerSurfaceSourceUrl != null,
        )
        RenderPlayerModals(displayedPositionMs = displayedPositionMs)
    }
}

@Composable
private fun PlayerScreenRuntime.RenderPlayerControls(displayedPositionMs: Long, isEpisode: Boolean) {
    AnimatedVisibility(
        visible = (controlsVisible || showParentalGuide) && !playerControlsLocked,
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

private fun PlayerScreenRuntime.handlePlayerControlsAction(action: PlayerControlsAction): Boolean {
    when (action) {
        PlayerControlsAction.ToggleChrome -> {
            if (playerControlsLocked) {
                revealLockedOverlay()
            } else {
                controlsVisible = !controlsVisible
            }
        }
        PlayerControlsAction.RevealLockedOverlay -> revealLockedOverlay()
        PlayerControlsAction.Back -> {
            flushWatchProgress()
            args.onBack()
        }
        PlayerControlsAction.TogglePlayback -> {
            prepareTogglePlaybackForNativeFallback()
            return false
        }
        PlayerControlsAction.KeyboardTogglePlayback -> {
            prepareTogglePlaybackForNativeFallback(revealControls = false)
            return false
        }
        PlayerControlsAction.SeekBack -> {
            prepareSeekByForNativeFallback(-10_000L)
            return false
        }
        PlayerControlsAction.KeyboardSeekBack -> {
            prepareSeekByForNativeFallback(-10_000L, revealControls = false)
            return false
        }
        PlayerControlsAction.SeekForward -> {
            prepareSeekByForNativeFallback(10_000L)
            return false
        }
        PlayerControlsAction.KeyboardSeekForward -> {
            prepareSeekByForNativeFallback(10_000L, revealControls = false)
            return false
        }
        PlayerControlsAction.ResizeMode -> cycleResizeMode()
        PlayerControlsAction.Speed -> cyclePlaybackSpeed()
        PlayerControlsAction.Subtitles -> {
            refreshTracks()
            showSubtitleModal = true
        }
        PlayerControlsAction.Audio -> {
            refreshTracks()
            showAudioModal = true
        }
        PlayerControlsAction.Sources -> {
            prepareSourcesForPlayerControls()
        }
        PlayerControlsAction.Episodes -> {
            prepareEpisodesForPlayerControls()
        }
        PlayerControlsAction.OpenExternalPlayer -> openInExternalPlayer()
        PlayerControlsAction.SubmitIntro -> {
            submitIntroStatusMessage = null
        }
        PlayerControlsAction.LockToggle -> {
            if (playerControlsLocked) unlockPlayerControls() else lockPlayerControls()
        }
        PlayerControlsAction.VideoSettings -> {
            if (isIos) {
                showVideoSettingsModal = true
                controlsVisible = true
            }
        }
        PlayerControlsAction.DoubleTapSeekBack -> {
            prepareDoubleTapSeekForNativeFallback(PlayerSeekDirection.Backward)
            return false
        }
        PlayerControlsAction.DoubleTapSeekForward -> {
            prepareDoubleTapSeekForNativeFallback(PlayerSeekDirection.Forward)
            return false
        }
    }
    return true
}

private fun PlayerScreenRuntime.handlePlayerControlsEvent(type: String, value: Double): Boolean {
    when (type) {
        "hideChrome" -> {
            controlsVisible = false
        }
        "reloadSources" -> {
            prepareSourcesForPlayerControls(forceRefresh = true)
        }
        "selectSource" -> {
            val streams = sourceStreamsState.groups.flatMap { it.streams }
            val stream = streams.getOrNull(value.toInt()) ?: return true
            if (requestP2pConsentForPlayerControls(stream = stream, episode = null)) return true
            switchToSource(stream)
            playerControlsCloseModalsToken += 1
        }
        "selectEpisode" -> {
            val episode = playerMetaVideos.getOrNull(value.toInt()) ?: return true
            if (selectDownloadedEpisodeForPlayback(
                    parentMetaId = parentMetaId,
                    episode = episode,
                    onDownloadedEpisodeSelected = { item, video -> switchToDownloadedEpisode(item, video) },
                )
            ) {
                playerControlsCloseModalsToken += 1
            } else {
                requestEpisodeStreamsForPlayerControls(episode)
            }
        }
        "selectEpisodeStream" -> {
            val episode = episodeStreamsPanelState.selectedEpisode ?: return true
            val stream = episodeStreamsRepoState.groups.flatMap { it.streams }.getOrNull(value.toInt()) ?: return true
            if (requestP2pConsentForPlayerControls(stream = stream, episode = episode)) return true
            switchToEpisodeStream(stream, episode)
            playerControlsCloseModalsToken += 1
        }
        "backToEpisodes" -> {
            episodeStreamsPanelState = EpisodeStreamsPanelState()
            PlayerStreamsRepository.clearEpisodeStreams()
        }
        "reloadEpisodeStreams" -> {
            episodeStreamsPanelState.selectedEpisode?.let { requestEpisodeStreamsForPlayerControls(it, forceRefresh = true) }
        }
        "submitIntroSegment" -> {
            submitIntroSegmentType = when (value.toInt()) {
                1 -> "recap"
                2 -> "outro"
                else -> "intro"
            }
            submitIntroStatusMessage = null
        }
        "submitIntroStart" -> {
            val seconds = value.takeIf { it.isFinite() && it >= 0.0 } ?: 0.0
            submitIntroStartTimeSec = seconds
            submitIntroStartTimeStr = formatPlayerControlsSeconds(seconds)
            submitIntroStatusMessage = null
        }
        "submitIntroEnd" -> {
            val seconds = value.takeIf { it.isFinite() && it >= 0.0 } ?: 0.0
            submitIntroEndTimeSec = seconds
            submitIntroEndTimeStr = formatPlayerControlsSeconds(seconds)
            submitIntroStatusMessage = null
        }
        "submitIntroCommit" -> submitIntroFromPlayerControls()
        "skipInterval" -> {
            val interval = activeSkipInterval ?: return true
            playerController?.seekTo((interval.endTime * 1000).toLong())
            scheduleProgressSyncAfterSeek()
            skipIntervalDismissed = true
        }
        "playNextEpisode" -> {
            if (nextEpisodeInfo?.hasAired == true) {
                nextEpisodeAutoPlayJob?.cancel()
                playNextEpisode()
            }
        }
        "enableP2pForPlayerControls" -> enableP2pForPlayerControls()
        "cancelP2pForPlayerControls" -> {
            playerControlsPendingP2pSwitch = null
        }
        "subtitleTab" -> {
            activeSubtitleTab = when (value.toInt()) {
                1 -> SubtitleTab.Addons
                2 -> SubtitleTab.Style
                else -> SubtitleTab.BuiltIn
            }
        }
        "selectBuiltInSubtitleTrack" -> {
            val index = value.toInt()
            val wasCustom = useCustomSubtitles
            selectedSubtitleIndex = index
            selectedAddonSubtitleId = null
            useCustomSubtitles = false
            persistInternalSubtitlePreference(subtitleTracks.firstOrNull { it.index == index })
            if (wasCustom) {
                playerController?.clearExternalSubtitleAndSelect(index)
            } else {
                playerController?.selectSubtitleTrack(index)
            }
        }
        "fetchAddonSubtitles" -> fetchAddonSubtitlesForActiveItem()
        "selectAddonSubtitle" -> {
            val addon = visibleAddonSubtitles.getOrNull(value.toInt()) ?: return true
            selectedAddonSubtitleId = addon.id
            selectedSubtitleIndex = -1
            useCustomSubtitles = true
            persistAddonSubtitlePreference(addon)
            playerController?.setSubtitleUri(addon.url)
        }
        "subtitleDelayDelta" -> setSubtitleDelay((subtitleDelayMs + value.toInt()).coerceIn(SUBTITLE_DELAY_MIN_MS, SUBTITLE_DELAY_MAX_MS))
        "subtitleDelayReset" -> setSubtitleDelay(0)
        "subtitleAutoSyncCapture" -> captureSubtitleAutoSyncTime()
        "subtitleAutoSyncReload" -> loadSubtitleAutoSyncCues(force = true)
        "subtitleAutoSyncCue" -> {
            val cue = playerControlsNearestSubtitleCues().getOrNull(value.toInt()) ?: return true
            applySubtitleAutoSyncCue(cue)
        }
        "subtitleFontSizeDelta" -> {
            PlayerSettingsRepository.setSubtitleStyle(
                subtitleStyle.copy(fontSizeSp = (subtitleStyle.fontSizeSp + value.toInt()).coerceIn(12, 40)),
            )
        }
        "subtitleOutlineToggle" -> {
            PlayerSettingsRepository.setSubtitleStyle(subtitleStyle.copy(outlineEnabled = !subtitleStyle.outlineEnabled))
        }
        "subtitleBoldToggle" -> {
            PlayerSettingsRepository.setSubtitleStyle(subtitleStyle.copy(bold = !subtitleStyle.bold))
        }
        "subtitleBottomOffsetDelta" -> {
            PlayerSettingsRepository.setSubtitleStyle(
                subtitleStyle.copy(bottomOffset = (subtitleStyle.bottomOffset + value.toInt()).coerceIn(0, 200)),
            )
        }
        "subtitleTextColor" -> {
            SubtitleColorSwatches.getOrNull(value.toInt())?.let { color ->
                PlayerSettingsRepository.setSubtitleStyle(subtitleStyle.copy(textColor = color.copy(alpha = subtitleStyle.textColor.alpha)))
            }
        }
        "subtitleOutlineColor" -> {
            SubtitleColorSwatches.getOrNull(value.toInt())?.let { color ->
                PlayerSettingsRepository.setSubtitleStyle(subtitleStyle.copy(outlineColor = color.copy(alpha = subtitleStyle.outlineColor.alpha)))
            }
        }
        "subtitleTextOpacity" -> {
            val alpha = (value.toFloat() / 100f).coerceIn(0f, 1f)
            PlayerSettingsRepository.setSubtitleStyle(subtitleStyle.copy(textColor = subtitleStyle.textColor.copy(alpha = alpha)))
        }
        "subtitleStyleReset" -> PlayerSettingsRepository.setSubtitleStyle(SubtitleStyleState.DEFAULT)
        "parentalGuideComplete" -> {
            showParentalGuide = false
        }
        else -> return false
    }
    return true
}

private fun PlayerScreenRuntime.requestP2pConsentForPlayerControls(
    stream: StreamItem,
    episode: MetaVideo?,
): Boolean {
    if (!isP2pStream(stream)) return false
    if (!P2pSettingsRepository.isVisible) return false
    if (P2pSettingsRepository.uiState.value.p2pEnabled) return false
    playerControlsPendingP2pSwitch = PendingPlayerP2pSwitch(
        stream = stream,
        episode = episode,
        isAutoPlay = false,
    )
    return true
}

private fun PlayerScreenRuntime.enableP2pForPlayerControls() {
    val pending = playerControlsPendingP2pSwitch ?: return
    playerControlsPendingP2pSwitch = null
    P2pSettingsRepository.setP2pEnabled(true)
    val episode = pending.episode
    if (episode != null) {
        switchToP2pEpisodeStream(pending.stream, episode, pending.isAutoPlay)
    } else {
        switchToP2pSourceStream(pending.stream)
    }
    playerControlsCloseModalsToken += 1
}

private fun PlayerScreenRuntime.prepareSourcesForPlayerControls(forceRefresh: Boolean = false) {
    val vid = activeVideoId
    if (vid == null) {
        return
    }
    val requestType = contentType ?: parentMetaType
    PlayerStreamsRepository.loadSources(
        type = requestType,
        videoId = vid,
        season = activeSeasonNumber,
        episode = activeEpisodeNumber,
        forceRefresh = forceRefresh,
    )
}

private fun Color.toCssColorString(): String {
    val redInt = (red * 255f).roundToInt().coerceIn(0, 255)
    val greenInt = (green * 255f).roundToInt().coerceIn(0, 255)
    val blueInt = (blue * 255f).roundToInt().coerceIn(0, 255)
    val alphaValue = alpha.coerceIn(0f, 1f)
    return "rgba($redInt, $greenInt, $blueInt, ${alphaValue.toCssAlphaString()})"
}

private fun Float.toCssAlphaString(): String {
    val rounded = (this * 1000f).roundToInt() / 1000f
    return rounded.toString().trimEnd('0').trimEnd('.').ifEmpty { "0" }
}

private fun PlayerScreenRuntime.prepareEpisodesForPlayerControls() {
    if (!isSeries) return
    if (playerMetaVideos.isEmpty()) {
        scope.launch {
            playerMetaVideos = MetaDetailsRepository.fetch(parentMetaType, parentMetaId)?.videos ?: emptyList()
        }
    }
}

private fun PlayerScreenRuntime.requestEpisodeStreamsForPlayerControls(
    episode: MetaVideo,
    forceRefresh: Boolean = false,
) {
    PlayerStreamsRepository.loadEpisodeStreams(
        type = contentType ?: parentMetaType,
        videoId = episode.id,
        season = episode.season,
        episode = episode.episode,
        forceRefresh = forceRefresh,
    )
    episodeStreamsPanelState = EpisodeStreamsPanelState(showStreams = true, selectedEpisode = episode)
}

private fun PlayerScreenRuntime.submitIntroFromPlayerControls() {
    if (isSubmitIntroSubmitting) return
    val imdbId = activeSubmitIntroImdbId()
    val season = activeSeasonNumber
    val episode = activeEpisodeNumber
    val start = submitIntroStartTimeSec
    val end = submitIntroEndTimeSec
    if (imdbId.isNullOrBlank() || season == null || episode == null || start == null || end == null || end <= start) {
        submitIntroStatusMessage = "Check the start and end times."
        return
    }
    isSubmitIntroSubmitting = true
    submitIntroStatusMessage = null
    scope.launch {
        val result = SkipIntroRepository.submitIntro(
            imdbId = imdbId,
            season = season,
            episode = episode,
            startSec = start,
            endSec = end,
            segmentType = submitIntroSegmentType,
        )
        isSubmitIntroSubmitting = false
        if (result) {
            submitIntroStartTimeSec = 0.0
            submitIntroEndTimeSec = 0.0
            submitIntroStartTimeStr = "00:00"
            submitIntroEndTimeStr = "00:00"
            submitIntroSegmentType = "intro"
            submitIntroStatusMessage = null
            playerControlsCloseModalsToken += 1
        } else {
            submitIntroStatusMessage = "Unable to submit timestamps."
        }
    }
}

private fun PlayerScreenRuntime.activeSubmitIntroImdbId(): String? =
    activeVideoId?.split(":")?.firstOrNull()?.takeIf { it.startsWith("tt") }
        ?: parentMetaId.takeIf { it.startsWith("tt") }
        ?: metaUiState.meta?.id?.takeIf { it.startsWith("tt") }

@Composable
private fun skipPromptLabel(type: String?): String =
    when (type?.lowercase()) {
        "intro", "op", "mixed-op" -> stringResource(Res.string.player_skip_intro)
        "outro", "ed", "mixed-ed", "credits" -> stringResource(Res.string.player_skip_outro)
        "recap" -> stringResource(Res.string.player_skip_recap)
        else -> stringResource(Res.string.player_skip)
    }

private fun formatPlayerControlsSeconds(seconds: Double): String {
    val totalSeconds = seconds
        .takeIf { it.isFinite() && it >= 0.0 }
        ?.toLong()
        ?: 0L
    val minutes = totalSeconds / 60L
    val remainder = totalSeconds % 60L
    return "${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}"
}

private fun PlayerScreenRuntime.handlePlayerControlsScrubChange(positionMs: Long) {
    isScrubbingTimeline = true
    scrubbingPositionMs = positionMs
}

private fun PlayerScreenRuntime.handlePlayerControlsScrubFinished(positionMs: Long) {
    isScrubbingTimeline = false
    scrubbingPositionMs = null
    playerController?.seekTo(positionMs)
    scheduleProgressSyncAfterSeek()
}

private fun PlayerScreenRuntime.openInExternalPlayer() {
    val openExternal = args.onOpenInExternalPlayer ?: return
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
        ),
    )
}

private fun PlayerScreenRuntime.buildPlayerControlFilters(
    groups: List<AddonStreamGroup> = sourceStreamsState.groups,
    allLabel: String,
    selectedFilter: String?,
): List<PlayerControlFilterItem> {
    if (groups.size <= 1) return emptyList()
    return buildList {
        add(PlayerControlFilterItem(id = "", label = allLabel, isSelected = selectedFilter == null))
        groups.distinctBy { it.addonId }.forEach { group ->
            add(
                PlayerControlFilterItem(
                    id = group.addonId,
                    label = group.addonName,
                    isSelected = selectedFilter == group.addonId,
                    isLoading = group.isLoading,
                    hasError = group.error != null,
                ),
            )
        }
    }
}

private fun PlayerScreenRuntime.buildPlayerControlEpisodeStreamFilters(
    allLabel: String,
    selectedFilter: String?,
): List<PlayerControlFilterItem> =
    buildPlayerControlFilters(
        groups = episodeStreamsRepoState.groups,
        allLabel = allLabel,
        selectedFilter = selectedFilter,
    )

private fun PlayerScreenRuntime.buildPlayerControlSourceItems(): List<PlayerControlSourceItem> {
    val canResolveDebrid = DebridSettingsRepository.uiState.value.canResolvePlayableLinks
    return sourceStreamsState.groups.flatMap { group ->
        group.streams.map { stream -> group.addonId to stream }
    }.mapIndexed { index, (filterId, stream) ->
        PlayerControlSourceItem(
            index = index,
            filterId = filterId,
            label = stream.streamLabel,
            subtitle = stream.streamSubtitle.orEmpty(),
            addonName = stream.addonName,
            isCurrent = isCurrentPlayerControlStream(stream),
            isEnabled = stream.isSelectableForPlayback(canResolveDebrid),
        )
    }
}

private fun PlayerScreenRuntime.buildPlayerControlEpisodeStreamItems(): List<PlayerControlSourceItem> {
    val canResolveDebrid = DebridSettingsRepository.uiState.value.canResolvePlayableLinks
    return episodeStreamsRepoState.groups.flatMap { group ->
        group.streams.map { stream -> group.addonId to stream }
    }.mapIndexed { index, (filterId, stream) ->
        PlayerControlSourceItem(
            index = index,
            filterId = filterId,
            label = stream.streamLabel,
            subtitle = stream.streamSubtitle.orEmpty(),
            addonName = stream.addonName,
            isCurrent = false,
            isEnabled = stream.isSelectableForPlayback(canResolveDebrid),
        )
    }
}

private fun PlayerScreenRuntime.isCurrentPlayerControlStream(stream: StreamItem): Boolean {
    val activeKey = activeSourceIdentityKey
    val streamKey = stream.playerSourceIdentityKey()
    if (activeKey != null) {
        return streamKey == activeKey
    }
    val directUrl = stream.playableDirectUrl
    if (directUrl != null && directUrl == activeSourceUrl) return true
    val infoHash = stream.p2pInfoHash
    if (infoHash != null && infoHash == activeTorrentInfoHash) return true
    return false
}

@Composable
private fun PlayerScreenRuntime.buildPlayerControlAddonSubtitleItems(): List<PlayerControlAddonSubtitleItem> =
    visibleAddonSubtitles.mapIndexed { index, subtitle ->
        PlayerControlAddonSubtitleItem(
            index = index,
            id = subtitle.id,
            display = subtitle.display,
            languageLabel = languageLabelForCode(subtitle.language),
            addonName = subtitle.addonName.orEmpty(),
            isSelected = subtitle.id == selectedAddonSubtitleId || subtitle.url == selectedAddonSubtitleId,
        )
    }

private fun PlayerScreenRuntime.buildPlayerControlSubtitleCueItems(): List<PlayerControlSubtitleCueItem> =
    playerControlsNearestSubtitleCues().mapIndexed { index, cue ->
        PlayerControlSubtitleCueItem(
            index = index,
            timeMs = cue.startTimeMs,
            timeLabel = formatPlayerControlsCueTimestamp(cue.startTimeMs),
            text = cue.text,
        )
    }

private fun PlayerScreenRuntime.playerControlsNearestSubtitleCues(): List<SubtitleSyncCue> {
    val capturedPositionMs = subtitleAutoSyncState.capturedPositionMs ?: return emptyList()
    return subtitleAutoSyncState.cues
        .sortedBy { abs(it.startTimeMs - capturedPositionMs) }
        .take(5)
}

private fun formatPlayerControlsCueTimestamp(timeMs: Long): String {
    val totalSeconds = (timeMs / 1000L).coerceAtLeast(0L)
    val minutes = totalSeconds / 60L
    val seconds = totalSeconds % 60L
    return "${minutes}:${seconds.toString().padStart(2, '0')}"
}

@Composable
private fun PlayerScreenRuntime.buildPlayerControlEpisodeItems(): List<PlayerControlEpisodeItem> {
    val items = mutableListOf<PlayerControlEpisodeItem>()
    for ((index, video) in playerMetaVideos.withIndex()) {
        if (video.season == null && video.episode == null) continue
        val episodeVideoId = buildPlaybackVideoId(
            parentMetaId = parentMetaId,
            seasonNumber = video.season,
            episodeNumber = video.episode,
            fallbackVideoId = video.id,
        )
        val isWatched = watchProgressUiState.byVideoId[episodeVideoId]?.isEffectivelyCompleted == true ||
            WatchingState.isEpisodeWatched(
                watchedKeys = watchedUiState.watchedKeys,
                metaType = parentMetaType,
                metaId = parentMetaId,
                episode = video,
            )
        items.add(
            PlayerControlEpisodeItem(
                index = index,
                id = video.id,
                title = video.title,
                code = video.playerControlsEpisodeCode(),
                overview = video.overview.orEmpty(),
                thumbnail = video.thumbnail.orEmpty(),
                season = video.season?.coerceAtLeast(0) ?: 0,
                episode = video.episode ?: 0,
                isCurrent = video.season == activeSeasonNumber && video.episode == activeEpisodeNumber,
                isWatched = isWatched,
            ),
        )
    }
    return items
}

@Composable
private fun PlayerScreenRuntime.buildPlayerControlSeasonItems(
    episodes: List<PlayerControlEpisodeItem>,
): List<PlayerControlSeasonItem> {
    val availableSeasons = episodes
        .map { it.season }
        .distinct()
        .let { seasons ->
            seasons.filter { it > 0 }.sorted() + seasons.filter { it == 0 }
        }
    val items = mutableListOf<PlayerControlSeasonItem>()
    for (season in availableSeasons) {
        val label = if (season == 0) {
            stringResource(Res.string.episodes_specials)
        } else {
            stringResource(Res.string.episodes_season, season)
        }
        items.add(
            PlayerControlSeasonItem(
                season = season,
                label = label,
                isSelected = activeSeasonNumber == season,
            ),
        )
    }
    return items
}

@Composable
private fun MetaVideo.playerControlsEpisodeCode(): String =
    when {
        season != null && episode != null -> stringResource(Res.string.compose_player_episode_code_full, season, episode)
        episode != null -> stringResource(Res.string.compose_player_episode_code_episode_only, episode)
        else -> ""
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
    suppressOpeningOverlay: Boolean,
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
            showOpeningOverlay = playerSettingsUiState.showLoadingOverlay &&
                !initialLoadCompleted &&
                errorMessage == null &&
                !suppressOpeningOverlay,
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
            activeSkipInterval = activeSkipInterval.takeUnless { isDesktop },
            skipIntervalDismissed = skipIntervalDismissed,
            controlsVisible = controlsVisible,
            onSkipInterval = { interval ->
                playerController?.seekTo((interval.endTime * 1000).toLong())
                scheduleProgressSyncAfterSeek()
                skipIntervalDismissed = true
            },
            onDismissSkipInterval = { skipIntervalDismissed = true },
            sliderEdgePadding = sliderEdgePadding,
            overlayBottomPadding = overlayBottomPadding,
            isSeries = isSeries,
            nextEpisodeInfo = nextEpisodeInfo,
            showNextEpisodeCard = showNextEpisodeCard && !isDesktop,
            nextEpisodeAutoPlaySearching = nextEpisodeAutoPlaySearching,
            nextEpisodeAutoPlaySourceName = nextEpisodeAutoPlaySourceName,
            nextEpisodeAutoPlayCountdown = nextEpisodeAutoPlayCountdown,
            onPlayNextEpisode = {
                nextEpisodeAutoPlayJob?.cancel()
                playNextEpisode()
            },
            onDismissNextEpisode = {
                nextEpisodeAutoPlayJob?.cancel()
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
        activeSubtitleTab = activeSubtitleTab,
        subtitleTracks = subtitleTracks,
        selectedSubtitleIndex = selectedSubtitleIndex,
        addonSubtitles = visibleAddonSubtitles,
        selectedAddonSubtitleId = selectedAddonSubtitleId,
        isLoadingAddonSubtitles = isLoadingAddonSubtitles,
        subtitleStyle = subtitleStyle,
        subtitleDelayMs = subtitleDelayMs,
        selectedAddonSubtitle = selectedAddonSubtitle,
        subtitleAutoSyncState = subtitleAutoSyncState,
        onSubtitleTabSelected = { activeSubtitleTab = it },
        onBuiltInSubtitleTrackSelected = { index ->
            val wasCustom = useCustomSubtitles
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
            selectedAddonSubtitleId = addon.id
            selectedSubtitleIndex = -1
            useCustomSubtitles = true
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
        watchProgressByVideoId = watchProgressUiState.byVideoId,
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
            submitIntroStartTimeSec = 0.0
            submitIntroEndTimeSec = 0.0
            submitIntroStatusMessage = null
            submitIntroStartTimeStr = "00:00"
            submitIntroEndTimeStr = "00:00"
            submitIntroSegmentType = "intro"
            showSubmitIntroModal = false
        },
    )
}
