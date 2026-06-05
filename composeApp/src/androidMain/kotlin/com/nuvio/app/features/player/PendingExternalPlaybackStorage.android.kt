package com.nuvio.app.features.player

import android.content.Context
import android.content.SharedPreferences

actual object PendingExternalPlaybackStorage {
    private const val preferencesName = "nuvio_pending_external_playback"
    private const val key = "pending"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun load(): String? = preferences?.getString(key, null)

    actual fun save(value: String) {
        preferences?.edit()?.putString(key, value)?.apply()
    }

    actual fun clear() {
        preferences?.edit()?.remove(key)?.apply()
    }
}
