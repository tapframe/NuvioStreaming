package com.nuvio.app.features.tmdb

internal expect object AnimeIdCacheStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
    fun clear()
}
