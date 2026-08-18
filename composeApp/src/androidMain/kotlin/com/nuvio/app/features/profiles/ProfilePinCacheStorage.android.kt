package com.nuvio.app.features.profiles

import android.content.Context
import android.content.SharedPreferences

actual object ProfilePinCacheStorage {
    private const val preferencesName = "nuvio_profile_pin_cache"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadPayload(profileIndex: Int): String? =
        preferences?.getString(payloadKey(profileIndex), null)

    actual fun savePayload(profileIndex: Int, payload: String) {
        preferences
            ?.edit()
            ?.putString(payloadKey(profileIndex), payload)
            ?.commit()
    }

    actual fun removePayload(profileIndex: Int) {
        preferences
            ?.edit()
            ?.remove(payloadKey(profileIndex))
            ?.commit()
    }

    private fun payloadKey(profileIndex: Int): String = "profile_pin_cache_$profileIndex"
}
