package com.nuvio.app.features.p2p

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object P2pSettingsStorage {
    private const val p2pEnabledKey = "p2p_enabled"
    private const val enableUploadKey = "enable_upload"
    private const val hideTorrentStatsKey = "hide_torrent_stats"
    private val store = DesktopStorage.store("torrent_settings")

    actual fun loadP2pEnabled(): Boolean? = loadBoolean(p2pEnabledKey)
    actual fun saveP2pEnabled(enabled: Boolean) = saveBoolean(p2pEnabledKey, enabled)
    actual fun loadEnableUpload(): Boolean? = loadBoolean(enableUploadKey)
    actual fun saveEnableUpload(enabled: Boolean) = saveBoolean(enableUploadKey, enabled)
    actual fun loadHideTorrentStats(): Boolean? = loadBoolean(hideTorrentStatsKey)
    actual fun saveHideTorrentStats(enabled: Boolean) = saveBoolean(hideTorrentStatsKey, enabled)

    private fun loadBoolean(key: String): Boolean? = store.getBoolean(ProfileScopedKey.of(key))
    private fun saveBoolean(key: String, value: Boolean) = store.putBoolean(ProfileScopedKey.of(key), value)
}
