package com.nuvio.app.features.profiles

import com.nuvio.app.core.storage.DesktopStorage

internal actual object ProfilePinCacheStorage {
    private val store = DesktopStorage.store("nuvio_profile_pin_cache")

    actual fun loadPayload(profileIndex: Int): String? =
        store.getString(key(profileIndex))

    actual fun savePayload(profileIndex: Int, payload: String) {
        store.putString(key(profileIndex), payload)
    }

    actual fun removePayload(profileIndex: Int) {
        store.remove(key(profileIndex))
    }

    private fun key(profileIndex: Int): String = "profile_pin_$profileIndex"
}
