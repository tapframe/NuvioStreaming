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
data class CollectionFolder(
    val id: String,
    val title: String,
    val coverImageUrl: String? = null,
    val focusGifUrl: String? = null,
    val focusGifEnabled: Boolean = true,
    val coverEmoji: String? = null,
    val tileShape: String = "poster",
    val hideTitle: Boolean = false,
    val catalogSources: List<CollectionCatalogSource> = emptyList(),
) {
    val posterShape: PosterShape
        get() = when (tileShape.lowercase()) {
            "poster" -> PosterShape.Poster
            "landscape", "wide" -> PosterShape.Landscape
            "square" -> PosterShape.Square
            else -> PosterShape.Poster
        }
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
