package com.nuvio.tv.data.repository

import android.util.Log
import com.nuvio.tv.data.remote.api.ParentalGuideApi
import com.nuvio.tv.data.remote.api.ParentalGuideResponse
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ParentalGuideRepository @Inject constructor(
    private val api: ParentalGuideApi
) {
    private val cache = ConcurrentHashMap<String, ParentalGuideResponse>()

    suspend fun getMovieGuide(imdbId: String): ParentalGuideResponse? {
        if (!imdbId.startsWith("tt")) return null

        val cacheKey = "movie:$imdbId"
        cache[cacheKey]?.let { return it }

        return try {
            val response = api.getMovieGuide(imdbId)
            if (response.isSuccessful && response.body()?.hasData == true) {
                response.body()!!.also { cache[cacheKey] = it }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e("ParentalGuide", "Failed to fetch movie guide", e)
            null
        }
    }

    suspend fun getTVGuide(imdbId: String, season: Int, episode: Int): ParentalGuideResponse? {
        if (!imdbId.startsWith("tt")) return null
        if (season < 0 || episode < 0) return null

        val cacheKey = "tv:$imdbId:$season:$episode"
        cache[cacheKey]?.let { return it }

        return try {
            val response = api.getTVGuide(imdbId, season, episode)
            if (response.isSuccessful && response.body()?.hasData == true) {
                response.body()!!.also { cache[cacheKey] = it }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e("ParentalGuide", "Failed to fetch TV guide", e)
            null
        }
    }
}
