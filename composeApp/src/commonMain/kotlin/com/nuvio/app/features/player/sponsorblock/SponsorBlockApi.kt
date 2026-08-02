package com.nuvio.app.features.player.sponsorblock

import com.nuvio.app.features.addons.httpGetText
import kotlinx.serialization.json.Json

/**
 * SponsorBlock API client.
 *
 * Communicates with the SponsorBlock public API to retrieve crowd-sourced
 * skip segments for video content identified by YouTube videoId.
 *
 * API docs: https://wiki.sponsor.ajay.app/w/API_Docs
 */
internal object SponsorBlockApi {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private const val BASE_URL = "https://sponsor.ajay.app/api"

    /**
     * Fetches skip segments for a given YouTube video ID.
     *
     * @param videoId The YouTube video ID (11 characters).
     * @param categories The segment categories to request.
     * @return List of segments, or empty list on failure.
     */
    suspend fun getSkipSegments(
        videoId: String,
        categories: List<SponsorBlockCategory> = SponsorBlockCategory.DEFAULT_CATEGORIES,
    ): List<SponsorBlockSegment> {
        if (videoId.isBlank()) return emptyList()
        val categoriesParam = categories.joinToString(",") { "\"${it.apiValue}\"" }
        val url = "$BASE_URL/skipSegments?videoID=$videoId&categories=[$categoriesParam]"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<List<SponsorBlockSegment>>(text)
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Fetches skip segments using a video hash prefix (privacy-friendly).
     * Uses the first 4 characters of the SHA-256 hash of the videoId.
     *
     * @param hashPrefix First 4 hex chars of SHA-256(videoId).
     * @param categories The segment categories to request.
     * @return List of video segment results matching the hash prefix.
     */
    suspend fun getSkipSegmentsByHash(
        hashPrefix: String,
        categories: List<SponsorBlockCategory> = SponsorBlockCategory.DEFAULT_CATEGORIES,
    ): List<SponsorBlockHashResult> {
        if (hashPrefix.length < 4) return emptyList()
        val categoriesParam = categories.joinToString(",") { "\"${it.apiValue}\"" }
        val url = "$BASE_URL/skipSegments/$hashPrefix?categories=[$categoriesParam]"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<List<SponsorBlockHashResult>>(text)
        } catch (_: Exception) {
            emptyList()
        }
    }
}
