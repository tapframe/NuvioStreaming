package com.nuvio.app.features.search

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSNumber
import platform.Foundation.NSUserDefaults

actual object SearchHistoryStorage {
    private const val payloadKey = "search_history_payload"
    private const val limitOverrideKey = "search_history_limit_override"

    actual fun loadPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(payloadKey))

    actual fun savePayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = ProfileScopedKey.of(payloadKey))
    }

    actual fun loadLimitOverride(): Int? {
        val key = ProfileScopedKey.of(limitOverrideKey)
        val stored = NSUserDefaults.standardUserDefaults.objectForKey(key) ?: return null
        return (stored as? NSNumber)?.intValue
    }

    actual fun saveLimitOverride(limit: Int?) {
        val key = ProfileScopedKey.of(limitOverrideKey)
        if (limit == null) {
            NSUserDefaults.standardUserDefaults.removeObjectForKey(key)
        } else {
            NSUserDefaults.standardUserDefaults.setInteger(limit.toLong(), forKey = key)
        }
    }
}
