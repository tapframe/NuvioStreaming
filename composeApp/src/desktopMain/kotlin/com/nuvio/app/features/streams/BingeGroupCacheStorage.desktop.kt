package com.nuvio.app.features.streams

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object BingeGroupCacheStorage {
    private val store = DesktopStorage.store("nuvio_binge_group_cache")

    actual fun load(hashedKey: String): String? =
        store.getString(ProfileScopedKey.of(hashedKey))

    actual fun save(hashedKey: String, value: String) {
        store.putString(ProfileScopedKey.of(hashedKey), value)
    }

    actual fun remove(hashedKey: String) {
        store.remove(ProfileScopedKey.of(hashedKey))
    }
}
