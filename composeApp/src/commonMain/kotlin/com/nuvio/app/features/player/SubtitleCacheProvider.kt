package com.nuvio.app.features.player

/**
 * Platform-specific subtitle caching for external players.
 *
 * On Android, downloads subtitle files from remote URLs to local cache and returns
 * content:// URIs so external players can access them (via intent extras + ClipData).
 *
 * On iOS, returns subtitles unchanged — players like Infuse accept remote URLs
 * directly via their URL scheme parameters.
 */
expect object SubtitleCacheProvider {
    /**
     * Caches subtitle files locally and returns updated [SubtitleInput] list
     * with local URIs instead of remote HTTP URLs.
     *
     * Returns null if caching fails or no subtitles could be downloaded.
     * On platforms where caching is not needed, returns the input list unchanged.
     */
    suspend fun cacheForExternalPlayer(subtitles: List<SubtitleInput>): List<SubtitleInput>?
}
