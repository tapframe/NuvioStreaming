package com.nuvio.app.features.search

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.storage.ProfileScopedKey

actual object DiscoverSelectionStorage {
    private const val preferencesName = "nuvio_discover_selection"
    private const val catalogKey = "discover_catalog_key"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadCatalogKey(): String? =
        preferences?.getString(ProfileScopedKey.of(catalogKey), null)

    actual fun saveCatalogKey(catalogKey: String) {
        preferences
            ?.edit()
            ?.putString(ProfileScopedKey.of(DiscoverSelectionStorage.catalogKey), catalogKey)
            ?.apply()
    }
}
