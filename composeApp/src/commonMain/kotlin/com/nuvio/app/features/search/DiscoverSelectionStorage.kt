package com.nuvio.app.features.search

internal expect object DiscoverSelectionStorage {
    fun loadCatalogKey(): String?
    fun saveCatalogKey(catalogKey: String)
}
