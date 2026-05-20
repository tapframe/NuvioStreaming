package com.nuvio.app.features.livetv

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

object LiveTvRepository {
    private val log = Logger.withTag("LiveTvRepository")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val _uiState = MutableStateFlow(LiveTvUiState())
    val uiState: StateFlow<LiveTvUiState> = _uiState.asStateFlow()

    private var hasLoaded = false

    fun ensureLoaded() {
        if (hasLoaded) return
        hasLoaded = true
        val url = LiveTvStorage.loadPlaylistUrl()?.trim().orEmpty()
        _uiState.value = LiveTvUiState(playlistUrl = url)
        if (url.isNotBlank()) {
            refresh()
        }
    }

    fun savePlaylistUrl(url: String) {
        ensureLoaded()
        val normalized = url.trim()
        LiveTvStorage.savePlaylistUrl(normalized)
        _uiState.value = LiveTvUiState(playlistUrl = normalized)
        if (normalized.isNotBlank()) {
            refresh()
        }
    }

    fun refresh() {
        ensureLoaded()
        val url = _uiState.value.playlistUrl.trim()
        if (url.isBlank()) {
            _uiState.value = LiveTvUiState()
            return
        }

        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        scope.launch {
            val result = runCatching {
                val payload = withContext(Dispatchers.Default) { httpGetText(url) }
                parseM3uPlaylist(payload)
            }

            _uiState.value = result.fold(
                onSuccess = { channels ->
                    LiveTvUiState(
                        playlistUrl = url,
                        channels = channels,
                        isLoading = false,
                        errorMessage = if (channels.isEmpty()) "No channels found in this playlist." else null,
                    )
                },
                onFailure = { error ->
                    if (error is CancellationException) throw error
                    log.w(error) { "Failed to load live TV playlist" }
                    LiveTvUiState(
                        playlistUrl = url,
                        isLoading = false,
                        errorMessage = error.message ?: "Failed to load playlist.",
                    )
                },
            )
        }
    }
}

internal fun parseM3uPlaylist(payload: String): List<LiveTvChannel> {
    val channels = mutableListOf<LiveTvChannel>()
    var pendingInfo: M3uInfo? = null

    payload.lineSequence()
        .map(String::trim)
        .filter(String::isNotBlank)
        .forEach { line ->
            when {
                line.startsWith("#EXTINF", ignoreCase = true) -> {
                    pendingInfo = parseExtInf(line)
                }
                line.startsWith("#") -> Unit
                else -> {
                    val streamUrl = line
                    val info = pendingInfo
                    val name = info?.name?.takeIf(String::isNotBlank)
                        ?: streamUrl.substringAfterLast('/').substringBefore('?').ifBlank { "Channel" }
                    channels += LiveTvChannel(
                        id = stableChannelId(streamUrl, channels.size),
                        name = name,
                        streamUrl = streamUrl,
                        logoUrl = info?.logoUrl?.takeIf(String::isNotBlank),
                        group = info?.group?.takeIf(String::isNotBlank),
                    )
                    pendingInfo = null
                }
            }
        }

    return channels.distinctBy { it.streamUrl }
}

private data class M3uInfo(
    val name: String,
    val logoUrl: String?,
    val group: String?,
)

private fun parseExtInf(line: String): M3uInfo {
    val name = line.substringAfter(',', missingDelimiterValue = "")
        .trim()
        .ifBlank {
            readM3uAttribute(line, "tvg-name").orEmpty()
        }
    return M3uInfo(
        name = name,
        logoUrl = readM3uAttribute(line, "tvg-logo"),
        group = readM3uAttribute(line, "group-title"),
    )
}

private fun readM3uAttribute(line: String, key: String): String? {
    val marker = "$key=\""
    val start = line.indexOf(marker, ignoreCase = true)
    if (start < 0) return null
    val valueStart = start + marker.length
    val valueEnd = line.indexOf('"', startIndex = valueStart).takeIf { it >= 0 } ?: return null
    return line.substring(valueStart, valueEnd).trim()
}

private fun stableChannelId(streamUrl: String, index: Int): String =
    "live:${streamUrl.hashCode().toUInt().toString(16)}:$index"
