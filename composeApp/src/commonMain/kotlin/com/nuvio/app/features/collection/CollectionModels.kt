package com.nuvio.app.features.collection

import androidx.compose.runtime.Immutable
import com.nuvio.app.features.home.PosterShape
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class FolderViewMode {
    TABBED_GRID,
    ROWS,
    FOLLOW_LAYOUT;

    companion object {
        fun fromString(value: String): FolderViewMode =
            when {
                value.equals(FOLLOW_LAYOUT.name, ignoreCase = true) -> ROWS
                value.equals(ROWS.name, ignoreCase = true) -> ROWS
                value.equals(TABBED_GRID.name, ignoreCase = true) -> TABBED_GRID
                else -> TABBED_GRID
            }
    }
}

@Immutable
@Serializable
data class CollectionCatalogSource(
    val addonId: String,
    val type: String,
    val catalogId: String,
    val genre: String? = null,
)

@Immutable
@Serializable
data class CollectionSource(
    val provider: String = "addon",
    val addonId: String? = null,
    val type: String? = null,
    val catalogId: String? = null,
    val genre: String? = null,
    val tmdbSourceType: String? = null,
    val title: String? = null,
    val tmdbId: Int? = null,
    val traktListId: Long? = null,
    val mediaType: String? = null,
    val sortBy: String? = null,
    val sortHow: String? = null,
    val filters: TmdbCollectionFilters? = null,
) {
    val isTmdb: Boolean
        get() = provider.equals("tmdb", ignoreCase = true)

    val isTrakt: Boolean
        get() = provider.equals("trakt", ignoreCase = true)

    fun addonCatalogSource(): CollectionCatalogSource? {
        if (isTmdb || isTrakt) return null
        val sourceAddonId = addonId?.takeIf { it.isNotBlank() } ?: return null
        val sourceType = type?.takeIf { it.isNotBlank() } ?: return null
        val sourceCatalogId = catalogId?.takeIf { it.isNotBlank() } ?: return null
        return CollectionCatalogSource(
            addonId = sourceAddonId,
            type = sourceType,
            catalogId = sourceCatalogId,
            genre = genre.normalizedOptionalGenre(),
        )
    }
}

internal fun CollectionSource.hasInvalidTraktListId(): Boolean =
    isTrakt && (traktListId == null || traktListId <= 0L)

@Serializable
enum class TmdbCollectionSourceType {
    LIST,
    COLLECTION,
    COMPANY,
    NETWORK,
    DISCOVER,
    PERSON,
    DIRECTOR,
}

@Serializable
enum class TmdbCollectionMediaType(val value: String) {
    MOVIE("movie"),
    TV("tv");

    companion object {
        fun fromString(value: String?): TmdbCollectionMediaType =
            when (value?.trim()?.lowercase()) {
                "tv", "series" -> TV
                else -> MOVIE
            }
    }
}

enum class TmdbCollectionSort(val value: String) {
    ORIGINAL("original"),
    POPULAR_DESC("popularity.desc"),
    VOTE_AVERAGE_DESC("vote_average.desc"),
    RELEASE_DATE_DESC("primary_release_date.desc"),
    FIRST_AIR_DATE_DESC("first_air_date.desc"),
}

enum class TraktListSort(val value: String) {
    RANK("rank"),
    ADDED("added"),
    TITLE("title"),
    RELEASED("released"),
    RUNTIME("runtime"),
    POPULARITY("popularity"),
    PERCENTAGE("percentage"),
    VOTES("votes");

    companion object {
        fun normalize(value: String?): String {
            val raw = value?.trim()?.lowercase().orEmpty()
            return entries.firstOrNull { it.value == raw }?.value ?: RANK.value
        }
    }
}

enum class TraktSortHow(val value: String) {
    ASC("asc"),
    DESC("desc");

    companion object {
        fun normalize(value: String?): String {
            val raw = value?.trim()?.lowercase().orEmpty()
            return entries.firstOrNull { it.value == raw }?.value ?: ASC.value
        }
    }
}

@Immutable
@Serializable
data class TmdbCollectionFilters(
    val withGenres: String? = null,
    val releaseDateGte: String? = null,
    val releaseDateLte: String? = null,
    val voteAverageGte: Double? = null,
    val voteAverageLte: Double? = null,
    val voteCountGte: Int? = null,
    val withOriginalLanguage: String? = null,
    val withOriginCountry: String? = null,
    val withKeywords: String? = null,
    val withCompanies: String? = null,
    val withNetworks: String? = null,
    val year: Int? = null,
)

data class TmdbSourceImportMetadata(
    val title: String? = null,
    val coverImageUrl: String? = null,
)

data class TmdbPresetSource(
    val label: String,
    val source: CollectionSource,
)

@Immutable
@Serializable
data class CollectionFolder(
    val id: String,
    val title: String,
    val coverImageUrl: String? = null,
    val focusGifUrl: String? = null,
    val focusGifEnabled: Boolean = true,
    val coverEmoji: String? = null,
    val tileShape: String = "poster",
    val hideTitle: Boolean = false,
    val sources: List<CollectionSource> = emptyList(),
    val catalogSources: List<CollectionCatalogSource> = emptyList(),
    val heroBackdropUrl: String? = null,
    val heroVideoUrl: String? = null,
    val titleLogoUrl: String? = null,
) {
    val posterShape: PosterShape
        get() = when (tileShape.lowercase()) {
            "poster" -> PosterShape.Poster
            "landscape", "wide" -> PosterShape.Landscape
            "square" -> PosterShape.Square
            else -> PosterShape.Poster
        }

    val resolvedSources: List<CollectionSource>
        get() = sources.ifEmpty {
            catalogSources.map { source ->
                CollectionSource(
                    provider = "addon",
                    addonId = source.addonId,
                    type = source.type,
                    catalogId = source.catalogId,
                    genre = source.genre.normalizedOptionalGenre(),
                )
            }
        }

    val resolvedCatalogSources: List<CollectionCatalogSource>
        get() = resolvedSources.mapNotNull { it.addonCatalogSource() }
}

@Immutable
@Serializable
data class Collection(
    val id: String,
    val title: String,
    val backdropImageUrl: String? = null,
    val pinToTop: Boolean = false,
    val viewMode: String = "TABBED_GRID",
    val showAllTab: Boolean = true,
    val folders: List<CollectionFolder> = emptyList(),
) {
    val folderViewMode: FolderViewMode
        get() = FolderViewMode.fromString(viewMode)
}

private fun String?.normalizedOptionalGenre(): String? =
    this
        ?.trim()
        ?.takeIf { it.isNotEmpty() && !it.equals("none", ignoreCase = true) }

data class AvailableCatalog(
    val addonId: String,
    val addonName: String,
    val type: String,
    val catalogId: String,
    val catalogName: String,
    val genreOptions: List<String> = emptyList(),
    val genreRequired: Boolean = false,
)

@Serializable
data class SupabaseCollectionBlob(
    @SerialName("profile_id") val profileId: Int = 1,
    @SerialName("collections_json") val collectionsJson: kotlinx.serialization.json.JsonElement = kotlinx.serialization.json.JsonArray(emptyList()),
    @SerialName("updated_at") val updatedAt: String? = null,
)

data class ValidationResult(
    val valid: Boolean,
    val error: String? = null,
    val collectionCount: Int = 0,
    val folderCount: Int = 0,
)
