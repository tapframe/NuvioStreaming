package com.nuvio.app.features.p2p

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object P2pSettingsStorage {
    private const val preferencesName = "torrent_settings"
    private const val p2pEnabledKey = "p2p_enabled"
    private const val enableUploadKey = "enable_upload"
    private const val hideTorrentStatsKey = "hide_torrent_stats"
    private const val torrentProfileKey = "torrent_profile"
    private const val cacheSizeKey = "cache_size"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

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

    actual fun loadTorrentProfile(): String? = loadString(torrentProfileKey)

    actual fun saveTorrentProfile(profile: String) {
        saveString(torrentProfileKey, profile)
    }

    actual fun loadCacheSize(): String? = loadString(cacheSizeKey)

    actual fun saveCacheSize(size: String) {
        saveString(cacheSizeKey, size)
    }

    private fun loadBoolean(keyBase: String): Boolean? =
        preferences?.let { sharedPreferences ->
            val key = ProfileScopedKey.of(keyBase)
            if (sharedPreferences.contains(key)) {
                sharedPreferences.getBoolean(key, false)
            } else {
                null
            }
        }

    private fun saveBoolean(keyBase: String, value: Boolean) {
        preferences
            ?.edit()
            ?.putBoolean(ProfileScopedKey.of(keyBase), value)
            ?.apply()
    }

    private fun loadString(keyBase: String): String? =
        preferences?.getString(ProfileScopedKey.of(keyBase), null)

    private fun saveString(keyBase: String, value: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(keyBase), value)
            ?.apply()
    }
}
