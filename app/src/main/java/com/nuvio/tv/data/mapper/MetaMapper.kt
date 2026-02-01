package com.nuvio.tv.data.mapper

import com.nuvio.tv.data.remote.dto.MetaDto
import com.nuvio.tv.data.remote.dto.MetaLinkDto
import com.nuvio.tv.data.remote.dto.VideoDto
import com.nuvio.tv.domain.model.ContentType
import com.nuvio.tv.domain.model.Meta
import com.nuvio.tv.domain.model.MetaCastMember
import com.nuvio.tv.domain.model.MetaLink
import com.nuvio.tv.domain.model.PosterShape
import com.nuvio.tv.domain.model.Video

fun MetaDto.toDomain(): Meta {
    return Meta(
        id = id,
        type = ContentType.fromString(type),
        name = name,
        poster = poster,
        posterShape = PosterShape.fromString(posterShape),
        background = background,
        logo = logo,
        description = description,
        releaseInfo = releaseInfo,
        imdbRating = imdbRating?.toFloatOrNull(),
        genres = genres ?: emptyList(),
        runtime = runtime,
        director = coerceStringList(director),
        writer = coerceStringList(writer).ifEmpty { coerceStringList(writers) },
        cast = coerceStringList(cast),
        castMembers = appExtras?.cast
            .orEmpty()
            .mapNotNull { castMember ->
                val name = castMember.name.trim()
                if (name.isBlank()) return@mapNotNull null
                MetaCastMember(
                    name = name,
                    character = castMember.character?.takeIf { it.isNotBlank() },
                    photo = castMember.photo?.takeIf { it.isNotBlank() }
                )
            },
        videos = videos?.map { it.toDomain() } ?: emptyList(),
        productionCompanies = emptyList(),
        networks = emptyList(),
        country = country,
        awards = awards,
        language = language,
        links = links?.mapNotNull { it.toDomain() } ?: emptyList()
    )
}

private fun coerceStringList(value: Any?): List<String> {
    return when (value) {
        null -> emptyList()
        is String -> listOf(value)
        is List<*> -> value.filterIsInstance<String>()
        is Map<*, *> -> {
            // Some addons may return an object; try a couple common keys.
            val name = value["name"] as? String
            if (!name.isNullOrBlank()) listOf(name) else emptyList()
        }
        else -> emptyList()
    }
}

fun VideoDto.toDomain(): Video {
    return Video(
        id = id,
        title = name ?: title ?: "Episode ${episode ?: number ?: 0}",
        released = released,
        thumbnail = thumbnail,
        season = season,
        episode = episode ?: number,
        overview = overview ?: description
    )
}

fun MetaLinkDto.toDomain(): MetaLink? {
    return url?.let {
        MetaLink(
            name = name,
            category = category,
            url = it
        )
    }
}
