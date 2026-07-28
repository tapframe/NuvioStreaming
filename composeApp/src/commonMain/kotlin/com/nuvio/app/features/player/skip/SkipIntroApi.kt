package com.nuvio.app.features.player.skip

import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.addons.httpPostJsonWithHeaders
import kotlinx.serialization.json.Json

internal object SkipIntroApi {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private const val ANISKIP_BASE = "https://api.aniskip.com/v2/"
    private const val ARM_BASE = "https://arm.haglund.dev/api/v2/"
    private const val ANIMESKIP_BASE = "https://api.anime-skip.com/"
    private const val SKIPDB_BASE = "https://api.skipdb.tv"

    // --- SkipDB ---

    suspend fun getSkipDbSegments(
        imdbId: String,
        season: Int,
        episode: Int,
        durationSec: Double? = null,
    ): SkipDbSegmentsResponse? {
        val baseUrl = SKIPDB_BASE.trimEnd('/')
        var url = "$baseUrl/api/segments?imdb_id=$imdbId&season=$season&episode=$episode"
        if (durationSec != null && durationSec > 0) {
            url += "&duration=${durationSec.toLong()}"
        }
        return try {
            val text = httpGetText(url)
            json.decodeFromString<SkipDbSegmentsResponse>(text)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun submitSegment(
        apiKey: String,
        request: SubmitSegmentRequest,
    ): Boolean {
        val baseUrl = SKIPDB_BASE.trimEnd('/')
        if (apiKey.isBlank()) return false
        val url = "$baseUrl/api/segments"
        val body = json.encodeToString(SubmitSegmentRequest.serializer(), request)
        val headers = mapOf(
            "Authorization" to "Bearer $apiKey",
            "Content-Type" to "application/json"
        )
        return try {
            val response = com.nuvio.app.features.addons.httpRequestRaw(
                method = "POST",
                url = url,
                headers = headers,
                body = body
            )
            response.status == 200 || response.status == 201
        } catch (_: Exception) {
            false
        }
    }

    suspend fun verifySkipDbApiKey(apiKey: String): Boolean {
        val baseUrl = SKIPDB_BASE.trimEnd('/')
        if (apiKey.isBlank()) return false
        val url = "$baseUrl/api/segments"
        val headers = mapOf(
            "Authorization" to "Bearer $apiKey",
            "Content-Type" to "application/json"
        )
        return try {
            val response = com.nuvio.app.features.addons.httpRequestRaw(
                method = "POST",
                url = url,
                headers = headers,
                body = "{}"
            )
            if (response.status == 400 || response.status == 422) return true
            if (response.status == 200 || response.status == 201) return true
            if (response.status == 401 || response.status == 403) return false
            false
        } catch (_: Exception) {
            false
        }
    }

    // --- AniSkip ---

    suspend fun getAniSkipTimes(
        malId: String,
        episode: Int,
    ): AniSkipResponse? {
        val types = "op,ed,recap,mixed-op,mixed-ed"
        val url = "${ANISKIP_BASE}skip-times/$malId/$episode?types=$types&episodeLength=0"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<AniSkipResponse>(text)
        } catch (_: Exception) {
            null
        }
    }

    // --- ARM API (ID resolution) ---

    suspend fun resolveImdbToAll(imdbId: String): List<ArmEntry> {
        val url = "${ARM_BASE}imdb?id=$imdbId&include=myanimelist,anilist,kitsu"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<List<ArmEntry>>(text)
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun resolveMalToImdb(malId: String): ArmEntry? {
        val url = "${ARM_BASE}ids?source=myanimelist&id=$malId&include=imdb"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<ArmEntry>(text)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun resolveMalToAnilist(malId: String): ArmEntry? {
        val url = "${ARM_BASE}ids?source=myanimelist&id=$malId&include=anilist"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<ArmEntry>(text)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun resolveKitsuToMal(kitsuId: String): ArmEntry? {
        val url = "${ARM_BASE}ids?source=kitsu&id=$kitsuId&include=myanimelist"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<ArmEntry>(text)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun resolveKitsuToAnilist(kitsuId: String): ArmEntry? {
        val url = "${ARM_BASE}ids?source=kitsu&id=$kitsuId&include=anilist"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<ArmEntry>(text)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun resolveKitsuToImdb(kitsuId: String): ArmEntry? {
        val url = "${ARM_BASE}ids?source=kitsu&id=$kitsuId&include=imdb"
        return try {
            val text = httpGetText(url)
            json.decodeFromString<ArmEntry>(text)
        } catch (_: Exception) {
            null
        }
    }

    // --- Anime-Skip GraphQL ---

    suspend fun queryAnimeSkip(clientId: String, graphqlQuery: String): AnimeSkipGraphqlResponse? {
        val body = json.encodeToString(
            kotlinx.serialization.json.JsonObject.serializer(),
            kotlinx.serialization.json.buildJsonObject {
                put("query", kotlinx.serialization.json.JsonPrimitive(graphqlQuery))
            }
        )
        val headers = mapOf(
            "X-Client-ID" to clientId,
            "Content-Type" to "application/json",
        )
        return try {
            val text = httpPostJsonWithHeaders(ANIMESKIP_BASE + "graphql", body, headers)
            json.decodeFromString<AnimeSkipGraphqlResponse>(text)
        } catch (_: Exception) {
            null
        }
    }
}
