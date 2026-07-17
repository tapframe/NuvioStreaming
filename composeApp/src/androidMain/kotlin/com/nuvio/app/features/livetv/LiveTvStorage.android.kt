package com.nuvio.app.features.livetv

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

actual object LiveTvStorage {
    private const val preferencesName = "nuvio_live_tv"
    private const val playlistUrlKey = "playlist_url"
    private const val playlistsBlobKey = "playlists_blob"
    private const val favoriteChannelIdsBlobKey = "favorite_channel_ids_blob"
    private const val lastWatchedChannelIdKey = "last_watched_channel_id"
    private const val navigationEnabledKey = "navigation_enabled"

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

    actual fun loadPlaylistsBlob(): String? =
        preferences?.getString(ProfileScopedKey.of(playlistsBlobKey), null)

    actual fun savePlaylistsBlob(blob: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(playlistsBlobKey), blob)
            ?.apply()
    }

    actual fun loadFavoriteChannelIdsBlob(): String? =
        preferences?.getString(ProfileScopedKey.of(favoriteChannelIdsBlobKey), null)

    actual fun saveFavoriteChannelIdsBlob(blob: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(favoriteChannelIdsBlobKey), blob)
            ?.apply()
    }

    actual fun loadLastWatchedChannelId(): String? =
        preferences?.getString(ProfileScopedKey.of(lastWatchedChannelIdKey), null)

    actual fun saveLastWatchedChannelId(channelId: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(lastWatchedChannelIdKey), channelId)
            ?.apply()
    }

    actual fun loadNavigationEnabled(): Boolean? {
        val preferences = preferences ?: return null
        val key = ProfileScopedKey.of(navigationEnabledKey)
        return if (preferences.contains(key)) preferences.getBoolean(key, true) else null
    }

    actual fun saveNavigationEnabled(enabled: Boolean) {
        preferences
            ?.edit()
            ?.putBoolean(ProfileScopedKey.of(navigationEnabledKey), enabled)
            ?.apply()
    }

    actual fun publishNavigationVisibility(visible: Boolean) = Unit
}
