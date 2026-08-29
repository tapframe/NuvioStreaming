package com.nuvio.app.features.cast

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class CastTranscodeMode {
    DISABLED,   // no transcode, only proxy
    AUTO,       // transcode HEVC/AV1 -> AVC when needed (default)
    ALWAYS,     // always transcode to AVC/AAC (for very old TVs)
}

enum class CastMaxResolution(val label: String, val width: Int, val height: Int) {
    SOURCE("Źródłowa", 0, 0),
    P1080("1080p", 1920, 1080),
    P720("720p", 1280, 720),
    P480("480p", 854, 480),
}

data class CastSettingsUiState(
    val proxyEnabled: Boolean = true,
    val transcodeMode: CastTranscodeMode = CastTranscodeMode.AUTO,
    val maxResolution: CastMaxResolution = CastMaxResolution.P1080,
    val useHardwareAcceleration: Boolean = true,
    val transcodeAudioToAac: Boolean = true,
)

object CastSettingsRepository {
    private val _uiState = MutableStateFlow(CastSettingsUiState())
    val uiState: StateFlow<CastSettingsUiState> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var proxyEnabled = true
    private var transcodeMode = CastTranscodeMode.AUTO
    private var maxResolution = CastMaxResolution.P1080
    private var useHardwareAcceleration = true
    private var transcodeAudioToAac = true

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        proxyEnabled = true
        transcodeMode = CastTranscodeMode.AUTO
        maxResolution = CastMaxResolution.P1080
        useHardwareAcceleration = true
        transcodeAudioToAac = true
        publish()
    }

    fun setProxyEnabled(enabled: Boolean) {
        ensureLoaded()
        if (proxyEnabled == enabled) return
        proxyEnabled = enabled
        CastSettingsStorage.saveProxyEnabled(enabled)
        publish()
    }

    fun setTranscodeMode(mode: CastTranscodeMode) {
        ensureLoaded()
        if (transcodeMode == mode) return
        transcodeMode = mode
        CastSettingsStorage.saveTranscodeMode(mode.name)
        publish()
    }

    fun setMaxResolution(resolution: CastMaxResolution) {
        ensureLoaded()
        if (maxResolution == resolution) return
        maxResolution = resolution
        CastSettingsStorage.saveMaxResolution(resolution.name)
        publish()
    }

    fun setUseHardwareAcceleration(enabled: Boolean) {
        ensureLoaded()
        if (useHardwareAcceleration == enabled) return
        useHardwareAcceleration = enabled
        CastSettingsStorage.saveUseHardwareAcceleration(enabled)
        publish()
    }

    fun setTranscodeAudioToAac(enabled: Boolean) {
        ensureLoaded()
        if (transcodeAudioToAac == enabled) return
        transcodeAudioToAac = enabled
        CastSettingsStorage.saveTranscodeAudioToAac(enabled)
        publish()
    }

    fun shouldTranscodeForCodec(codec: String?): Boolean {
        ensureLoaded()
        if (!proxyEnabled) return false
        if (transcodeMode == CastTranscodeMode.DISABLED) return false
        if (transcodeMode == CastTranscodeMode.ALWAYS) return true
        // AUTO: transcode HEVC/H265/AV1/VP9 for old Samsung
        val normalized = codec?.lowercase()?.trim() ?: return false
        return normalized.contains("hevc") ||
            normalized.contains("h265") ||
            normalized.contains("x265") ||
            normalized.contains("hev1") ||
            normalized.contains("hvc1") ||
            normalized.contains("av1") ||
            normalized.contains("av01") ||
            normalized.contains("vp9") ||
            normalized.contains("vp09")
    }

    private fun loadFromDisk() {
        hasLoaded = true
        proxyEnabled = CastSettingsStorage.loadProxyEnabled() ?: true
        transcodeMode = CastSettingsStorage.loadTranscodeMode()
            ?.let { runCatching { CastTranscodeMode.valueOf(it) }.getOrNull() }
            ?: CastTranscodeMode.AUTO
        maxResolution = CastSettingsStorage.loadMaxResolution()
            ?.let { runCatching { CastMaxResolution.valueOf(it) }.getOrNull() }
            ?: CastMaxResolution.P1080
        useHardwareAcceleration = CastSettingsStorage.loadUseHardwareAcceleration() ?: true
        transcodeAudioToAac = CastSettingsStorage.loadTranscodeAudioToAac() ?: true
        publish()
    }

    private fun publish() {
        _uiState.value = CastSettingsUiState(
            proxyEnabled = proxyEnabled,
            transcodeMode = transcodeMode,
            maxResolution = maxResolution,
            useHardwareAcceleration = useHardwareAcceleration,
            transcodeAudioToAac = transcodeAudioToAac,
        )
    }
}

internal expect object CastSettingsStorage {
    fun loadProxyEnabled(): Boolean?
    fun saveProxyEnabled(enabled: Boolean)
    fun loadTranscodeMode(): String?
    fun saveTranscodeMode(mode: String)
    fun loadMaxResolution(): String?
    fun saveMaxResolution(resolution: String)
    fun loadUseHardwareAcceleration(): Boolean?
    fun saveUseHardwareAcceleration(enabled: Boolean)
    fun loadTranscodeAudioToAac(): Boolean?
    fun saveTranscodeAudioToAac(enabled: Boolean)
}
