package com.nuvio.app.features.watched

import com.nuvio.app.core.storage.DesktopStorage

actual object WatchedStorage {
    private val store = DesktopStorage.store("nuvio_watched")

    actual fun loadPayload(profileId: Int): String? =
        store.getString("watched_$profileId")

    actual fun savePayload(profileId: Int, payload: String) {
        store.putString("watched_$profileId", payload)
    }
}
