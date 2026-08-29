package com.nuvio.app.features.cast

internal actual object ChromecastPlatform {
    actual suspend fun scanDevices(timeoutMs: Int): List<UnifiedCastDevice> = emptyList()
    actual suspend fun castToDevice(device: UnifiedCastDevice, request: ChromecastMediaRequest): Boolean = false
    actual suspend fun pause(): Boolean = false
    actual suspend fun resume(): Boolean = false
    actual suspend fun seek(positionMs: Long): Boolean = false
    actual suspend fun stop(): Boolean = false
    actual suspend fun getPosition(): Long? = null
    actual fun isConnected(): Boolean = false
    actual fun disconnect() {}
    actual fun initialize() {}
}
