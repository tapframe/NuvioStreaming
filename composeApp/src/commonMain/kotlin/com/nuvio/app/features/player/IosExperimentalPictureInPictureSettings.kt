package com.nuvio.app.features.player

internal expect object IosExperimentalPictureInPictureSettingsStorage {
    val isAvailable: Boolean
    fun loadSinglePrimaryRendererEnabled(): Boolean
    fun saveSinglePrimaryRendererEnabled(enabled: Boolean)
}
