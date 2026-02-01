package com.nuvio.tv.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class AddonManifestDto(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "version") val version: String,
    @Json(name = "description") val description: String? = null,
    @Json(name = "logo") val logo: String? = null,
    @Json(name = "background") val background: String? = null,
    @Json(name = "catalogs") val catalogs: List<CatalogDescriptorDto> = emptyList(),
    @Json(name = "resources") val resources: List<Any> = emptyList(),
    @Json(name = "types") val types: List<String> = emptyList()
)

@JsonClass(generateAdapter = true)
data class CatalogDescriptorDto(
    @Json(name = "type") val type: String,
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "extra") val extra: List<ExtraDto>? = null
)

@JsonClass(generateAdapter = true)
data class ExtraDto(
    @Json(name = "name") val name: String,
    @Json(name = "isRequired") val isRequired: Boolean? = false,
    @Json(name = "options") val options: List<String>? = null
)
