package com.nuvio.app.features.livetv

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSNotificationCenter
import platform.Foundation.NSUserDefaults

actual object LiveTvStorage {
    private const val playlistUrlKey = "playlist_url"
    private const val playlistsBlobKey = "playlists_blob"
    private const val favoriteChannelIdsBlobKey = "favorite_channel_ids_blob"
    private const val lastWatchedChannelIdKey = "last_watched_channel_id"
    private const val navigationEnabledKey = "navigation_enabled"
    private const val nativeNavigationVisibleKey = "NuvioLiveTvNavigationVisible"
    private const val nativeNavigationDidChangeNotification = "NuvioLiveTvNavigationVisibilityDidChange"

    actual fun loadPlaylistUrl(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(playlistUrlKey))

    actual fun savePlaylistUrl(url: String) {
        NSUserDefaults.standardUserDefaults.setObject(url, forKey = ProfileScopedKey.of(playlistUrlKey))
    }

    actual fun loadPlaylistsBlob(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(playlistsBlobKey))

    actual fun savePlaylistsBlob(blob: String) {
        NSUserDefaults.standardUserDefaults.setObject(blob, forKey = ProfileScopedKey.of(playlistsBlobKey))
    }

    actual fun loadFavoriteChannelIdsBlob(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(favoriteChannelIdsBlobKey))

    actual fun saveFavoriteChannelIdsBlob(blob: String) {
        NSUserDefaults.standardUserDefaults.setObject(blob, forKey = ProfileScopedKey.of(favoriteChannelIdsBlobKey))
    }

    actual fun loadLastWatchedChannelId(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(lastWatchedChannelIdKey))

    actual fun saveLastWatchedChannelId(channelId: String) {
        NSUserDefaults.standardUserDefaults.setObject(channelId, forKey = ProfileScopedKey.of(lastWatchedChannelIdKey))
    }

    actual fun loadNavigationEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(navigationEnabledKey)
        return if (defaults.objectForKey(key) == null) null else defaults.boolForKey(key)
    }

    actual fun saveNavigationEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(
            enabled,
            forKey = ProfileScopedKey.of(navigationEnabledKey),
        )
    }

    actual fun publishNavigationVisibility(visible: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(visible, forKey = nativeNavigationVisibleKey)
        NSNotificationCenter.defaultCenter.postNotificationName(
            nativeNavigationDidChangeNotification,
            null,
        )
    }
}
