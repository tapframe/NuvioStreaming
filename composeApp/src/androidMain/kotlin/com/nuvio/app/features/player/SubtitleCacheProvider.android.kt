package com.nuvio.app.features.player

/**
 * Android implementation: downloads subtitles to local cache and returns content:// URIs
 * via FileProvider so external players can read them.
 */
actual object SubtitleCacheProvider {
    actual suspend fun cacheForExternalPlayer(subtitles: List<SubtitleInput>): List<SubtitleInput>? {
        return SubtitleFileCache.cacheSubtitles(subtitles)
    }
}
