package com.nuvio.app.features.search

import com.nuvio.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

actual object DiscoverSelectionStorage {
    private const val catalogKey = "discover_catalog_key"

    actual fun loadCatalogKey(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(catalogKey))

    actual fun saveCatalogKey(catalogKey: String) {
        NSUserDefaults.standardUserDefaults.setObject(
            catalogKey,
            forKey = ProfileScopedKey.of(DiscoverSelectionStorage.catalogKey),
        )
    }
}
