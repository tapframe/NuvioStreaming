package com.nuvio.app.features.simkl

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object SimklSyncStorage {
    private const val PREFERENCES_NAME = "nuvio_simkl_sync"
    private const val PAYLOAD_KEY = "simkl_sync_snapshot"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    }

    actual fun loadPayload(): String? =
        preferences?.getString(ProfileScopedKey.of(PAYLOAD_KEY), null)

    actual fun savePayload(payload: String) {
        preferences?.edit()?.putString(ProfileScopedKey.of(PAYLOAD_KEY), payload)?.apply()
    }

    actual fun removeProfile(profileId: Int) {
        preferences?.edit()
            ?.remove(ProfileScopedKey.of(PAYLOAD_KEY, profileId))
            ?.apply()
    }
}
