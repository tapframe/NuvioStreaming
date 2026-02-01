package com.nuvio.tv.domain.model

data class SavedLibraryItem(
    val id: String,
    val type: String,
    val name: String,
    val poster: String?,
    val posterShape: PosterShape,
    val background: String?,
    val description: String?,
    val releaseInfo: String?,
    val imdbRating: Float?,
    val genres: List<String>,
    val addonBaseUrl: String?
) {
    fun toMetaPreview(): MetaPreview {
        return MetaPreview(
            id = id,
            type = ContentType.fromString(type),
            name = name,
            poster = poster,
            posterShape = posterShape,
            background = background,
            description = description,
            releaseInfo = releaseInfo,
            imdbRating = imdbRating,
            genres = genres
        )
    }
}
