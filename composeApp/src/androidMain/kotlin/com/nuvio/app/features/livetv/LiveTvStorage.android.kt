package com.nuvio.app.features.livetv

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

actual object LiveTvStorage {
    private const val preferencesName = "nuvio_live_tv"
    private const val playlistUrlKey = "playlist_url"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadPlaylistUrl(): String? =
        preferences?.getString(ProfileScopedKey.of(playlistUrlKey), null)

    actual fun savePlaylistUrl(url: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(playlistUrlKey), url)
            ?.apply()
    }
}
