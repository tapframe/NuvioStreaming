package com.nuvio.app.features.plugins

// Matches a trailing ":<season>:<episode>" (or ":<episode>") suffix that some
// catalog/video IDs embed, e.g. "tt1234567:2:5" or "tmdb:1399:2:5".
private val trailingSeasonEpisodeRegex = Regex(""":\d{1,4}:\d{1,4}$""")
private val trailingSingleNumberRegex = Regex(""":\d{1,4}$""")

/**
 * Derives the clean *content* id that a plugin's getStreams() should receive.
 *
 * The season/episode are always passed to the plugin as separate arguments, so
 * the id itself must NOT carry an embedded season/episode suffix. Previously we
 * only stripped the exact ":season:episode" pair, which meant that if the
 * embedded suffix did not match the requested season/episode (a different
 * episode in the same series, a null season, a re-used parent id, etc.) the raw
 * id — still pointing at the wrong episode — leaked through to the plugin.
 *
 * The result was scrapers returning streams for the wrong episode. We now strip
 * any trailing numeric episode/season suffix unconditionally so the plugin gets
 * a stable base id and relies solely on the explicit season/episode arguments.
 */
internal fun pluginContentId(
    videoId: String,
    season: Int?,
    episode: Int?,
): String {
    val trimmed = videoId.trim()
    if (trimmed.isBlank()) return videoId

    val withoutPrefix = when {
        trimmed.startsWith("tmdb:") -> trimmed.removePrefix("tmdb:")
        trimmed.startsWith("tmdb/") -> trimmed.removePrefix("tmdb/")
        else -> trimmed
    }

    // Keep only the part before any path separator first (e.g. "id/extra").
    val basePart = withoutPrefix.substringBefore('/')

    // Remove a trailing season:episode pair if present, otherwise a lone
    // trailing episode number. This is independent of the requested
    // season/episode so a mismatched embedded suffix can no longer leak.
    val cleaned = when {
        trailingSeasonEpisodeRegex.containsMatchIn(basePart) ->
            basePart.replace(trailingSeasonEpisodeRegex, "")
        // Only strip a single trailing number for series-style ids (those with
        // a remaining ":" separator) to avoid clobbering plain numeric ids.
        season != null && episode != null && basePart.count { it == ':' } >= 2 ->
            basePart.replace(trailingSingleNumberRegex, "")
        else -> basePart
    }

    return cleaned.ifBlank { basePart.ifBlank { trimmed } }
}
