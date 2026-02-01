package com.nuvio.tv.domain.model

data class Addon(
    val id: String,
    val name: String,
    val version: String,
    val description: String?,
    val logo: String?,
    val baseUrl: String,
    val catalogs: List<CatalogDescriptor>,
    val types: List<ContentType>,
    val resources: List<AddonResource>
)

data class CatalogDescriptor(
    val type: ContentType,
    val id: String,
    val name: String,
    val extra: List<CatalogExtra> = emptyList()
)

data class CatalogExtra(
    val name: String,
    val isRequired: Boolean = false,
    val options: List<String>? = null
)

data class AddonResource(
    val name: String,
    val types: List<String>,
    val idPrefixes: List<String>?
)

