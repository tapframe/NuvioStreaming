package com.nuvio.app.features.cast

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface UnifiedCastState {
    data object Idle : UnifiedCastState
    data object Scanning : UnifiedCastState
    data class DevicesFound(val devices: List<UnifiedCastDevice>) : UnifiedCastState
    data object NoDevices : UnifiedCastState
    data class Casting(val device: UnifiedCastDevice, val proxyUrl: String) : UnifiedCastState
    data class Error(val message: String) : UnifiedCastState
}

object UnifiedCastRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _state = MutableStateFlow<UnifiedCastState>(UnifiedCastState.Idle)
    val state: StateFlow<UnifiedCastState> = _state.asStateFlow()

    private val _devices = MutableStateFlow<List<UnifiedCastDevice>>(emptyList())
    val devices: StateFlow<List<UnifiedCastDevice>> = _devices.asStateFlow()

    private var scanJob: Job? = null
    private var castJob: Job? = null

    private var currentDevice: UnifiedCastDevice? = null
    private var currentProxyUrl: String? = null
    var isPaused = false
        private set

    fun startScan() {
        if (_state.value is UnifiedCastState.Scanning) return
        scanJob?.cancel()
        _state.value = UnifiedCastState.Scanning
        scanJob = scope.launch {
            try {
                val dlnaDeferred = async(Dispatchers.IO) {
                    try { DlnaCastPlatform.scanDevices(4000) } catch (_: Exception) { DlnaScanResult.Success(emptyList()) }
                }
                val castDeferred = async(Dispatchers.IO) {
                    try { ChromecastPlatform.scanDevices(4000) } catch (_: Exception) { emptyList<UnifiedCastDevice>() }
                }
                val dlnaResult = dlnaDeferred.await()
                val castDevices = castDeferred.await()

                val dlnaUnified = when (dlnaResult) {
                    is DlnaScanResult.Success -> dlnaResult.devices.map { d ->
                        UnifiedCastDevice(
                            id = d.id,
                            name = d.friendlyName,
                            protocol = CastProtocol.DLNA,
                            dlnaDevice = d,
                            ipAddress = d.ipAddress
                        )
                    }
                    else -> emptyList()
                }
                val all = (dlnaUnified + castDevices).distinctBy { it.id }
                _devices.value = all
                _state.value = if (all.isEmpty()) UnifiedCastState.NoDevices else UnifiedCastState.DevicesFound(all)
            } catch (e: Exception) {
                _state.value = UnifiedCastState.Error(e.message ?: "Błąd skanowania")
            }
        }
    }

    fun castToDevice(device: UnifiedCastDevice, dlnaRequest: DlnaCastRequest, chromecastPoster: String? = null) {
        castJob?.cancel()
        castJob = scope.launch {
            try {
                _state.value = UnifiedCastState.Casting(device, "")
                // Reuse same proxy preparation for both protocols (headers/ torrent)
                val proxyUrl = withContext(Dispatchers.IO) { DlnaCastPlatform.prepareProxyUrl(dlnaRequest) }
                currentDevice = device
                currentProxyUrl = proxyUrl
                _state.value = UnifiedCastState.Casting(device, proxyUrl)

                val success = withContext(Dispatchers.Main) {
                    when (device.protocol) {
                        CastProtocol.DLNA -> {
                            val d = device.dlnaDevice ?: return@withContext false
                            DlnaCastPlatform.castToDevice(d, dlnaRequest, proxyUrl)
                        }
                        CastProtocol.CHROMECAST -> {
                            val req = ChromecastMediaRequest(
                                proxyUrl = proxyUrl,
                                title = dlnaRequest.title,
                                subtitle = dlnaRequest.subtitle,
                                subtitleUrl = dlnaRequest.subtitleUrl,
                                mimeType = dlnaRequest.mimeType,
                                durationMs = dlnaRequest.durationMs,
                                startPositionMs = dlnaRequest.startPositionMs,
                                posterUrl = chromecastPoster,
                            )
                            ChromecastPlatform.castToDevice(device, req)
                        }
                    }
                }

                if (!success) {
                    _state.value = UnifiedCastState.Error("Nie udało się wysłać do ${device.name}")
                }
            } catch (e: Exception) {
                _state.value = UnifiedCastState.Error(e.message ?: "Błąd castowania")
            }
        }
    }

    fun pause() {
        val dev = currentDevice ?: return
        scope.launch {
            when (dev.protocol) {
                CastProtocol.DLNA -> dev.dlnaDevice?.let { DlnaCastPlatform.pausePlayback(it) }
                CastProtocol.CHROMECAST -> ChromecastPlatform.pause()
            }
            isPaused = true
        }
    }

    fun resume() {
        val dev = currentDevice ?: return
        scope.launch {
            when (dev.protocol) {
                CastProtocol.DLNA -> dev.dlnaDevice?.let { DlnaCastPlatform.resumePlayback(it) }
                CastProtocol.CHROMECAST -> ChromecastPlatform.resume()
            }
            isPaused = false
        }
    }

    fun seek(positionMs: Long) {
        val dev = currentDevice ?: return
        scope.launch {
            when (dev.protocol) {
                CastProtocol.DLNA -> dev.dlnaDevice?.let { DlnaCastPlatform.seekPlayback(it, positionMs) }
                CastProtocol.CHROMECAST -> ChromecastPlatform.seek(positionMs)
            }
        }
    }

    fun stop() {
        castJob?.cancel()
        val dev = currentDevice
        // Immediate UI - X działa od razu
        isPaused = false
        currentDevice = null
        currentProxyUrl = null
        _state.value = UnifiedCastState.Idle
        scope.launch(Dispatchers.IO) {
            try {
                when (dev?.protocol) {
                    CastProtocol.DLNA -> dev.dlnaDevice?.let { DlnaCastPlatform.stopPlayback(it) }
                    CastProtocol.CHROMECAST -> ChromecastPlatform.stop()
                    else -> {}
                }
            } catch (_: Exception) {}
            try {
                when (dev?.protocol) {
                    CastProtocol.DLNA -> DlnaCastPlatform.stopProxy()
                    CastProtocol.CHROMECAST -> {
                        ChromecastPlatform.disconnect()
                        DlnaCastPlatform.stopProxy()
                    }
                    else -> DlnaCastPlatform.stopProxy()
                }
            } catch (_: Exception) {}
        }
    }

    suspend fun getPosition(): Long? {
        val dev = currentDevice ?: return null
        return when (dev.protocol) {
            CastProtocol.DLNA -> dev.dlnaDevice?.let { DlnaCastPlatform.getPositionInfo(it) }
            CastProtocol.CHROMECAST -> ChromecastPlatform.getPosition()
        }
    }

    fun reset() {
        _devices.value = emptyList()
        _state.value = UnifiedCastState.Idle
    }
}
