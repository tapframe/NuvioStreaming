package com.nuvio.app.features.player

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.interop.UIKitViewController
import co.touchlab.kermit.Logger
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val TAG = "NuvioiOSPlayer"

@OptIn(ExperimentalForeignApi::class)
@Composable
actual fun PlatformPlayerSurface(
    sourceUrl: String,
    sourceAudioUrl: String?,
    sourceHeaders: Map<String, String>,
    sourceResponseHeaders: Map<String, String>,
    useYoutubeChunkedPlayback: Boolean,
    modifier: Modifier,
    playWhenReady: Boolean,
    resizeMode: PlayerResizeMode,
    useNativeController: Boolean,
    onControllerReady: (PlayerEngineController) -> Unit,
    onSnapshot: (PlayerPlaybackSnapshot) -> Unit,
    onError: (String?) -> Unit,
) {
    sanitizePlaybackResponseHeaders(sourceResponseHeaders)
    val latestOnControllerReady = rememberUpdatedState(onControllerReady)
    val latestOnSnapshot = rememberUpdatedState(onSnapshot)
    val latestOnError = rememberUpdatedState(onError)

    val bridge = remember {
        NuvioPlayerBridgeFactory.create()
    }

    if (bridge == null) {
        LaunchedEffect(Unit) {
            latestOnError.value("MPV player engine not available. Please rebuild the app.")
        }
        return
    }

    val controller = remember(bridge) {
        object : PlayerEngineController {
            override fun play() {
                bridge.play()
            }

            override fun pause() {
                bridge.pause()
            }

            override fun seekTo(positionMs: Long) {
                bridge.seekTo(positionMs)
            }

            override fun seekBy(offsetMs: Long) {
                bridge.seekBy(offsetMs)
            }

            override fun retry() {
                bridge.retry()
            }

            override fun setPlaybackSpeed(speed: Float) {
                bridge.setPlaybackSpeed(speed)
            }

            override fun getAudioTracks(): List<AudioTrack> {
                val count = bridge.getAudioTrackCount()
                return (0 until count).map { i ->
                    AudioTrack(
                        index = bridge.getAudioTrackIndex(i),
                        id = bridge.getAudioTrackId(i),
                        label = bridge.getAudioTrackLabel(i),
                        language = bridge.getAudioTrackLang(i),
                        isSelected = bridge.isAudioTrackSelected(i),
                    )
                }
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
                return tracks
            }

            override fun selectAudioTrack(index: Int) {
                // Convert from logical track index to mpv track id
                val count = bridge.getAudioTrackCount()
                if (count <= 0) return

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
                    bridge.selectAudioTrack(trackId)
                }
            }

            override fun selectSubtitleTrack(index: Int) {
                if (index < 0) {
                    bridge.selectSubtitleTrack(-1) // disable
                } else {
                    val count = bridge.getSubtitleTrackCount()
                    if (count <= 0) return

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
                        bridge.selectSubtitleTrack(trackId)
                    }
                }
            }

            override fun setSubtitleUri(url: String) {
                Logger.d(TAG) { "setSubtitleUri: $url" }
                bridge.setSubtitleUrl(url)
            }

            override fun clearExternalSubtitle() {
                bridge.clearExternalSubtitle()
            }

            override fun clearExternalSubtitleAndSelect(trackIndex: Int) {
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
                bridge.clearExternalSubtitleAndSelect(trackId)
            }

            override fun applySubtitleStyle(style: SubtitleStyleState) {
                bridge.applySubtitleStyle(
                    textColor = style.textColor.toMpvColorString(),
                    outlineSize = if (style.outlineEnabled) 1.65f else 0f,
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
    LaunchedEffect(bridge, sourceUrl, sourceAudioUrl, sourceHeaders) {
        bridge.loadFileWithAudio(
            sourceUrl,
            sourceAudioUrl,
            encodePlaybackHeadersForBridge(sourceHeaders),
        )
        if (playWhenReady) {
            bridge.play()
        } else {
            bridge.pause()
        }
    }

    // Update playWhenReady
    LaunchedEffect(bridge, playWhenReady) {
        if (playWhenReady) bridge.play() else bridge.pause()
    }

    // Update resize mode
    LaunchedEffect(bridge, resizeMode) {
        bridge.setResizeMode(
            when (resizeMode) {
                PlayerResizeMode.Fit -> 0
                PlayerResizeMode.Fill -> 1
                PlayerResizeMode.Zoom -> 2
            }
        )
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
            )
            latestOnSnapshot.value(snapshot)
            val errorMessage = bridge.getErrorMessage().ifBlank { null }
            if (errorMessage != lastReportedError) {
                lastReportedError = errorMessage
                latestOnError.value(errorMessage)
            }
            delay(250L)
        }
    }

    // Cleanup
    DisposableEffect(bridge) {
        onDispose {
            bridge.destroy()
        }
    }

    // Render the player view
    UIKitViewController(
        factory = { bridge.createPlayerViewController() },
        modifier = modifier,
        interactive = false,
    )
}

private fun Color.toMpvColorString(): String {
    val redInt = (red * 255f).toInt().coerceIn(0, 255)
    val greenInt = (green * 255f).toInt().coerceIn(0, 255)
    val blueInt = (blue * 255f).toInt().coerceIn(0, 255)
    return buildString {
        append('#')
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

private fun encodePlaybackHeadersForBridge(headers: Map<String, String>): String? {
    val sanitized = sanitizePlaybackHeaders(headers)
    if (sanitized.isEmpty()) {
        return null
    }
    return runCatching {
        Json.encodeToString(sanitized)
    }.getOrNull()
}
