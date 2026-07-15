package com.nuvio.app.features.player

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

internal actual object IosExperimentalPictureInPictureSettingsStorage {
    actual val isAvailable: Boolean = true
    private const val singlePrimaryRendererEnabledKey = "ios_experimental_single_primary_pip_renderer_enabled"

    actual fun loadSinglePrimaryRendererEnabled(): Boolean {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(singlePrimaryRendererEnabledKey)
        return if (defaults.objectForKey(key) != null) defaults.boolForKey(key) else false
    }

    actual fun saveSinglePrimaryRendererEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(
            enabled,
            forKey = ProfileScopedKey.of(singlePrimaryRendererEnabledKey),
        )
    }
}
