package com.nuvio.app.features.plugins

import platform.Foundation.NSUserDefaults
import platform.Foundation.timeIntervalSince1970

internal object PluginStorage {
    private const val pluginsStateKey = "plugins_state"

    fun loadState(profileId: Int): String? =
        NSUserDefaults.standardUserDefaults.stringForKey("${pluginsStateKey}_$profileId")

    fun saveState(profileId: Int, payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(
            payload,
            forKey = "${pluginsStateKey}_$profileId",
        )
    }
}

internal fun currentPluginPlatform(): String = "ios"

internal fun currentEpochMillis(): Long =
    (platform.Foundation.NSDate().timeIntervalSince1970 * 1000.0).toLong()
