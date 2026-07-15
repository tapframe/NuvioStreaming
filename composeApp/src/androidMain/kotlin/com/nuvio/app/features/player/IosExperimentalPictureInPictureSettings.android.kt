package com.nuvio.app.features.player

internal actual object IosExperimentalPictureInPictureSettingsStorage {
    actual val isAvailable: Boolean = false
    actual fun loadSinglePrimaryRendererEnabled(): Boolean = false
    actual fun saveSinglePrimaryRendererEnabled(enabled: Boolean) = Unit
}
