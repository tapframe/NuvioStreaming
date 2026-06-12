package com.nuvio.app.features.trakt

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object TraktAuthStorage {
    private val store = DesktopStorage.store("nuvio_trakt_auth")

    actual fun loadPayload(): String? = store.getString("trakt_auth")

    actual fun savePayload(payload: String) {
        store.putString("trakt_auth", payload)
    }
}

internal actual object TraktLibraryStorage {
    private val store = DesktopStorage.store("nuvio_trakt_library")

    actual fun loadPayload(): String? =
        store.getString(ProfileScopedKey.of("trakt_library"))

    actual fun savePayload(payload: String) {
        store.putString(ProfileScopedKey.of("trakt_library"), payload)
    }
}

internal actual object TraktSettingsStorage {
    private val store = DesktopStorage.store("nuvio_trakt_settings")

    actual fun loadPayload(): String? =
        store.getString(ProfileScopedKey.of("trakt_settings"))

    actual fun savePayload(payload: String) {
        store.putString(ProfileScopedKey.of("trakt_settings"), payload)
    }
}
