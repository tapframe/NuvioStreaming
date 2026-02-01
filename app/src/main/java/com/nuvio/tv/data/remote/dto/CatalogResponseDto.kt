package com.nuvio.tv.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class CatalogResponseDto(
    @Json(name = "metas") val metas: List<MetaPreviewDto> = emptyList()
)

@JsonClass(generateAdapter = true)
data class MetaPreviewDto(
    @Json(name = "id") val id: String,
    @Json(name = "type") val type: String,
    @Json(name = "name") val name: String,
    @Json(name = "poster") val poster: String? = null,
    @Json(name = "posterShape") val posterShape: String? = null,
    @Json(name = "background") val background: String? = null,
    @Json(name = "logo") val logo: String? = null,
    @Json(name = "description") val description: String? = null,
    @Json(name = "releaseInfo") val releaseInfo: String? = null,
    @Json(name = "imdbRating") val imdbRating: String? = null,
    @Json(name = "genres") val genres: List<String>? = null,
    @Json(name = "runtime") val runtime: String? = null
)
