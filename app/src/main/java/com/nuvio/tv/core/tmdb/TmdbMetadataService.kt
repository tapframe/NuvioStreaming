package com.nuvio.tv.core.tmdb

import android.util.Log
import com.nuvio.tv.data.remote.api.TmdbApi
import com.nuvio.tv.data.remote.api.TmdbEpisode
import com.nuvio.tv.domain.model.ContentType
import com.nuvio.tv.domain.model.MetaCastMember
import com.nuvio.tv.domain.model.MetaCompany
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "TmdbMetadataService"
private const val TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"

@Singleton
class TmdbMetadataService @Inject constructor(
    private val tmdbApi: TmdbApi
) {
    // In-memory caches
    private val enrichmentCache = ConcurrentHashMap<String, TmdbEnrichment>()
    private val episodeCache = ConcurrentHashMap<String, Map<Pair<Int, Int>, TmdbEpisodeEnrichment>>()

    suspend fun fetchEnrichment(tmdbId: String, contentType: ContentType): TmdbEnrichment? =
        withContext(Dispatchers.IO) {
            val cacheKey = "$tmdbId:${contentType.name}"
            enrichmentCache[cacheKey]?.let { return@withContext it }

            val numericId = tmdbId.toIntOrNull() ?: return@withContext null
            val tmdbType = when (contentType) {
                ContentType.SERIES, ContentType.TV -> "tv"
                else -> "movie"
            }

            try {
                val details = when (tmdbType) {
                    "tv" -> tmdbApi.getTvDetails(numericId, TMDB_API_KEY)
                    else -> tmdbApi.getMovieDetails(numericId, TMDB_API_KEY)
                }.body()

                val credits = when (tmdbType) {
                    "tv" -> tmdbApi.getTvCredits(numericId, TMDB_API_KEY)
                    else -> tmdbApi.getMovieCredits(numericId, TMDB_API_KEY)
                }.body()

                val images = when (tmdbType) {
                    "tv" -> tmdbApi.getTvImages(numericId, TMDB_API_KEY)
                    else -> tmdbApi.getMovieImages(numericId, TMDB_API_KEY)
                }.body()

                val genres = details?.genres?.mapNotNull { genre ->
                    genre.name.trim().takeIf { name -> name.isNotBlank() }
                } ?: emptyList()
                val description = details?.overview?.takeIf { it.isNotBlank() }
                val releaseInfo = details?.releaseDate
                    ?: details?.firstAirDate
                val rating = details?.voteAverage
                val runtime = details?.runtime ?: details?.episodeRunTime?.firstOrNull()
                val countries = details?.productionCountries
                    ?.mapNotNull { it.name?.trim()?.takeIf { name -> name.isNotBlank() } }
                    ?.takeIf { it.isNotEmpty() }
                    ?: details?.originCountry?.takeIf { it.isNotEmpty() }
                val language = details?.originalLanguage?.takeIf { it.isNotBlank() }
                val productionCompanies = details?.productionCompanies
                    .orEmpty()
                    .mapNotNull { company ->
                        val name = company.name?.trim()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                        MetaCompany(
                            name = name,
                            logo = buildImageUrl(company.logoPath, size = "w300")
                        )
                    }
                val networks = details?.networks
                    .orEmpty()
                    .mapNotNull { network ->
                        val name = network.name?.trim()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                        MetaCompany(
                            name = name,
                            logo = buildImageUrl(network.logoPath, size = "w300")
                        )
                    }
                val poster = buildImageUrl(details?.posterPath, size = "w500")
                val backdrop = buildImageUrl(details?.backdropPath, size = "w1280")

                val logoPath = images?.logos
                    ?.sortedWith(
                        compareByDescending<com.nuvio.tv.data.remote.api.TmdbImage> { it.iso6391 == "en" }
                            .thenByDescending { it.iso6391 == null }
                    )
                    ?.firstOrNull()
                    ?.filePath

                val logo = buildImageUrl(logoPath, size = "w500")

                val castMembers = credits?.cast
                    .orEmpty()
                    .mapNotNull { member ->
                        val name = member.name?.trim()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                        MetaCastMember(
                            name = name,
                            character = member.character?.takeIf { it.isNotBlank() },
                            photo = buildImageUrl(member.profilePath, size = "w500")
                        )
                    }

                val director = credits?.crew
                    .orEmpty()
                    .filter { it.job.equals("Director", ignoreCase = true) }
                    .mapNotNull { it.name?.trim()?.takeIf { name -> name.isNotBlank() } }

                val writer = credits?.crew
                    .orEmpty()
                    .filter { crew ->
                        val job = crew.job?.lowercase() ?: ""
                        job.contains("writer") || job.contains("screenplay")
                    }
                    .mapNotNull { it.name?.trim()?.takeIf { name -> name.isNotBlank() } }

                if (
                    genres.isEmpty() && description == null && backdrop == null && logo == null &&
                    poster == null && castMembers.isEmpty() && director.isEmpty() && writer.isEmpty() &&
                    releaseInfo == null && rating == null && runtime == null && countries.isNullOrEmpty() && language == null &&
                    productionCompanies.isEmpty() && networks.isEmpty()
                ) {
                    return@withContext null
                }

                val enrichment = TmdbEnrichment(
                    description = description,
                    genres = genres,
                    backdrop = backdrop,
                    logo = logo,
                    poster = poster,
                    castMembers = castMembers,
                    releaseInfo = releaseInfo,
                    rating = rating,
                    runtimeMinutes = runtime,
                    director = director,
                    writer = writer,
                    productionCompanies = productionCompanies,
                    networks = networks,
                    countries = countries,
                    language = language
                )
                enrichmentCache[cacheKey] = enrichment
                enrichment
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch TMDB enrichment: ${e.message}", e)
                null
            }
        }

    suspend fun fetchEpisodeEnrichment(
        tmdbId: String,
        seasonNumbers: List<Int>
    ): Map<Pair<Int, Int>, TmdbEpisodeEnrichment> = withContext(Dispatchers.IO) {
        val cacheKey = "$tmdbId:${seasonNumbers.sorted().joinToString(",")}"
        episodeCache[cacheKey]?.let { return@withContext it }

        val numericId = tmdbId.toIntOrNull() ?: return@withContext emptyMap()
        val result = mutableMapOf<Pair<Int, Int>, TmdbEpisodeEnrichment>()

        seasonNumbers.distinct().forEach { season ->
            try {
                val response = tmdbApi.getTvSeasonDetails(numericId, season, TMDB_API_KEY)
                val episodes = response.body()?.episodes.orEmpty()
                episodes.forEach { ep ->
                    val epNum = ep.episodeNumber ?: return@forEach
                    result[season to epNum] = ep.toEnrichment()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to fetch TMDB season $season: ${e.message}")
            }
        }

        if (result.isNotEmpty()) {
            episodeCache[cacheKey] = result
        }
        result
    }

    private fun buildImageUrl(path: String?, size: String): String? {
        val clean = path?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return "https://image.tmdb.org/t/p/$size$clean"
    }
}

data class TmdbEnrichment(
    val description: String?,
    val genres: List<String>,
    val backdrop: String?,
    val logo: String?,
    val poster: String?,
    val castMembers: List<MetaCastMember>,
    val releaseInfo: String?,
    val rating: Double?,
    val runtimeMinutes: Int?,
    val director: List<String>,
    val writer: List<String>,
    val productionCompanies: List<MetaCompany>,
    val networks: List<MetaCompany>,
    val countries: List<String>?,
    val language: String?
)

data class TmdbEpisodeEnrichment(
    val title: String?,
    val overview: String?,
    val thumbnail: String?,
    val airDate: String?,
    val runtimeMinutes: Int?
)

private fun TmdbEpisode.toEnrichment(): TmdbEpisodeEnrichment {
    val title = name?.takeIf { it.isNotBlank() }
    val overview = overview?.takeIf { it.isNotBlank() }
    val thumbnail = stillPath?.takeIf { it.isNotBlank() }?.let { "https://image.tmdb.org/t/p/w500$it" }
    val airDate = airDate?.takeIf { it.isNotBlank() }
    return TmdbEpisodeEnrichment(
        title = title,
        overview = overview,
        thumbnail = thumbnail,
        airDate = airDate,
        runtimeMinutes = runtime
    )
}
