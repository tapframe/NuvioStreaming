package com.nuvio.tv.data.remote.api

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path

interface ParentalGuideApi {

    @GET("movie/{imdbId}")
    suspend fun getMovieGuide(
        @Path("imdbId") imdbId: String
    ): Response<ParentalGuideResponse>

    @GET("tv/{imdbId}/{season}/{episode}")
    suspend fun getTVGuide(
        @Path("imdbId") imdbId: String,
        @Path("season") season: Int,
        @Path("episode") episode: Int
    ): Response<ParentalGuideResponse>
}

@JsonClass(generateAdapter = true)
data class ParentalGuideResponse(
    @Json(name = "imdbId") val imdbId: String? = null,
    @Json(name = "parentalGuide") val parentalGuide: ParentalGuideData? = null,
    @Json(name = "hasData") val hasData: Boolean = false,
    @Json(name = "seriesId") val seriesId: String? = null,
    @Json(name = "season") val season: Int? = null,
    @Json(name = "episode") val episode: Int? = null,
    @Json(name = "cached") val cached: Boolean? = null
)

@JsonClass(generateAdapter = true)
data class ParentalGuideData(
    @Json(name = "nudity") val nudity: String? = null,
    @Json(name = "violence") val violence: String? = null,
    @Json(name = "profanity") val profanity: String? = null,
    @Json(name = "alcohol") val alcohol: String? = null,
    @Json(name = "frightening") val frightening: String? = null
)
