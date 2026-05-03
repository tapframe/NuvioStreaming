package com.nuvio.app.features.trakt

import kotlinx.serialization.Serializable

@Serializable
internal data class TraktExternalIds(
    val trakt: Int? = null,
    val imdb: String? = null,
    val tmdb: Int? = null,
    val slug: String? = null,
)

internal fun parseTraktContentIds(contentId: String?): TraktExternalIds {
    if (contentId.isNullOrBlank()) return TraktExternalIds()
    val raw = contentId.trim()

    if (raw.startsWith("tt")) {
        return TraktExternalIds(imdb = raw.substringBefore(':'))
    }

    if (raw.startsWith("tmdb:", ignoreCase = true)) {
        return TraktExternalIds(tmdb = raw.substringAfter(':').toIntOrNull())
    }

    if (raw.startsWith("trakt:", ignoreCase = true)) {
        return TraktExternalIds(trakt = raw.substringAfter(':').toIntOrNull())
    }

    val numeric = raw.substringBefore(':').toIntOrNull()
    return if (numeric != null) {
        TraktExternalIds(trakt = numeric)
    } else {
        TraktExternalIds()
    }
}

internal fun normalizeTraktContentId(ids: TraktExternalIds?, fallback: String? = null): String {
    val imdb = ids?.imdb?.takeIf { it.isNotBlank() }
    if (!imdb.isNullOrBlank()) return imdb

    val tmdb = ids?.tmdb
    if (tmdb != null) return "tmdb:$tmdb"

    val trakt = ids?.trakt
    if (trakt != null) return "trakt:$trakt"

    return fallback?.takeIf { it.isNotBlank() } ?: ""
}

internal fun extractTraktYear(value: String?): Int? {
    if (value.isNullOrBlank()) return null
    return Regex("(\\d{4})").find(value)?.groupValues?.getOrNull(1)?.toIntOrNull()
}
