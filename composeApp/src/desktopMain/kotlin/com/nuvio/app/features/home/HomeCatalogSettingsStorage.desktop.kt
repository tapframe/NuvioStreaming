package com.nuvio.app.features.home

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object HomeCatalogSettingsStorage {
    private val store = DesktopStorage.store("nuvio_home_catalog_settings")

    actual fun loadPayload(): String? =
        store.getString(ProfileScopedKey.of("home_catalog_settings"))

    actual fun savePayload(payload: String) {
        store.putString(ProfileScopedKey.of("home_catalog_settings"), payload)
    }
}
