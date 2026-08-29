package com.nuvio.app.features.cast

data class DlnaDevice(
    val id: String, // UDN
    val friendlyName: String,
    val modelName: String? = null,
    val manufacturer: String? = null,
    val locationUrl: String, // http://ip:7676/smp_15_...
    val controlUrl: String, // absolute URL for AVTransport
    val eventSubUrl: String? = null,
    val avTransportServiceType: String = "urn:schemas-upnp-org:service:AVTransport:1",
    val ipAddress: String? = null,
)

data class DlnaCastRequest(
    val sourceUrl: String,
    val sourceHeaders: Map<String, String> = emptyMap(),
    val title: String,
    val subtitle: String? = null,
    val mimeType: String = "video/mp4",
    val codecHint: String? = null, // hevc, avc, av1 ...
    val durationMs: Long? = null,
)

sealed interface DlnaCastState {
    data object Idle : DlnaCastState
    data object Scanning : DlnaCastState
    data class DevicesFound(val devices: List<DlnaDevice>) : DlnaCastState
    data object NoDevices : DlnaCastState
    data class Casting(val device: DlnaDevice, val proxyUrl: String) : DlnaCastState
    data class Error(val message: String) : DlnaCastState
}

sealed interface DlnaScanResult {
    data class Success(val devices: List<DlnaDevice>) : DlnaScanResult
    data class Failure(val message: String) : DlnaScanResult
}
