package com.nuvio.app.features.watchprogress

import android.content.Context
import android.content.SharedPreferences

actual object ContinueWatchingEnrichmentStorage {
    private const val preferencesName = "nuvio_cw_enrichment"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadPayload(key: String): String? =
        preferences?.getString(key, null)

    actual fun savePayload(key: String, payload: String) {
        preferences
            ?.edit()
            ?.putString(key, payload)
            ?.apply()
    }

    actual fun removePayload(key: String) {
        preferences
            ?.edit()
            ?.remove(key)
            ?.apply()
    }
}
