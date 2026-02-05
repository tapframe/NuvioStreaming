package com.nuvio.tv.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class SubtitleResponseDto(
    @Json(name = "subtitles") val subtitles: List<SubtitleItemDto>? = null
)

@JsonClass(generateAdapter = true)
data class SubtitleItemDto(
    @Json(name = "id") val id: String? = null,
    @Json(name = "url") val url: String,
    @Json(name = "lang") val lang: String
)
