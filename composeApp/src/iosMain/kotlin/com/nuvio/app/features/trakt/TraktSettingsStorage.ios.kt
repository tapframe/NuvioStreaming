package com.nuvio.app.features.trakt

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

internal actual object TraktSettingsStorage {
    private const val payloadKey = "trakt_settings_payload"
    private const val pendingWatchProgressSourceKey = "pending_watch_progress_source"

    actual fun loadPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(payloadKey))

    actual fun savePayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = ProfileScopedKey.of(payloadKey))
    }

    actual fun loadPendingWatchProgressSourcePayload(profileId: Int): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(
            ProfileScopedKey.of(pendingWatchProgressSourceKey, profileId),
        )

    actual fun savePendingWatchProgressSourcePayload(profileId: Int, payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(
            payload,
            forKey = ProfileScopedKey.of(pendingWatchProgressSourceKey, profileId),
        )
    }

    actual fun clearPendingWatchProgressSourcePayload(profileId: Int) {
        NSUserDefaults.standardUserDefaults.removeObjectForKey(
            ProfileScopedKey.of(pendingWatchProgressSourceKey, profileId),
        )
    }
}
