package com.nuvio.app.features.streams

/**
 * Deterministic quality-aware ordering for automatic stream selection.
 * Manual stream selection is intentionally unaffected.
 *
 * Explicit preferences are applied before the general quality score. This keeps
 * automatic ranking from overriding a user's configured stream preference.
 */
object SmartStreamSelector {
    data class Context(
        val estimatedBandwidthKbps: Int? = null,
        val displayWidth: Int? = null,
        val displayHeight: Int? = null,
        val supportsHdr: Boolean = false,
        val dataSaver: Boolean = false,
        val preferredVideoCodec: String? = null,
        val preferredAudioLanguage: String? = null,
        val preferredStreamTerms: List<String> = emptyList(),
    )

    fun rank(
        streams: List<StreamItem>,
        context: Context = Context(),
    ): List<StreamItem> = streams
        .withIndex()
        .sortedWith(
            compareByDescending<IndexedValue<StreamItem>> { preferenceScore(it.value, context) }
                .thenByDescending { score(it.value, context) }
                .thenBy { it.index }
        )
        .map { it.value }

    private fun preferenceScore(stream: StreamItem, context: Context): Int {
        if (context.preferredStreamTerms.isEmpty()) return 0
        val text = listOfNotNull(
            stream.name,
            stream.description,
            stream.behaviorHints.filename,
            stream.clientResolve?.filename,
            stream.clientResolve?.torrentName,
            stream.clientResolve?.stream?.raw?.parsed?.resolution,
            stream.clientResolve?.stream?.raw?.parsed?.quality,
            stream.clientResolve?.stream?.raw?.parsed?.codec,
        ).joinToString(" ").lowercase()

        context.preferredStreamTerms.forEachIndexed { index, term ->
            if (term.isNotBlank() && term.lowercase() in text) {
                return (context.preferredStreamTerms.size - index) * 1_000
            }
        }
        return 0
    }

    private fun score(stream: StreamItem, context: Context): Int {
        val parsed = stream.clientResolve?.stream?.raw?.parsed
        val text = listOfNotNull(
            stream.name,
            stream.description,
            stream.behaviorHints.filename,
            stream.clientResolve?.filename,
            stream.clientResolve?.torrentName,
            parsed?.resolution,
            parsed?.quality,
            parsed?.codec,
        ).joinToString(" ").lowercase()

        var score = 0
        val resolution = resolutionHeight(parsed?.resolution ?: text)
        if (resolution > 0) {
            score += when {
                context.dataSaver -> when {
                    resolution <= 480 -> 70
                    resolution <= 720 -> 90
                    resolution <= 1080 -> 80
                    else -> 45
                }
                context.displayHeight != null -> {
                    val displayHeight = context.displayHeight!!
                    when {
                        resolution <= displayHeight -> 100 + resolution / 100
                        else -> maxOf(0, 100 - (resolution - displayHeight) / 20)
                    }
                }
                else -> when (resolution) {
                    2160 -> 130
                    1440 -> 120
                    1080 -> 110
                    720 -> 90
                    480 -> 70
                    else -> 50
                }
            }
        }

        val sizeBytes = stream.behaviorHints.videoSize ?: stream.clientResolve?.stream?.raw?.size
        val bandwidthKbps = context.estimatedBandwidthKbps
        val durationSeconds = parsed?.duration?.takeIf { it > 0 }
        if (bandwidthKbps != null && bandwidthKbps > 0 && sizeBytes != null && durationSeconds != null) {
            val requiredKbps = (sizeBytes * 8L / 1000L / durationSeconds)
                .coerceAtMost(Int.MAX_VALUE.toLong())
                .toInt()
            score += when {
                requiredKbps <= bandwidthKbps * 60 / 100 -> 35
                requiredKbps <= bandwidthKbps * 75 / 100 -> 20
                requiredKbps <= bandwidthKbps * 90 / 100 -> 5
                requiredKbps <= bandwidthKbps -> -30
                else -> -100
            }
        }

        val hdr = parsed?.hdr.orEmpty().any { it.isNotBlank() } ||
            listOf("dolby vision", "dolbyvision", "hdr10", "hdr10+", "hlg").any { it in text }
        score += if (hdr) {
            if (context.supportsHdr) 20 else -25
        } else 5

        val codec = parsed?.codec?.lowercase() ?: when {
            "av1" in text -> "av1"
            "hevc" in text || "h265" in text || "x265" in text -> "hevc"
            "h264" in text || "x264" in text -> "h264"
            else -> ""
        }
        if (context.preferredVideoCodec?.equals(codec, ignoreCase = true) == true) score += 15
        score += when (codec) {
            "av1", "hevc", "h265", "x265" -> 5
            "h264", "x264" -> 3
            else -> 0
        }

        if (context.preferredAudioLanguage != null && parsed?.languages.orEmpty().any {
                it.equals(context.preferredAudioLanguage, ignoreCase = true)
            }) score += 12

        if (stream.isDirectDebridStream || stream.isCachedDebridTorrentStream) score += 35
        if (stream.clientResolve?.isCached == true) score += 35
        if (stream.playableDirectUrl != null) score += 20
        if (stream.isTorrentStream && !stream.isCachedDebridTorrentStream) score -= 10
        if (stream.behaviorHints.notWebReady) score -= 15

        return score
    }

    private fun resolutionHeight(value: String): Int {
        val normalized = value.lowercase()
        val match = Regex("(?:^|\\D)(2160|1440|1080|720|576|540|480|360)p?(?:\\D|$)").find(normalized)
        if (match != null) return match.groupValues[1].toInt()
        return when {
            "4k" in normalized || "uhd" in normalized -> 2160
            "2k" in normalized -> 1440
            else -> 0
        }
    }
}
