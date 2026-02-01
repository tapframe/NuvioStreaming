package com.nuvio.tv.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class StreamResponseDto(
    @Json(name = "streams") val streams: List<StreamDto>? = null
)

@JsonClass(generateAdapter = true)
data class StreamDto(
    @Json(name = "name") val name: String? = null,
    @Json(name = "title") val title: String? = null,
    @Json(name = "description") val description: String? = null,
    @Json(name = "url") val url: String? = null,
    @Json(name = "ytId") val ytId: String? = null,
    @Json(name = "infoHash") val infoHash: String? = null,
    @Json(name = "fileIdx") val fileIdx: Int? = null,
    @Json(name = "externalUrl") val externalUrl: String? = null,
    @Json(name = "behaviorHints") val behaviorHints: BehaviorHintsDto? = null,
    @Json(name = "sources") val sources: List<String>? = null,
    @Json(name = "subtitles") val subtitles: List<SubtitleDto>? = null
)

@JsonClass(generateAdapter = true)
data class BehaviorHintsDto(
    @Json(name = "notWebReady") val notWebReady: Boolean? = null,
    @Json(name = "bingeGroup") val bingeGroup: String? = null,
    @Json(name = "countryWhitelist") val countryWhitelist: List<String>? = null,
    @Json(name = "proxyHeaders") val proxyHeaders: ProxyHeadersDto? = null,
    @Json(name = "videoHash") val videoHash: String? = null,
    @Json(name = "videoSize") val videoSize: Long? = null,
    @Json(name = "filename") val filename: String? = null
)

@JsonClass(generateAdapter = true)
data class ProxyHeadersDto(
    @Json(name = "request") val request: Map<String, String>? = null,
    @Json(name = "response") val response: Map<String, String>? = null
)

@JsonClass(generateAdapter = true)
data class SubtitleDto(
    @Json(name = "id") val id: String? = null,
    @Json(name = "url") val url: String,
    @Json(name = "lang") val lang: String
)
