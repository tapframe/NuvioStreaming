package com.nuvio.tv.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class MetaResponseDto(
    @Json(name = "meta") val meta: MetaDto? = null
)

@JsonClass(generateAdapter = true)
data class MetaDto(
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
    @Json(name = "runtime") val runtime: String? = null,
    // Stremio addons are inconsistent here (string vs list). Keep it tolerant.
    @Json(name = "director") val director: Any? = null,
    // Addons are inconsistent: may be `writer` (string/list) or `writers`.
    @Json(name = "writer") val writer: Any? = null,
    @Json(name = "writers") val writers: Any? = null,
    @Json(name = "cast") val cast: Any? = null,
    @Json(name = "videos") val videos: List<VideoDto>? = null,
    @Json(name = "country") val country: String? = null,
    @Json(name = "awards") val awards: String? = null,
    @Json(name = "language") val language: String? = null,
    @Json(name = "links") val links: List<MetaLinkDto>? = null,
    @Json(name = "app_extras") val appExtras: AppExtrasDto? = null
)

@JsonClass(generateAdapter = true)
data class AppExtrasDto(
    @Json(name = "cast") val cast: List<AppExtrasCastMemberDto>? = null
)

@JsonClass(generateAdapter = true)
data class AppExtrasCastMemberDto(
    @Json(name = "name") val name: String,
    @Json(name = "character") val character: String? = null,
    @Json(name = "photo") val photo: String? = null
)

@JsonClass(generateAdapter = true)
data class VideoDto(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String? = null,
    @Json(name = "title") val title: String? = null,
    @Json(name = "released") val released: String? = null,
    @Json(name = "thumbnail") val thumbnail: String? = null,
    @Json(name = "season") val season: Int? = null,
    @Json(name = "episode") val episode: Int? = null,
    @Json(name = "number") val number: Int? = null,
    @Json(name = "overview") val overview: String? = null,
    @Json(name = "description") val description: String? = null
)

@JsonClass(generateAdapter = true)
data class MetaLinkDto(
    @Json(name = "name") val name: String,
    @Json(name = "category") val category: String,
    @Json(name = "url") val url: String? = null
)
