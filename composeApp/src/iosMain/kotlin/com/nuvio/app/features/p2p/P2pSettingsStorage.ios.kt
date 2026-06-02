package com.nuvio.app.features.p2p

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

internal actual object P2pSettingsStorage {
    private const val p2pEnabledKey = "p2p_enabled"
    private const val enableUploadKey = "enable_upload"
    private const val hideTorrentStatsKey = "hide_torrent_stats"

    actual fun loadP2pEnabled(): Boolean? =
        loadBoolean(p2pEnabledKey)

    actual fun saveP2pEnabled(enabled: Boolean) {
        saveBoolean(p2pEnabledKey, enabled)
    }

    actual fun loadEnableUpload(): Boolean? =
        loadBoolean(enableUploadKey)

    actual fun saveEnableUpload(enabled: Boolean) {
        saveBoolean(enableUploadKey, enabled)
    }

    actual fun loadHideTorrentStats(): Boolean? =
        loadBoolean(hideTorrentStatsKey)

    actual fun saveHideTorrentStats(enabled: Boolean) {
        saveBoolean(hideTorrentStatsKey, enabled)
    }

    private fun loadBoolean(keyBase: String): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(keyBase)
        return if (defaults.objectForKey(key) != null) defaults.boolForKey(key) else null
    }

    private fun saveBoolean(keyBase: String, value: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(value, forKey = ProfileScopedKey.of(keyBase))
    }
}
