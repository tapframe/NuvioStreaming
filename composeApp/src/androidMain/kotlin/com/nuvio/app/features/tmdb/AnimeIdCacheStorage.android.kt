package com.nuvio.app.features.tmdb

import android.content.Context
import android.content.SharedPreferences

internal actual object AnimeIdCacheStorage {
    private const val PREFERENCES_NAME = "nuvio_anime_id_cache"
    private const val PAYLOAD_KEY = "anime_tmdb_mappings_v1"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    }

    actual fun loadPayload(): String? = preferences?.getString(PAYLOAD_KEY, null)

    actual fun savePayload(payload: String) {
        preferences?.edit()?.putString(PAYLOAD_KEY, payload)?.apply()
    }

    actual fun clear() {
        preferences?.edit()?.remove(PAYLOAD_KEY)?.apply()
    }
}
