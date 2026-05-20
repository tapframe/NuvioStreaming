package com.nuvio.app.features.livetv

internal expect object LiveTvStorage {
    fun loadPlaylistUrl(): String?
    fun savePlaylistUrl(url: String)
}
