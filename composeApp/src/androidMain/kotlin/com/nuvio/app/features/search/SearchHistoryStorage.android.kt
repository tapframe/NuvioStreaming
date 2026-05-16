package com.nuvio.app.features.search

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

actual object SearchHistoryStorage {
    private const val preferencesName = "nuvio_search_history"
    private const val payloadKey = "search_history_payload"
    private const val limitOverrideKey = "search_history_limit_override"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadPayload(): String? =
        preferences?.getString(ProfileScopedKey.of(payloadKey), null)

    actual fun savePayload(payload: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(payloadKey), payload)
            ?.apply()
    }

    actual fun loadLimitOverride(): Int? {
        val key = ProfileScopedKey.of(limitOverrideKey)
        val prefs = preferences ?: return null
        return if (prefs.contains(key)) prefs.getInt(key, SearchHistoryDefaultLimit) else null
    }

    actual fun saveLimitOverride(limit: Int?) {
        val key = ProfileScopedKey.of(limitOverrideKey)
        preferences
            ?.edit()
            ?.apply {
                if (limit == null) {
                    remove(key)
                } else {
                    putInt(key, limit)
                }
            }
            ?.apply()
    }
}
