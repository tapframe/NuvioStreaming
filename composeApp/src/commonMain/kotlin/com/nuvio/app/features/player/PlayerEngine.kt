package com.nuvio.app.features.player

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

interface PlayerEngineController {
    fun play()
    fun pause()
    fun seekTo(positionMs: Long)
    fun seekBy(offsetMs: Long)
    fun retry()
    fun setPlaybackSpeed(speed: Float)
    fun getAudioTracks(): List<AudioTrack>
    fun getSubtitleTracks(): List<SubtitleTrack>
    fun selectAudioTrack(index: Int)
    fun selectSubtitleTrack(index: Int)
    fun setSubtitleUri(url: String)
    fun clearExternalSubtitle()
    fun clearExternalSubtitleAndSelect(trackIndex: Int)
    fun applySubtitleStyle(style: SubtitleStyleState) {}
    fun configureIosVideoOutput(settings: PlayerSettingsUiState) {}
}

internal fun sanitizePlaybackHeaders(headers: Map<String, String>?): Map<String, String> {
    val rawHeaders = headers ?: return emptyMap()
    if (rawHeaders.isEmpty()) return emptyMap()

    val sanitized = LinkedHashMap<String, String>(rawHeaders.size)
    rawHeaders.forEach { (rawKey, rawValue) ->
        val key = rawKey.trim()
        val value = rawValue.trim()
        if (key.isEmpty() || value.isEmpty()) return@forEach
        if (key.equals("Range", ignoreCase = true)) return@forEach
        sanitized[key] = value
    }
    return sanitized
}

internal fun sanitizePlaybackResponseHeaders(headers: Map<String, String>?): Map<String, String> {
    val rawHeaders = headers ?: return emptyMap()
    if (rawHeaders.isEmpty()) return emptyMap()

    val sanitized = LinkedHashMap<String, String>(rawHeaders.size)
    rawHeaders.forEach { (rawKey, rawValue) ->
        val key = rawKey.trim()
        val value = rawValue.trim()
        if (key.isEmpty() || value.isEmpty()) return@forEach
        sanitized[key] = value
    }
    return sanitized
}

@Composable
expect fun PlatformPlayerSurface(
    sourceUrl: String,
    sourceAudioUrl: String? = null,
    sourceHeaders: Map<String, String> = emptyMap(),
    sourceResponseHeaders: Map<String, String> = emptyMap(),
    useYoutubeChunkedPlayback: Boolean = false,
    modifier: Modifier = Modifier,
    playWhenReady: Boolean = true,
    resizeMode: PlayerResizeMode = PlayerResizeMode.Fit,
    useNativeController: Boolean = false,
    onControllerReady: (PlayerEngineController) -> Unit,
    onSnapshot: (PlayerPlaybackSnapshot) -> Unit,
    onError: (String?) -> Unit,
)
