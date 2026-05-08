package com.nuvio.app.features.player.skip

import com.nuvio.app.features.player.PlayerSettingsRepository

object SkipIntroRepository {

    private val cache = HashMap<String, List<SkipInterval>>()
    private val imdbEntriesCache = HashMap<String, List<ArmEntry>>()
    private val animeSkipShowIdCache = HashMap<String, String>()
    private const val NO_ID = "__none__"

    private val introDbConfigured: Boolean
        get() = IntroDbConfig.URL.isNotBlank()

    suspend fun getSkipIntervals(imdbId: String?, season: Int, episode: Int): List<SkipInterval> {
        if (imdbId == null) return emptyList()
        val settings = PlayerSettingsRepository.uiState.value
        if (!settings.skipIntroEnabled) return emptyList()

        val cacheKey = "$imdbId:$season:$episode"
        cache[cacheKey]?.let { return it }

        if (introDbConfigured) {
            val result = fetchFromIntroDb(imdbId, season, episode)
            if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
        }

        val entries = resolveImdbEntries(imdbId)
        val malId = entries.getOrNull(season - 1)?.myanimelist?.toString()
            ?: entries.firstOrNull()?.myanimelist?.toString()
        if (malId != null) {
            val result = fetchFromAniSkip(malId, episode)
            if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
        }

        val seasonAnilistId = entries.getOrNull(season - 1)?.anilist?.toString()
        val fallbackAnilistId = entries.firstOrNull()?.anilist?.toString()
        for ((anilistId, seasonFilter) in listOfNotNull(
            seasonAnilistId?.let { it to null },
            if (fallbackAnilistId != null && fallbackAnilistId != seasonAnilistId) fallbackAnilistId to season else null
        )) {
            val result = fetchFromAnimeSkip(anilistId, episode, season = seasonFilter)
            if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
        }

        return emptyList<SkipInterval>().also { cache[cacheKey] = it }
    }

    suspend fun getSkipIntervalsForMal(malId: String, episode: Int): List<SkipInterval> {
        val settings = PlayerSettingsRepository.uiState.value
        if (!settings.skipIntroEnabled) return emptyList()

        val cacheKey = "mal:$malId:$episode"
        cache[cacheKey]?.let { return it }

        val aniSkipResult = fetchFromAniSkip(malId, episode)
        if (aniSkipResult.isNotEmpty()) return aniSkipResult.also { cache[cacheKey] = it }

        val imdbId = try {
            SkipIntroApi.resolveMalToImdb(malId)?.imdb
        } catch (_: Exception) { null }

        if (imdbId != null) {
            val entries = resolveImdbEntries(imdbId)
            val season = entries.indexOfFirst { it.myanimelist == malId.toIntOrNull() } + 1

            if (introDbConfigured) {
                val result = fetchFromIntroDb(imdbId, season, episode)
                if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
            }
            val seasonAnilistId = entries.getOrNull(season - 1)?.anilist?.toString()
            val fallbackAnilistId = entries.firstOrNull()?.anilist?.toString()
            for ((anilistId, seasonFilter) in listOfNotNull(
                seasonAnilistId?.let { it to null },
                if (fallbackAnilistId != null && fallbackAnilistId != seasonAnilistId) fallbackAnilistId to season else null
            )) {
                val result = fetchFromAnimeSkip(anilistId, episode, season = seasonFilter)
                if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
            }
        } else {
            val anilistId = try {
                SkipIntroApi.resolveMalToAnilist(malId)?.anilist?.toString()
            } catch (_: Exception) { null }
            if (anilistId != null) {
                val result = fetchFromAnimeSkip(anilistId, episode, season = null)
                if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
            }
        }

        return emptyList<SkipInterval>().also { cache[cacheKey] = it }
    }

    suspend fun getSkipIntervalsForKitsu(kitsuId: String, episode: Int): List<SkipInterval> {
        val settings = PlayerSettingsRepository.uiState.value
        if (!settings.skipIntroEnabled) return emptyList()

        val cacheKey = "kitsu:$kitsuId:$episode"
        cache[cacheKey]?.let { return it }

        val malId = try {
            SkipIntroApi.resolveKitsuToMal(kitsuId)?.myanimelist?.toString()
        } catch (_: Exception) { null }

        if (malId != null) {
            val result = fetchFromAniSkip(malId, episode)
            if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
        }

        val imdbId = try {
            SkipIntroApi.resolveKitsuToImdb(kitsuId)?.imdb
        } catch (_: Exception) { null }

        if (imdbId != null) {
            val entries = resolveImdbEntries(imdbId)
            val season = entries.indexOfFirst { it.kitsu == kitsuId.toIntOrNull() } + 1

            if (introDbConfigured) {
                val result = fetchFromIntroDb(imdbId, season, episode)
                if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
            }
            val seasonAnilistId = entries.getOrNull(season - 1)?.anilist?.toString()
            val fallbackAnilistId = entries.firstOrNull()?.anilist?.toString()
            for ((anilistId, seasonFilter) in listOfNotNull(
                seasonAnilistId?.let { it to null },
                if (fallbackAnilistId != null && fallbackAnilistId != seasonAnilistId) fallbackAnilistId to season else null
            )) {
                val result = fetchFromAnimeSkip(anilistId, episode, season = seasonFilter)
                if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
            }
        } else {
            val anilistId = try {
                SkipIntroApi.resolveKitsuToAnilist(kitsuId)?.anilist?.toString()
            } catch (_: Exception) { null }
            if (anilistId != null) {
                val result = fetchFromAnimeSkip(anilistId, episode, season = null)
                if (result.isNotEmpty()) return result.also { cache[cacheKey] = it }
            }
        }

        return emptyList<SkipInterval>().also { cache[cacheKey] = it }
    }

