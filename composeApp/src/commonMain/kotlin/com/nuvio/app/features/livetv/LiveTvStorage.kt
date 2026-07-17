package com.nuvio.app.features.livetv

internal expect object LiveTvStorage {
    fun loadPlaylistUrl(): String?
    fun savePlaylistUrl(url: String)
    fun loadPlaylistsBlob(): String?
    fun savePlaylistsBlob(blob: String)
    fun loadFavoriteChannelIdsBlob(): String?
    fun saveFavoriteChannelIdsBlob(blob: String)
    fun loadLastWatchedChannelId(): String?
    fun saveLastWatchedChannelId(channelId: String)
    fun loadNavigationEnabled(): Boolean?
    fun saveNavigationEnabled(enabled: Boolean)
    fun publishNavigationVisibility(visible: Boolean)
}
