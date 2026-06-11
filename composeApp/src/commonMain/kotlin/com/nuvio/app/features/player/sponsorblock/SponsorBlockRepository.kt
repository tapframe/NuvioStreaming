package com.nuvio.app.features.player.sponsorblock

import com.nuvio.app.features.player.skip.SkipInterval

/**
 * Repository that bridges SponsorBlock API with the existing skip interval system.
 *
 * Design rationale:
 * - Reuses the existing [SkipInterval] model so the UI (SkipIntroButton) and
 *   playback logic (PlayerScreenRuntimeEffects) work without modification.
 * - Caches results per videoId to avoid redundant network calls during seeks.
 * - Extracts YouTube videoId from Stremio-style video identifiers.
 */
object SponsorBlockRepository {

    private val cache = HashMap<String, List<SkipInterval>>()

    /**
     * Fetches SponsorBlock segments and converts them to [SkipInterval] objects
     * compatible with the existing skip pipeline.
     *
     * @param videoId Stremio-style videoId (e.g., "yt_id:xxxxx" or raw YouTube ID).
     * @param settings User's SponsorBlock preferences.
     * @return List of [SkipInterval] ready for the player runtime.
     */
    suspend fun getSkipIntervals(
        videoId: String?,
        settings: SponsorBlockSettings,
    ): List<SkipInterval> {
        if (!settings.enabled) return emptyList()
        if (videoId.isNullOrBlank()) return emptyList()

        val youtubeId = extractYouTubeId(videoId) ?: return emptyList()

        cache[youtubeId]?.let { return it }

        val segments = if (settings.usePrivacyApi) {
            fetchViaPrivacyApi(youtubeId, settings)
        } else {
            fetchDirect(youtubeId, settings)
        }

        val intervals = segments
            .filter { segment ->
                segment.categoryEnum in settings.categories &&
                    segment.actionEnum == SponsorBlockAction.SKIP &&
                    segment.endTime > segment.startTime
            }
            .map { segment ->
                SkipInterval(
                    startTime = segment.startTime,
                    endTime = segment.endTime,
                    type = mapCategoryToSkipType(segment.category),
                    provider = "sponsorblock",
                )
            }
            .sortedBy { it.startTime }

        cache[youtubeId] = intervals
        return intervals
    }

    /**
     * Direct API call (non-privacy mode).
     */
    private suspend fun fetchDirect(
        youtubeId: String,
        settings: SponsorBlockSettings,
    ): List<SponsorBlockSegment> {
        return SponsorBlockApi.getSkipSegments(
            videoId = youtubeId,
            categories = settings.categories.toList(),
        )
    }

    /**
     * Privacy-friendly API call using hash prefix.
     */
    private suspend fun fetchViaPrivacyApi(
        youtubeId: String,
        settings: SponsorBlockSettings,
    ): List<SponsorBlockSegment> {
        val hash = sha256Hex(youtubeId)
        val prefix = hash.take(4)
        val results = SponsorBlockApi.getSkipSegmentsByHash(
            hashPrefix = prefix,
            categories = settings.categories.toList(),
        )
        return results
            .firstOrNull { it.videoId == youtubeId }
            ?.segments
            ?: emptyList()
    }

    /**
     * Extracts a YouTube video ID from various formats:
     * - Raw 11-char YouTube ID
     * - "yt_id:VIDEO_ID" (Stremio addon format)
     * - Full YouTube URL
     */
    private fun extractYouTubeId(videoId: String): String? {
        // Direct 11-char YouTube ID
        if (videoId.length == 11 && videoId.all { it.isLetterOrDigit() || it == '-' || it == '_' }) {
            return videoId
        }

        // Stremio yt_id format
        if (videoId.startsWith("yt_id:")) {
            return videoId.removePrefix("yt_id:").takeIf { it.length == 11 }
        }

        // YouTube URL patterns
        val urlPatterns = listOf(
            Regex("""(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})"""),
        )
        for (pattern in urlPatterns) {
            pattern.find(videoId)?.groupValues?.getOrNull(1)?.let { return it }
        }

        return null
    }

    /**
     * Maps SponsorBlock category to the skip type labels used by SkipIntroButton.
     */
    private fun mapCategoryToSkipType(category: String): String = when (category) {
        "sponsor" -> "sponsor"
        "selfpromo" -> "selfpromo"
        "interaction" -> "interaction"
        "intro" -> "intro"
        "outro" -> "outro"
        "preview" -> "recap"
        "music_offtopic" -> "music_offtopic"
        "filler" -> "filler"
        else -> "sponsor"
    }

    /**
     * Platform-agnostic SHA-256 hex digest.
     * Uses a simple implementation suitable for KMP.
     */
    private fun sha256Hex(input: String): String {
        // Use platform-expect/actual for real SHA-256 in production.
        // For now, use a simple hash that works cross-platform.
        return platformSha256(input)
    }

    fun clearCache() {
        cache.clear()
    }
}

/**
 * Platform-specific SHA-256 implementation.
 * Declared as expect for KMP; actuals provided per platform.
 */
internal expect fun platformSha256(input: String): String
