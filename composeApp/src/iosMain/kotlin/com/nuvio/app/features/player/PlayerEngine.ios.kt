package com.nuvio.app.features.player

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier
import androidx.compose.ui.interop.UIKitViewController
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.touchlab.kermit.Logger
import com.nuvio.app.core.logging.InAppLogger
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.useContents
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_play
import nuvio.composeapp.generated.resources.player_error_mpv_unavailable
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource

private const val TAG = "NuvioiOSPlayer"

@OptIn(ExperimentalForeignApi::class)
@Composable
actual fun PlatformPlayerSurface(
    sourceUrl: String,
    sourceAudioUrl: String?,
    sourceHeaders: Map<String, String>,
    sourceResponseHeaders: Map<String, String>,
    externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle>,
    streamType: String?,
    useYoutubeChunkedPlayback: Boolean,
    modifier: Modifier,
    playWhenReady: Boolean,
    initialPositionMs: Long?,
    initialPositionRequestKey: String?,
    resizeMode: PlayerResizeMode,
    useNativeController: Boolean,
    onInitialPositionHandled: (key: String, handled: Boolean) -> Unit,
    onControllerReady: (PlayerEngineController) -> Unit,
    onSnapshot: (PlayerPlaybackSnapshot) -> Unit,
    onError: (String?) -> Unit,
) {
    sanitizePlaybackResponseHeaders(sourceResponseHeaders)
    val latestOnControllerReady = rememberUpdatedState(onControllerReady)
    val latestOnSnapshot = rememberUpdatedState(onSnapshot)
    val latestOnError = rememberUpdatedState(onError)
    val density = LocalDensity.current
    PlayerSettingsRepository.ensureLoaded()
    val playerSettings by PlayerSettingsRepository.uiState.collectAsStateWithLifecycle()
    val latestPlayerSettings = rememberUpdatedState(playerSettings)
    val experimentalSinglePrimaryPictureInPictureEnabled =
        IosExperimentalPictureInPictureSettingsStorage.loadSinglePrimaryRendererEnabled()

    val bridge = remember {
        NuvioPlayerBridgeFactory.create()
    }

    if (bridge == null) {
        LaunchedEffect(Unit) {
            InAppLogger.error("Player/iOS", "MPV bridge unavailable")
            latestOnError.value(getString(Res.string.player_error_mpv_unavailable))
        }
        return
    }

    bridge.setExperimentalSinglePrimaryPictureInPictureEnabled(experimentalSinglePrimaryPictureInPictureEnabled)

    val controller = remember(bridge) {
        object : PlayerEngineController {
            override fun play() {
                InAppLogger.debug("Player/iOS", "control play positionMs=${bridge.getPositionMs()}")
                bridge.play()
            }

            override fun pause() {
                InAppLogger.debug("Player/iOS", "control pause positionMs=${bridge.getPositionMs()}")
                bridge.pause()
            }

            override fun seekTo(positionMs: Long) {
                val targetMs = positionMs.coerceAtLeast(0L)
                InAppLogger.info("Player/iOS", "control seekTo fromMs=${bridge.getPositionMs()} targetMs=$targetMs")
                bridge.seekTo(targetMs)
            }

            override fun seekBy(offsetMs: Long) {
                val currentMs = bridge.getPositionMs().coerceAtLeast(0L)
                val targetMs = (currentMs + offsetMs).coerceAtLeast(0L)
                InAppLogger.info("Player/iOS", "control seekBy offsetMs=$offsetMs fromMs=$currentMs targetMs=$targetMs")
                bridge.seekBy(offsetMs)
            }

            override fun retry() {
                InAppLogger.info("Player/iOS", "control retry positionMs=${bridge.getPositionMs()}")
                bridge.retry()
            }

            override fun updateNowPlayingMetadata(info: PlayerNowPlayingInfo) {
                runCatching {
                    bridge.updateNowPlayingMetadata(
                        title = info.title,
                        subtitle = info.subtitle,
                        artworkUrl = info.artworkUrl,
                    )
                }.onFailure { error ->
                    Logger.w(TAG, error) { "Failed to update iOS Now Playing metadata" }
                }
            }

            override fun clearNowPlayingInfo() {
                runCatching {
                    bridge.clearNowPlayingInfo()
                }.onFailure { error ->
                    Logger.w(TAG, error) { "Failed to clear iOS Now Playing metadata" }
                }
            }

            override fun isPictureInPictureSupported(): Boolean = bridge.isPictureInPictureSupported()

            override fun startPictureInPicture() {
                bridge.startPictureInPicture()
            }

            override fun configureIosVideoOutput(settings: PlayerSettingsUiState) {
                bridge.applyIosVideoOutputSettings(settings)
            }

            override fun setPlaybackSpeed(speed: Float) {
                InAppLogger.info("Player/iOS", "control speed=$speed")
                bridge.setPlaybackSpeed(speed)
            }

            override fun currentPlayerVolume(): PlayerAudioLevel {
                val current = bridge.getVolume().coerceIn(0f, 2f)
                return PlayerAudioLevel(
                    fraction = current,
                    isMuted = current <= 0.001f,
                )
            }

            override fun setPlayerVolume(level: Float): PlayerAudioLevel {
                val target = level.coerceIn(0f, 2f)
                InAppLogger.debug("Player/iOS", "control volume target=$target muted=${target <= 0.001f}")
                bridge.setVolume(target)
                return PlayerAudioLevel(
                    fraction = target,
                    isMuted = target <= 0.001f,
                )
            }

            override fun setMuted(muted: Boolean) {
                InAppLogger.debug("Player/iOS", "control muted=$muted")
                bridge.setMuted(muted)
            }

            override fun getAudioTracks(): List<AudioTrack> {
                val count = bridge.getAudioTrackCount()
                val tracks = (0 until count).map { i ->
                    AudioTrack(
                        index = bridge.getAudioTrackIndex(i),
                        id = bridge.getAudioTrackId(i),
                        label = bridge.getAudioTrackLabel(i),
                        language = bridge.getAudioTrackLang(i),
                        isSelected = bridge.isAudioTrackSelected(i),
                    )
                }
                InAppLogger.debug(
                    "Player/iOS",
                    "getAudioTracks count=${tracks.size} selected=${tracks.firstOrNull { it.isSelected }?.index ?: -1}",
                )
                return tracks
            }

            override fun getSubtitleTracks(): List<SubtitleTrack> {
                val count = bridge.getSubtitleTrackCount()
                val tracks = (0 until count).map { i ->
                    val trackId = bridge.getSubtitleTrackId(i)
                    val trackLabel = bridge.getSubtitleTrackLabel(i)
                    val trackLanguage = bridge.getSubtitleTrackLang(i)
                    SubtitleTrack(
                        index = bridge.getSubtitleTrackIndex(i),
                        id = trackId,
                        label = trackLabel,
                        language = trackLanguage,
                        isSelected = bridge.isSubtitleTrackSelected(i),
                        isForced = inferForcedSubtitleTrack(
                            label = trackLabel,
                            language = trackLanguage,
                            trackId = trackId,
                        ),
                    )
                }
                Logger.d(TAG) { "getSubtitleTracks: found ${tracks.size} tracks" }
                InAppLogger.debug("Player/iOS", "getSubtitleTracks count=${tracks.size}")
                return tracks
            }

            override fun selectAudioTrack(index: Int) {
                // Convert from logical track index to mpv track id
                val count = bridge.getAudioTrackCount()
                InAppLogger.info("Player/iOS", "select audio track index=$index available=$count")
                if (count <= 0) {
                    InAppLogger.warn("Player/iOS", "select audio track ignored: no audio tracks")
                    return
                }

                val trackId = (0 until count)
                    .firstNotNullOfOrNull { at ->
                        if (bridge.getAudioTrackIndex(at) == index) {
                            bridge.getAudioTrackId(at).toIntOrNull()
                        } else {
                            null
                        }
                    }
                    ?: if (index in 0 until count) {
                        bridge.getAudioTrackId(index).toIntOrNull() ?: (index + 1)
                    } else {
                        null
                    }

                if (trackId != null) {
                    InAppLogger.debug("Player/iOS", "select audio track mpvId=$trackId")
                    bridge.selectAudioTrack(trackId)
                } else {
                    InAppLogger.warn("Player/iOS", "select audio track failed to resolve index=$index")
                }
            }

            override fun selectSubtitleTrack(index: Int) {
                InAppLogger.info("Player/iOS", "select subtitle track index=$index")
                if (index < 0) {
                    bridge.selectSubtitleTrack(-1) // disable
                } else {
                    val count = bridge.getSubtitleTrackCount()
                    if (count <= 0) {
                        InAppLogger.warn("Player/iOS", "select subtitle track ignored: no subtitle tracks")
                        return
                    }

                    val trackId = (0 until count)
                        .firstNotNullOfOrNull { at ->
                            if (bridge.getSubtitleTrackIndex(at) == index) {
                                bridge.getSubtitleTrackId(at).toIntOrNull()
                            } else {
                                null
                            }
                        }
                        ?: if (index in 0 until count) {
                            bridge.getSubtitleTrackId(index).toIntOrNull() ?: (index + 1)
                        } else {
                            null
                        }

                    if (trackId != null) {
                        InAppLogger.debug("Player/iOS", "select subtitle track mpvId=$trackId")
                        bridge.selectSubtitleTrack(trackId)
                    } else {
                        InAppLogger.warn("Player/iOS", "select subtitle track failed to resolve index=$index")
                    }
                }
            }

            override fun setSubtitleUri(url: String) {
                Logger.d(TAG) { "setSubtitleUri: $url" }
                InAppLogger.info("Player/iOS", "setSubtitleUri url=${InAppLogger.redactUrl(url)}")
                bridge.setSubtitleUrl(url)
            }

            override fun clearExternalSubtitle() {
                InAppLogger.info("Player/iOS", "clear external subtitle")
                bridge.clearExternalSubtitle()
            }

            override fun clearExternalSubtitleAndSelect(trackIndex: Int) {
                InAppLogger.info("Player/iOS", "clear external subtitle and select builtInIndex=$trackIndex")
                val trackId = if (trackIndex < 0) {
                    -1
                } else {
                    val count = bridge.getSubtitleTrackCount()
                    if (count <= 0) {
                        trackIndex + 1
                    } else {
                        (0 until count)
                            .firstNotNullOfOrNull { at ->
                                if (bridge.getSubtitleTrackIndex(at) == trackIndex) {
                                    bridge.getSubtitleTrackId(at).toIntOrNull()
                                } else {
                                    null
                                }
                            }
                            ?: if (trackIndex in 0 until count) {
                                bridge.getSubtitleTrackId(trackIndex).toIntOrNull() ?: (trackIndex + 1)
                            } else {
                                trackIndex + 1
                            }
                    }
                }
                InAppLogger.debug("Player/iOS", "clear external subtitle select mpvId=$trackId")
                bridge.clearExternalSubtitleAndSelect(trackId)
            }

            override fun setSubtitleDelayMs(delayMs: Int) {
                val targetMs = delayMs.coerceIn(SUBTITLE_DELAY_MIN_MS, SUBTITLE_DELAY_MAX_MS)
                InAppLogger.info("Player/iOS", "set subtitle delay ms=$targetMs")
                bridge.setSubtitleDelayMs(targetMs)
            }

            override fun applySubtitleStyle(style: SubtitleStyleState) {
                InAppLogger.debug(
                    "Player/iOS",
                    "apply subtitle style font=${style.fontSizeSp} bold=${style.bold} outline=${style.outlineEnabled}:${style.outlineWidth} bottom=${style.bottomOffset}",
                )
                bridge.applySubtitleStyle(
                    textColor = style.textColor.toMpvColorString(),
                    backgroundColor = style.backgroundColor.toMpvColorString(),
                    outlineColor = style.outlineColor.toMpvColorString(),
                    outlineSize = if (style.outlineEnabled) style.outlineWidth.toFloat() else 0f,
                    bold = style.bold,
                    fontSize = style.toMpvSubtitleFontSize(),
                    subPos = style.toMpvSubtitlePosition(),
                )
            }
        }
    }

    LaunchedEffect(controller, sourceUrl, sourceAudioUrl, sourceHeaders, sourceResponseHeaders) {
        latestOnControllerReady.value(controller)
    }

    // Load file and set initial state
    LaunchedEffect(bridge, sourceUrl, sourceAudioUrl, sourceHeaders, externalSubtitles) {
        InAppLogger.info(
            "Player/iOS",
            "load mpv url=${InAppLogger.redactUrl(sourceUrl)} audio=${!sourceAudioUrl.isNullOrBlank()} " +
                "subtitles=${externalSubtitles.size} headers=${InAppLogger.headerKeys(sanitizePlaybackHeaders(sourceHeaders))} " +
                "hwdec=${latestPlayerSettings.value.iosHardwareDecoderMode.mpvValue} toneMapping=${latestPlayerSettings.value.iosToneMappingMode.mpvValue}",
        )
        bridge.applyIosVideoOutputSettings(latestPlayerSettings.value)
        bridge.loadFileWithAudio(
            videoUrl = sourceUrl,
            audioUrl = sourceAudioUrl,
            headersJson = encodePlaybackHeadersForBridge(sourceHeaders),
            subtitlesJson = encodeExternalSubtitlesForBridge(externalSubtitles),
        )
        if (playWhenReady) {
            InAppLogger.debug("Player/iOS", "initial play requested")
            bridge.play()
        } else {
            InAppLogger.debug("Player/iOS", "initial pause requested")
            bridge.pause()
        }
    }

    // Update playWhenReady
    LaunchedEffect(bridge, playWhenReady) {
        InAppLogger.debug("Player/iOS", "playWhenReady changed=$playWhenReady")
        if (playWhenReady) bridge.play() else bridge.pause()
    }

    // Update resize mode
    LaunchedEffect(bridge, resizeMode) {
        InAppLogger.debug("Player/iOS", "resizeMode=$resizeMode")
        bridge.setResizeMode(
            when (resizeMode) {
                PlayerResizeMode.Fit -> 0
                PlayerResizeMode.Fill -> 1
                PlayerResizeMode.Zoom -> 2
            }
        )
    }

    LaunchedEffect(bridge, playerSettings) {
        bridge.applyIosVideoOutputSettings(playerSettings)
    }

    // Polling for snapshots
    LaunchedEffect(bridge) {
        var lastReportedError: String? = null
        while (isActive) {
            val snapshot = PlayerPlaybackSnapshot(
                isLoading = bridge.getIsLoading(),
                isPlaying = bridge.getIsPlaying(),
                isEnded = bridge.getIsEnded(),
                durationMs = bridge.getDurationMs(),
                positionMs = bridge.getPositionMs(),
                bufferedPositionMs = bridge.getBufferedMs(),
                playbackSpeed = bridge.getPlaybackSpeed(),
                videoWidth = bridge.getVideoWidth().coerceAtLeast(0),
                videoHeight = bridge.getVideoHeight().coerceAtLeast(0),
                mediaInfoJson = bridge.getMediaInfoJson(),
            )
            latestOnSnapshot.value(snapshot)
            val errorMessage = bridge.getErrorMessage().ifBlank { null }
            if (errorMessage != lastReportedError) {
                lastReportedError = errorMessage
                if (errorMessage != null) {
                    InAppLogger.error("Player/iOS", "Bridge error=$errorMessage")
                }
                latestOnError.value(errorMessage)
            }
            delay(250L)
        }
    }

    // Cleanup
    DisposableEffect(bridge) {
        onDispose {
            InAppLogger.info("Player/iOS", "destroy bridge positionMs=${bridge.getPositionMs()} durationMs=${bridge.getDurationMs()}")
            bridge.destroy()
        }
    }

    // Render the player view
    Box(modifier = modifier) {
        UIKitViewController(
            factory = { bridge.createPlayerViewController() },
            modifier = Modifier
                .fillMaxSize()
                .onSizeChanged { size ->
                    if (size.width > 1 && size.height > 1) {
                        bridge.syncVideoSurfaceLayout(
                            width = with(density) { size.width.toDp().value.toDouble() },
                            height = with(density) { size.height.toDp().value.toDouble() },
                        )
                    }
                },
            onResize = { viewController, rect ->
                viewController.view.setFrame(rect)
                rect.useContents {
                    bridge.syncVideoSurfaceLayout(
                        width = size.width,
                        height = size.height,
                    )
                }
            },
            interactive = false,
        )
        
        if (useNativeController) {
            var isPlayingLocal by remember { mutableStateOf(playWhenReady) }
            
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(if (!isPlayingLocal) Color.Black.copy(alpha = 0.4f) else Color.Transparent)
                    .clickable {
                        if (isPlayingLocal) {
                            bridge.pause()
                            isPlayingLocal = false
                        } else {
                            bridge.play()
                            isPlayingLocal = true
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                if (!isPlayingLocal) {
                    Icon(
                        imageVector = Icons.Rounded.PlayArrow,
                        contentDescription = stringResource(Res.string.action_play),
                        tint = Color.White,
                        modifier = Modifier.size(64.dp)
                    )
                }
            }
        }
    }
}

private fun NuvioPlayerBridge.applyIosVideoOutputSettings(settings: PlayerSettingsUiState) {
    InAppLogger.debug(
        "Player/iOS",
        "videoOutput hwdec=${settings.iosHardwareDecoderMode.mpvValue} targetColorspaceHint=${settings.iosTargetColorspaceHintEnabled} " +
            "toneMapping=${settings.iosToneMappingMode.mpvValue} hdrComputePeak=${settings.iosHdrComputePeakEnabled} " +
            "targetPrimaries=${settings.iosTargetPrimaries.mpvValue} targetTransfer=${settings.iosTargetTransfer.mpvValue} " +
            "extendedDynamicRange=${settings.iosExtendedDynamicRangeEnabled} audioOutput=${settings.iosAudioOutputMode.mpvValue}",
    )
    configureAudioOutput(audioOutput = settings.iosAudioOutputMode.mpvValue)
    configureVideoOutput(
        hardwareDecoder = settings.iosHardwareDecoderMode.mpvValue,
        targetColorspaceHint = settings.iosTargetColorspaceHintEnabled,
        toneMapping = settings.iosToneMappingMode.mpvValue,
        hdrComputePeak = settings.iosHdrComputePeakEnabled,
        targetPrimaries = settings.iosTargetPrimaries.mpvValue,
        targetTransfer = settings.iosTargetTransfer.mpvValue,
        extendedDynamicRange = settings.iosExtendedDynamicRangeEnabled,
        deband = settings.iosDebandEnabled,
        interpolation = settings.iosInterpolationEnabled,
        brightness = settings.iosBrightness,
        contrast = settings.iosContrast,
        saturation = settings.iosSaturation,
        gamma = settings.iosGamma,
    )
}

private fun Color.toMpvColorString(): String {
    val alphaInt = (alpha * 255f).toInt().coerceIn(0, 255)
    val redInt = (red * 255f).toInt().coerceIn(0, 255)
    val greenInt = (green * 255f).toInt().coerceIn(0, 255)
    val blueInt = (blue * 255f).toInt().coerceIn(0, 255)
    return buildString {
        append('#')
        append(alphaInt.toHexByte())
        append(redInt.toHexByte())
        append(greenInt.toHexByte())
        append(blueInt.toHexByte())
    }
}

private fun SubtitleStyleState.toMpvSubtitlePosition(): Int =
    (100 - (bottomOffset / 2)).coerceIn(0, 150)

private fun SubtitleStyleState.toMpvSubtitleFontSize(): Float =
    (fontSizeSp * 3f).coerceIn(24f, 96f)

private fun Int.toHexByte(): String {
    val digits = "0123456789ABCDEF"
    val value = coerceIn(0, 255)
    return buildString {
        append(digits[value / 16])
        append(digits[value % 16])
    }
}

private fun encodeExternalSubtitlesForBridge(subtitles: List<com.nuvio.app.features.streams.StreamSubtitle>): String? {
    if (subtitles.isEmpty()) return null
    return runCatching {
        Json.encodeToString(subtitles)
    }.getOrNull()
}

private fun encodePlaybackHeadersForBridge(headers: Map<String, String>): String? {
    val sanitized = sanitizePlaybackHeaders(headers)
    if (sanitized.isEmpty()) {
        return null
    }
    return runCatching {
        Json.encodeToString(sanitized)
    }.getOrNull()
}
