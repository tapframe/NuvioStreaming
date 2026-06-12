package com.nuvio.app.features.search

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object SearchHistoryStorage {
    private val store = DesktopStorage.store("nuvio_search_history")

    actual fun loadPayload(): String? =
        store.getString(ProfileScopedKey.of("search_history"))

    actual fun savePayload(payload: String) {
        store.putString(ProfileScopedKey.of("search_history"), payload)
    }
}
