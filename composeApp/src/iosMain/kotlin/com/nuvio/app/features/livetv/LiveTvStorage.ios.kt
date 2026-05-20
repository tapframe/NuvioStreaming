package com.nuvio.app.features.livetv

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

actual object LiveTvStorage {
    private const val playlistUrlKey = "playlist_url"

    actual fun loadPlaylistUrl(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(playlistUrlKey))

    actual fun savePlaylistUrl(url: String) {
        NSUserDefaults.standardUserDefaults.setObject(url, forKey = ProfileScopedKey.of(playlistUrlKey))
    }
}
