package com.nuvio.app.features.collection

import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.ManagedAddon

internal data class ResolvedCollectionCatalog(
    val addon: ManagedAddon,
    val catalog: AddonCatalog,
)

internal fun List<ManagedAddon>.findCollectionCatalog(
    source: CollectionCatalogSource,
): ResolvedCollectionCatalog? {
    val declaredAddon = firstOrNull { it.manifest?.id == source.addonId }
    val declaredCatalog = declaredAddon?.manifest?.catalogs?.findSourceCatalog(source)
    if (declaredAddon != null && declaredCatalog != null) {
        return ResolvedCollectionCatalog(addon = declaredAddon, catalog = declaredCatalog)
    }

    return firstNotNullOfOrNull { addon ->
        val catalog = addon.manifest?.catalogs?.find {
            it.id == source.catalogId && it.type == source.type
        } ?: return@firstNotNullOfOrNull null
        ResolvedCollectionCatalog(addon = addon, catalog = catalog)
    }
}

internal fun List<AvailableCatalog>.findAvailableCatalog(
    source: CollectionCatalogSource,
): AvailableCatalog? {
    val declaredCatalogs = filter { it.addonId == source.addonId }
    return declaredCatalogs.findSourceCatalog(source)
        ?: firstOrNull { it.catalogId == source.catalogId && it.type == source.type }
}

private fun List<AddonCatalog>.findSourceCatalog(source: CollectionCatalogSource): AddonCatalog? =
    find { it.id == source.catalogId && it.type == source.type }
        ?: find { it.id == source.catalogId.substringBefore(",") && it.type == source.type }

private fun List<AvailableCatalog>.findSourceCatalog(source: CollectionCatalogSource): AvailableCatalog? =
    find { it.catalogId == source.catalogId && it.type == source.type }
        ?: find { it.catalogId == source.catalogId.substringBefore(",") && it.type == source.type }

