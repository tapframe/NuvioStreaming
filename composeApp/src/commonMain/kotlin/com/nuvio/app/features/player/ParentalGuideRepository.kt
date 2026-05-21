package com.nuvio.app.features.player

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpRequestRaw
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private const val PARENTAL_GUIDE_BASE_URL = "https://api.imdbapi.dev"
private val imdbIdPattern = Regex("tt\\d+")

data class ParentalGuideResult(
    val nudity: String? = null,
    val violence: String? = null,
    val profanity: String? = null,
    val alcohol: String? = null,
    val frightening: String? = null,
)

data class ParentalWarning(
    val label: String,
    val severity: String,
)

internal data class ParentalGuideLabels(
    val nudity: String,
    val violence: String,
    val profanity: String,
    val alcohol: String,
    val frightening: String,
    val severe: String,
    val moderate: String,
    val mild: String,
)

internal object ParentalGuideRepository {
    private val log = Logger.withTag("ParentalGuide")
    private val json = Json { ignoreUnknownKeys = true }
    private val cache = mutableMapOf<String, ParentalGuideResult?>()
    private val cacheMutex = Mutex()

    suspend fun getParentalGuide(imdbId: String): ParentalGuideResult? {
        val normalizedImdbId = extractParentalGuideImdbId(imdbId) ?: return null

        cacheMutex.withLock {
            if (cache.containsKey(normalizedImdbId)) {
                return cache[normalizedImdbId]
            }
        }

        val result = runCatching {
            val response = httpRequestRaw(
                method = "GET",
                url = "$PARENTAL_GUIDE_BASE_URL/titles/$normalizedImdbId/parentsGuide",
                headers = mapOf("Accept" to "application/json"),
                body = "",
            )
            if (response.status !in 200..299 || response.body.isBlank()) {
                return@runCatching null
            }
            val body = json.decodeFromString<ImdbApiParentsGuideResponse>(response.body)
            val categories = body.parentsGuide
            if (categories.isEmpty()) null else mapParentalGuideCategoriesToResult(categories)
        }.onFailure { error ->
            log.w(error) { "Failed to fetch parental guide for $normalizedImdbId" }
        }.getOrNull()

        cacheMutex.withLock {
            cache[normalizedImdbId] = result
        }
        return result
    }
}

internal fun mapParentalGuideCategoriesToResult(
    categories: List<ImdbApiParentsGuideCategory>,
): ParentalGuideResult {
    val categoryMap = categories.associateBy { it.category.uppercase() }

    return ParentalGuideResult(
        nudity = resolveParentalGuideSeverity(categoryMap["SEXUAL_CONTENT"]),
        violence = resolveParentalGuideSeverity(categoryMap["VIOLENCE"]),
        profanity = resolveParentalGuideSeverity(categoryMap["PROFANITY"]),
        alcohol = resolveParentalGuideSeverity(categoryMap["ALCOHOL_DRUGS"]),
        frightening = resolveParentalGuideSeverity(categoryMap["FRIGHTENING_INTENSE_SCENES"]),
    )
}

internal fun resolveParentalGuideSeverity(category: ImdbApiParentsGuideCategory?): String? {
    val breakdowns = category?.severityBreakdowns ?: return null
    val dominant = breakdowns
        .filter { it.severityLevel.lowercase() != "none" }
        .maxByOrNull { it.voteCount }
    val noneVotes = breakdowns
        .firstOrNull { it.severityLevel.lowercase() == "none" }
        ?.voteCount ?: 0

    if (dominant == null || dominant.voteCount <= noneVotes) return null
    return dominant.severityLevel.lowercase()
}

internal fun buildParentalWarnings(
    guide: ParentalGuideResult,
    labels: ParentalGuideLabels,
): List<ParentalWarning> {
    val severityOrder = mapOf(
        "severe" to 0,
        "moderate" to 1,
        "mild" to 2,
    )

    return listOfNotNull(
        guide.nudity?.let { "nudity" to it },
        guide.violence?.let { "violence" to it },
        guide.profanity?.let { "profanity" to it },
        guide.alcohol?.let { "alcohol" to it },
        guide.frightening?.let { "frightening" to it },
    )
        .sortedBy { severityOrder[it.second.lowercase()] ?: 3 }
        .map { (category, severity) ->
            ParentalWarning(
                label = when (category) {
                    "nudity" -> labels.nudity
                    "violence" -> labels.violence
                    "profanity" -> labels.profanity
                    "alcohol" -> labels.alcohol
                    "frightening" -> labels.frightening
                    else -> category
                },
                severity = when (severity.lowercase()) {
                    "severe" -> labels.severe
                    "moderate" -> labels.moderate
                    "mild" -> labels.mild
                    else -> severity
                },
            )
        }
        .take(5)
}

internal fun extractParentalGuideImdbId(value: String?): String? =
    value
        ?.let { imdbIdPattern.find(it)?.value }
        ?.takeIf { it.startsWith("tt") }

internal fun extractParentalGuideTmdbId(value: String?): Int? {
    val normalized = value?.trim()?.takeIf(String::isNotBlank) ?: return null
    if (normalized.all(Char::isDigit)) return normalized.toIntOrNull()
    if (normalized.startsWith("tmdb:", ignoreCase = true)) {
        return normalized.substringAfter(':').substringBefore(':').toIntOrNull()
    }

    val tokens = normalized.split(':', '/', '|')
    val tmdbIndex = tokens.indexOfFirst { it.equals("tmdb", ignoreCase = true) }
    return tokens.getOrNull(tmdbIndex + 1)?.toIntOrNull()
}

@Serializable
internal data class ImdbApiParentsGuideResponse(
    @SerialName("parentsGuide") val parentsGuide: List<ImdbApiParentsGuideCategory> = emptyList(),
)

@Serializable
internal data class ImdbApiParentsGuideCategory(
    @SerialName("category") val category: String = "",
    @SerialName("severityBreakdowns") val severityBreakdowns: List<ImdbApiSeverityBreakdown>? = null,
)

@Serializable
internal data class ImdbApiSeverityBreakdown(
    @SerialName("severityLevel") val severityLevel: String = "",
    @SerialName("voteCount") val voteCount: Int = 0,
)
