package com.nuvio.app.features.trakt

import kotlinx.serialization.Serializable

private val traktHostPattern = Regex("""^[a-z0-9.-]*trakt\.tv/""", RegexOption.IGNORE_CASE)

@Serializable
internal data class TraktImagesDto(
    val fanart: List<String>? = null,
    val poster: List<String>? = null,
    val logo: List<String>? = null,
    val clearart: List<String>? = null,
    val banner: List<String>? = null,
    val thumb: List<String>? = null,
)

internal fun List<String>?.firstTraktImageUrl(): String? {
    return orEmpty()
        .firstOrNull { it.isNotBlank() }
        ?.toTraktImageUrl()
}

internal fun String.toTraktImageUrl(): String {
    val normalized = trim()
    return when {
        normalized.startsWith("https://", ignoreCase = true) -> normalized
        normalized.startsWith("http://", ignoreCase = true) -> "https://${normalized.substringAfter("://")}"
        normalized.startsWith("//") -> "https:$normalized"
        traktHostPattern.containsMatchIn(normalized) -> "https://$normalized"
        else -> normalized
    }
}

internal fun TraktImagesDto?.traktPosterUrl(): String? = this?.poster.firstTraktImageUrl()

internal fun TraktImagesDto?.traktFanartUrl(): String? = this?.fanart.firstTraktImageUrl()

internal fun TraktImagesDto?.traktLogoUrl(): String? = this?.logo.firstTraktImageUrl()

internal fun TraktImagesDto?.traktClearartUrl(): String? = this?.clearart.firstTraktImageUrl()

internal fun TraktImagesDto?.traktBannerUrl(): String? = this?.banner.firstTraktImageUrl()

internal fun TraktImagesDto?.traktThumbUrl(): String? = this?.thumb.firstTraktImageUrl()

internal fun TraktImagesDto?.traktBestPosterUrl(): String? {
    return traktPosterUrl() ?: traktFanartUrl()
}

internal fun TraktImagesDto?.traktBestBackdropUrl(): String? {
    return traktFanartUrl() ?: traktBannerUrl() ?: traktThumbUrl() ?: traktPosterUrl()
}

internal fun TraktImagesDto?.traktBestLandscapeUrl(): String? {
    return traktThumbUrl() ?: traktFanartUrl() ?: traktBannerUrl() ?: traktPosterUrl()
}

internal fun TraktImagesDto?.traktBestLogoUrl(): String? {
    return traktLogoUrl() ?: traktClearartUrl()
}
