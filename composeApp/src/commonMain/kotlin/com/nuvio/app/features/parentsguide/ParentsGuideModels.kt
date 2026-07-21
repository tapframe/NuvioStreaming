package com.nuvio.app.features.parentsguide

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ParentsGuideEnvelope(
    val success: Boolean,
    val data: ParentsGuideData,
)

@Serializable
data class ParentsGuideData(
    val identity: ParentsGuideIdentity,
    val guide: ParentsGuide,
)

@Serializable
data class ParentsGuideIdentity(
    val mediaType: String,
    val title: String = "",
    val releaseYear: Int? = null,
    val imdbId: String? = null,
    val tmdbId: Int? = null,
    val stremioId: String? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
)

@Serializable
data class ParentsGuide(
    val id: String,
    val overallStatus: ParentsGuideStatus,
    val overallSummary: String? = null,
    val minimumSuggestedAge: Int? = null,
    val editionLabel: String? = null,
    val contentVersion: Int = 1,
    val categories: List<ParentsGuideCategory> = emptyList(),
    val sources: List<ParentsGuideSource> = emptyList(),
)

@Serializable
enum class ParentsGuideStatus {
    @SerialName("available") AVAILABLE,
    @SerialName("partial") PARTIAL,
    @SerialName("unavailable") UNAVAILABLE,
    @SerialName("disputed") DISPUTED,
}

@Serializable
data class ParentsGuideCategory(
    val category: ParentsGuideCategoryType,
    val label: String = "",
    val severity: ParentsGuideSeverity,
    val summary: String? = null,
    val spoilerLevel: ParentsGuideSpoilerLevel = ParentsGuideSpoilerLevel.NONE,
    val scenes: List<ParentsGuideScene> = emptyList(),
)

@Serializable
enum class ParentsGuideCategoryType {
    @SerialName("sex_nudity") SEX_NUDITY,
    @SerialName("violence_gore") VIOLENCE_GORE,
    @SerialName("profanity") PROFANITY,
    @SerialName("alcohol_drugs_smoking") ALCOHOL_DRUGS_SMOKING,
    @SerialName("frightening_intense") FRIGHTENING_INTENSE,
}

@Serializable
enum class ParentsGuideSeverity {
    @SerialName("none") NONE,
    @SerialName("mild") MILD,
    @SerialName("moderate") MODERATE,
    @SerialName("severe") SEVERE,
    @SerialName("unknown") UNKNOWN,
}

@Serializable
enum class ParentsGuideSpoilerLevel {
    @SerialName("none") NONE,
    @SerialName("minor") MINOR,
    @SerialName("major") MAJOR,
}

@Serializable
data class ParentsGuideScene(
    val description: String,
    val startSeconds: Int? = null,
    val endSeconds: Int? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val spoilerLevel: ParentsGuideSpoilerLevel = ParentsGuideSpoilerLevel.NONE,
    val verificationStatus: String = "unverified",
)

@Serializable
data class ParentsGuideSource(
    val sourceType: String,
    val sourceName: String,
    val sourceUrl: String? = null,
    val sourceLicense: String? = null,
    val attributionText: String? = null,
)

data class ParentsGuideRequest(
    val mediaType: String,
    val imdbId: String? = null,
    val tmdbId: Int? = null,
    val stremioId: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
)

sealed interface ParentsGuideUiState {
    data object Loading : ParentsGuideUiState
    data class Available(val data: ParentsGuideData, val fromCache: Boolean = false, val isSeriesFallback: Boolean = false) : ParentsGuideUiState
    data class Unavailable(val fromCache: Boolean = false) : ParentsGuideUiState
    data class Error(val hasCachedData: Boolean = false) : ParentsGuideUiState
}

internal val categoryOrder = ParentsGuideCategoryType.entries.withIndex().associate { it.value to it.index }

internal fun orderedCategories(categories: List<ParentsGuideCategory>): List<ParentsGuideCategory> =
    categories.sortedBy { categoryOrder[it.category] ?: Int.MAX_VALUE }

internal fun visibleScenes(scenes: List<ParentsGuideScene>, showSpoilers: Boolean): List<ParentsGuideScene> =
    scenes.filter { showSpoilers || it.spoilerLevel == ParentsGuideSpoilerLevel.NONE }

internal fun formatGuideTimestamp(seconds: Int): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val remainder = seconds % 60
    return if (hours > 0) {
        "${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}"
    } else {
        "${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}"
    }
}
