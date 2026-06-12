package com.nuvio.app.features.player

/**
 * iOS implementation: returns subtitles unchanged (no caching needed).
 * iOS players like Infuse accept remote subtitle URLs directly via their URL scheme,
 * so we just pass through the original HTTP URLs without downloading.
 */
actual object SubtitleCacheProvider {
    actual suspend fun cacheForExternalPlayer(subtitles: List<SubtitleInput>): List<SubtitleInput>? {
        return subtitles.ifEmpty { null }
    }
}