    private suspend fun fetchFromIntroDb(imdbId: String, season: Int, episode: Int): List<SkipInterval> {
        return try {
            val data = SkipIntroApi.getIntroDbSegments(imdbId, season, episode)
            if (data == null) return emptyList()
            listOfNotNull(
                data.intro.toSkipIntervalOrNull("intro"),
                data.recap.toSkipIntervalOrNull("recap"),
                data.outro.toSkipIntervalOrNull("outro"),
            )
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun IntroDbSegment?.toSkipIntervalOrNull(type: String): SkipInterval? {
        if (this == null) return null
        val start = startSec ?: startMs?.let { it / 1000.0 }
        val end = endSec ?: endMs?.let { it / 1000.0 }
        if (start == null || end == null || end <= start) return null
        return SkipInterval(startTime = start, endTime = end, type = type, provider = "introdb")
    }

    private suspend fun fetchFromAniSkip(malId: String, episode: Int): List<SkipInterval> {
        return try {
            val response = SkipIntroApi.getAniSkipTimes(malId, episode)
            if (response == null) return emptyList()
            if (!response.found) return emptyList()
            response.results?.map { result ->
                SkipInterval(
                    startTime = result.interval.startTime,
                    endTime = result.interval.endTime,
                    type = result.skipType,
                    provider = "aniskip",
                )
            } ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    private suspend fun fetchFromAnimeSkip(anilistId: String, episode: Int, season: Int?): List<SkipInterval> {
        val settings = PlayerSettingsRepository.uiState.value
        val clientId = settings.animeSkipClientId.trim()
        if (clientId.isBlank()) return emptyList()
        if (!settings.animeSkipEnabled) return emptyList()

        return try {
            val showIds = resolveAnimeSkipShowIds(anilistId, clientId)
            if (showIds.isEmpty()) return emptyList()

            for (showId in showIds) {
                val query = "{ findEpisodesByShowId(showId: \"$showId\") { season number timestamps { at type { name } } } }"
                val response = SkipIntroApi.queryAnimeSkip(clientId, query) ?: continue
                val episodes = response.data?.findEpisodesByShowId ?: continue

                val targetEpisode = episodes.firstOrNull { ep ->
                    ep.number?.toIntOrNull() == episode &&
                        (season == null || ep.season?.toIntOrNull() == season)
                } ?: continue

                val sorted = (targetEpisode.timestamps ?: continue).sortedBy { it.at }
                val result = sorted.mapIndexedNotNull { i, ts ->
                    val endTime = sorted.getOrNull(i + 1)?.at ?: Double.MAX_VALUE
                    val type = when (ts.type.name.lowercase()) {
                        "intro", "new intro" -> "op"
                        "credits" -> "ed"
                        "recap" -> "recap"
                        else -> return@mapIndexedNotNull null
                    }
                    SkipInterval(startTime = ts.at, endTime = endTime, type = type, provider = "animeskip")
                }
                if (result.isNotEmpty()) return result
            }
            emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    private suspend fun resolveAnimeSkipShowIds(anilistId: String, clientId: String): List<String> {
        animeSkipShowIdCache[anilistId]?.let { cached ->
            return if (cached == NO_ID) emptyList() else listOf(cached)
        }
        val query = "{ findShowsByExternalId(service: ANILIST, serviceId: \"$anilistId\") { id } }"
        val showIds = try {
            SkipIntroApi.queryAnimeSkip(clientId, query)
                ?.data?.findShowsByExternalId?.map { it.id } ?: emptyList()
        } catch (_: Exception) { emptyList() }

        if (showIds.size == 1) animeSkipShowIdCache[anilistId] = showIds[0]
        else if (showIds.isEmpty()) animeSkipShowIdCache[anilistId] = NO_ID
        return showIds
    }

    private suspend fun resolveImdbEntries(imdbId: String): List<ArmEntry> {
        imdbEntriesCache[imdbId]?.let { return it }
        return try {
            SkipIntroApi.resolveImdbToAll(imdbId)
        } catch (_: Exception) { emptyList() }.also { imdbEntriesCache[imdbId] = it }
    }

    suspend fun submitIntro(
        imdbId: String,
        season: Int,
        episode: Int,
        startSec: Double,
        endSec: Double,
        segmentType: String,
    ): Boolean {
        val settings = PlayerSettingsRepository.uiState.value
        val apiKey = settings.introDbApiKey.trim()
        if (!settings.introSubmitEnabled || apiKey.isBlank()) return false

        val request = SubmitIntroRequest(
            imdbId = imdbId,
            season = season,
            episode = episode,
            startSec = startSec,
            endSec = endSec,
            startMs = (startSec * 1000).toLong(),
            endMs = (endSec * 1000).toLong(),
            segmentType = segmentType,
        )

        return SkipIntroApi.submitIntro(apiKey, request)
    }

    suspend fun verifyIntroDbApiKey(apiKey: String): Boolean {
        return SkipIntroApi.verifyIntroDbApiKey(apiKey)
    }

    fun clearCache() {
        cache.clear()
        imdbEntriesCache.clear()
        animeSkipShowIdCache.clear()
    }
}
