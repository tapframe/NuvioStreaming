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
    fun setMuted(muted: Boolean) {}
    fun getAudioTracks(): List<AudioTrack>
    fun getSubtitleTracks(): List<SubtitleTrack>
    fun selectAudioTrack(index: Int)
    fun selectSubtitleTrack(index: Int)
    fun setSubtitleUri(url: String)
    fun selectAddonSubtitle(subtitle: AddonSubtitle) {
        setSubtitleUri(subtitle.url)
    }
    fun clearExternalSubtitle()
    fun clearExternalSubtitleAndSelect(trackIndex: Int)
    fun applySubtitleStyle(style: SubtitleStyleState) {}
    fun setSubtitleDelayMs(delayMs: Int) {}
    fun configureIosVideoOutput(settings: PlayerSettingsUiState) {}
    fun updateNowPlayingMetadata(info: PlayerNowPlayingInfo) {}
    fun clearNowPlayingInfo() {}
}

internal const val ADDON_SUBTITLE_TRACK_ID_PREFIX = "nuvio-addon-subtitle:"

internal fun buildAddonSubtitleTrackId(url: String): String =
    "$ADDON_SUBTITLE_TRACK_ID_PREFIX${url.hashCode().toUInt().toString(16)}"

internal fun buildAddonSubtitleTrackId(subtitle: AddonSubtitle): String =
    "$ADDON_SUBTITLE_TRACK_ID_PREFIX${subtitle.id}:${subtitle.url.hashCode().toUInt().toString(16)}"

internal fun isAddonSubtitleTrackId(media3TrackId: String?): Boolean =
    normalizeMedia3MergedTrackId(media3TrackId)?.startsWith(ADDON_SUBTITLE_TRACK_ID_PREFIX) == true

internal fun matchesAddonSubtitleTrackId(media3TrackId: String?, addonTrackId: String): Boolean =
    normalizeMedia3MergedTrackId(media3TrackId) == addonTrackId

internal fun isLibmpvAddonSubtitleTrack(title: String?, isExternal: Boolean): Boolean =
    isExternal && title?.startsWith(ADDON_SUBTITLE_TRACK_ID_PREFIX) == true

internal fun normalizeMedia3MergedTrackId(trackId: String?): String? {
    var normalized = trackId ?: return null
    while (true) {
        val separator = normalized.indexOf(':')
        if (separator <= 0 || normalized.take(separator).any { !it.isDigit() }) {
            return normalized
        }
        normalized = normalized.substring(separator + 1)
    }
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
    externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle> = emptyList(),
    streamType: String? = null,
    useYoutubeChunkedPlayback: Boolean = false,
    modifier: Modifier = Modifier,
    playWhenReady: Boolean = true,
    initialPositionMs: Long? = null,
    initialPositionRequestKey: String? = null,
    resizeMode: PlayerResizeMode = PlayerResizeMode.Fit,
    useNativeController: Boolean = false,
    onInitialPositionHandled: (key: String, handled: Boolean) -> Unit = { _, _ -> },
    onControllerReady: (PlayerEngineController) -> Unit,
    onSnapshot: (PlayerPlaybackSnapshot) -> Unit,
    onError: (String?) -> Unit,
)
