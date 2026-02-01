package com.nuvio.tv.domain.model

data class MetaPreview(
    val id: String,
    val type: ContentType,
    val name: String,
    val poster: String?,
    val posterShape: PosterShape,
    val background: String?,
    val description: String?,
    val releaseInfo: String?,
    val imdbRating: Float?,
    val genres: List<String>
)
