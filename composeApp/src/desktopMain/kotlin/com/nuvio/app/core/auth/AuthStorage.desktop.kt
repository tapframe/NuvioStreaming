package com.nuvio.app.core.auth

import com.nuvio.app.core.storage.DesktopStorage

internal actual object AuthStorage {
    private val store = DesktopStorage.store("nuvio_auth")

    actual fun loadAnonymousUserId(): String? =
        store.getString("anonymous_user_id")

    actual fun saveAnonymousUserId(userId: String) {
        store.putString("anonymous_user_id", userId)
    }

    actual fun clearAnonymousUserId() {
        store.remove("anonymous_user_id")
    }
}
