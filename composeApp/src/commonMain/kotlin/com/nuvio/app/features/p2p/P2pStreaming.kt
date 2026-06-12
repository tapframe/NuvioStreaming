package com.nuvio.app.features.p2p

import com.nuvio.app.core.build.AppFeaturePolicy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class P2pSettingsUiState(
    val p2pEnabled: Boolean = false,
    val enableUpload: Boolean = true,
    val hideTorrentStats: Boolean = true,
)

object P2pSettingsRepository {
    private val _uiState = MutableStateFlow(P2pSettingsUiState())
    val uiState: StateFlow<P2pSettingsUiState> = _uiState.asStateFlow()

    val isVisible: Boolean
        get() = AppFeaturePolicy.p2pEnabled

    private var hasLoaded = false
    private var p2pEnabled = false
    private var enableUpload = true
    private var hideTorrentStats = true

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        p2pEnabled = false
        enableUpload = true
        hideTorrentStats = true
        publish()
    }

    fun setP2pEnabled(enabled: Boolean) {
        ensureLoaded()
        if (p2pEnabled == enabled) return
        p2pEnabled = enabled
        P2pSettingsStorage.saveP2pEnabled(enabled)
        publish()
    }

    fun setEnableUpload(enabled: Boolean) {
        ensureLoaded()
        if (enableUpload == enabled) return
        enableUpload = enabled
        P2pSettingsStorage.saveEnableUpload(enabled)
        publish()
    }

    fun setHideTorrentStats(enabled: Boolean) {
        ensureLoaded()
        if (hideTorrentStats == enabled) return
        hideTorrentStats = enabled
        P2pSettingsStorage.saveHideTorrentStats(enabled)
        publish()
    }

    private fun loadFromDisk() {
        hasLoaded = true
        p2pEnabled = P2pSettingsStorage.loadP2pEnabled() ?: false
        enableUpload = P2pSettingsStorage.loadEnableUpload() ?: true
        hideTorrentStats = P2pSettingsStorage.loadHideTorrentStats() ?: true
        publish()
    }

    private fun publish() {
        _uiState.value = P2pSettingsUiState(
            p2pEnabled = p2pEnabled,
            enableUpload = enableUpload,
            hideTorrentStats = hideTorrentStats,
        )
    }
}

internal expect object P2pSettingsStorage {
    fun loadP2pEnabled(): Boolean?
    fun saveP2pEnabled(enabled: Boolean)
    fun loadEnableUpload(): Boolean?
    fun saveEnableUpload(enabled: Boolean)
    fun loadHideTorrentStats(): Boolean?
    fun saveHideTorrentStats(enabled: Boolean)
}

data class P2pStreamRequest(
    val infoHash: String,
    val fileIdx: Int?,
    val filename: String? = null,
    val trackers: List<String> = emptyList(),
)

sealed class P2pStreamingState {
    data object Idle : P2pStreamingState()
    data object Connecting : P2pStreamingState()

    data class Streaming(
        val localUrl: String,
        val downloadSpeed: Long,
        val uploadSpeed: Long,
        val peers: Int,
        val seeds: Int,
        val bufferProgress: Float,
        val totalProgress: Float,
        val preloadedBytes: Long = 0L,
    ) : P2pStreamingState()

    data class Error(val message: String) : P2pStreamingState()
}

class P2pStreamingException(message: String) : Exception(message)

expect object P2pStreamingEngine {
    val state: StateFlow<P2pStreamingState>
    suspend fun startStream(request: P2pStreamRequest): String
    fun stopStream()
    fun shutdown()
}

internal fun formatP2pSpeed(bytesPerSec: Long): String {
    return when {
        bytesPerSec >= 1_048_576 -> "${(bytesPerSec / 1_048_576.0).formatOneDecimal()} MB/s"
        bytesPerSec >= 1_024 -> "${(bytesPerSec / 1_024.0).formatNoDecimal()} KB/s"
        else -> "$bytesPerSec B/s"
    }
}

internal fun formatP2pMegabytes(bytes: Long): String =
    "${(bytes / 1_048_576.0).formatOneDecimal()} MB"

private fun Double.formatOneDecimal(): String {
    val rounded = kotlin.math.round(this * 10.0) / 10.0
    val whole = rounded.toLong()
    val fraction = ((rounded - whole) * 10.0).toInt()
    return "$whole.$fraction"
}

private fun Double.formatNoDecimal(): String =
    kotlin.math.round(this).toInt().toString()
