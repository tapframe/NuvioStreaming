package com.nuvio.tv.data.mapper

import com.nuvio.tv.data.remote.dto.MetaPreviewDto
import com.nuvio.tv.domain.model.ContentType
import com.nuvio.tv.domain.model.MetaPreview
import com.nuvio.tv.domain.model.PosterShape

fun MetaPreviewDto.toDomain(): MetaPreview {
    return MetaPreview(
        id = id,
        type = ContentType.fromString(type),
        name = name,
        poster = poster,
        posterShape = PosterShape.fromString(posterShape),
        background = background,
        description = description,
        releaseInfo = releaseInfo,
        imdbRating = imdbRating?.toFloatOrNull(),
        genres = genres ?: emptyList()
    )
}
