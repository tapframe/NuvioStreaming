package com.nuvio.app.features.player

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.addons.httpGetTextWithHeaders

internal const val PlayerQualityAutoId = "auto"

data class PlayerQualityVariant(
    val id: String,
    val name: String,
    val width: Int?,
    val height: Int?,
    val bandwidth: Long?,
    val codecs: String,
    val audioGroupId: String?,
    val absoluteUri: String,
    val playbackUrl: String,
) {
    val isAv1: Boolean
        get() = codecs.split(',').any { codec -> codec.trim().startsWith("av01", ignoreCase = true) }

    val isLikelyHardwareDecodable: Boolean
        get() = !isAv1

    val sortHeight: Int
        get() = height ?: name.filter { it.isDigit() }.toIntOrNull() ?: 0

    val displayLabel: String
        get() = buildString {
            append(qualityName)
            codecLabel.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
            bandwidthLabel.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
            if (!isLikelyHardwareDecodable) append(" · Software decode")
        }

    val qualityName: String
        get() = when {
            name.isNotBlank() -> if (name.endsWith("p", ignoreCase = true)) name else "${name}p"
            height != null -> "${height}p"
            width != null -> "${width}w"
            else -> "Unknown"
        }

    val buttonQualityName: String
        get() = qualityName.toPlayerQualityButtonName()

    private val codecLabel: String
        get() = when {
            isAv1 -> "AV1"
            codecs.contains("hvc1", ignoreCase = true) || codecs.contains("hev1", ignoreCase = true) -> "HEVC"
            codecs.contains("avc1", ignoreCase = true) || codecs.contains("avc3", ignoreCase = true) -> "H.264"
            codecs.isNotBlank() -> codecs.split(',').lastOrNull()?.trim().orEmpty()
            else -> ""
        }

    private val bandwidthLabel: String
        get() {
            val value = bandwidth ?: return ""
            if (value <= 0L) return ""
            val mbps = value / 1_000_000.0
            return if (mbps >= 1.0) {
                "${formatOneDecimal(mbps)} Mbps"
            } else {
                "${formatOneDecimal(value / 1_000.0)} Kbps"
            }
        }
}

data class PlayerQualitySelectionState(
    val isLoading: Boolean = false,
    val sourceUrl: String = "",
    val variants: List<PlayerQualityVariant> = emptyList(),
    val recommendedVariantId: String? = null,
    val errorMessage: String? = null,
) {
    val hasSelectableQualities: Boolean
        get() = variants.size > 1

    fun playbackUrlFor(selectedVariantId: String?): String? {
        val selected = when {
            selectedVariantId.isNullOrBlank() || selectedVariantId == PlayerQualityAutoId -> {
                variants.firstOrNull { it.id == recommendedVariantId }
            }
            else -> variants.firstOrNull { it.id == selectedVariantId }
        }
        return selected?.playbackUrl ?: sourceUrl.takeIf { it.isNotBlank() }
    }

    fun labelFor(selectedVariantId: String?, forButton: Boolean = false): String? {
        val selected = when {
            selectedVariantId.isNullOrBlank() || selectedVariantId == PlayerQualityAutoId -> {
                variants.firstOrNull { it.id == recommendedVariantId }
            }
            else -> variants.firstOrNull { it.id == selectedVariantId }
        }
        return if (forButton) {
            selected?.buttonQualityName
        } else {
            selected?.qualityName
        }
    }
}

internal object PlayerQualityResolver {
    private val log = Logger.withTag("PlayerQuality")

    suspend fun resolve(
        sourceUrl: String,
        requestHeaders: Map<String, String> = emptyMap(),
    ): PlayerQualitySelectionState {
        val normalizedUrl = sourceUrl.trim()
        if (!looksLikeHlsPlaylist(normalizedUrl)) {
            return PlayerQualitySelectionState(sourceUrl = normalizedUrl)
        }

        val playlistText = runCatching {
            if (requestHeaders.isEmpty()) {
                httpGetText(normalizedUrl)
            } else {
                httpGetTextWithHeaders(url = normalizedUrl, headers = requestHeaders)
            }
        }.onFailure { error ->
            log.w(error) { "Failed to fetch HLS master playlist for quality detection" }
        }.getOrNull() ?: return PlayerQualitySelectionState(
            sourceUrl = normalizedUrl,
            errorMessage = "Unable to inspect HLS quality variants.",
        )

        if (!playlistText.contains("#EXT-X-STREAM-INF", ignoreCase = true)) {
            return PlayerQualitySelectionState(sourceUrl = normalizedUrl)
        }

        val parsed = HlsMasterPlaylist.parse(normalizedUrl, playlistText)
        if (parsed.variants.isEmpty()) {
            return PlayerQualitySelectionState(sourceUrl = normalizedUrl)
        }

        val variants = parsed.variants.mapIndexedNotNull { index, variant ->
            val sanitized = parsed.buildSanitizedMasterPlaylist(variant)
            val playbackUrl = writeTemporaryHlsPlaylist(sanitized)
            if (playbackUrl == null) {
                log.w { "Failed to write sanitized HLS playlist for variant=${variant.name.ifBlank { variant.id }}" }
                null
            } else {
                variant.toUiVariant(index = index, playbackUrl = playbackUrl)
            }
        }

        if (variants.isEmpty()) {
            return PlayerQualitySelectionState(
                sourceUrl = normalizedUrl,
                errorMessage = "Unable to prepare HLS quality variants.",
            )
        }

        val recommended = chooseRecommendedVariant(variants)
        log.i {
            "Detected HLS qualities count=${variants.size} recommended=${recommended?.displayLabel.orEmpty()} url=${redactUrl(normalizedUrl)}"
        }
        return PlayerQualitySelectionState(
            sourceUrl = normalizedUrl,
            variants = variants,
            recommendedVariantId = recommended?.id,
        )
    }

    private fun chooseRecommendedVariant(variants: List<PlayerQualityVariant>): PlayerQualityVariant? {
        val compatible = variants.filter { it.isLikelyHardwareDecodable }
        val pool = compatible.ifEmpty { variants }
        return pool.maxWithOrNull(compareBy<PlayerQualityVariant> { it.sortHeight }.thenBy { it.bandwidth ?: 0L })
    }
}

private data class HlsMasterPlaylist(
    val baseUrl: String,
    val headerLines: List<String>,
    val mediaLines: List<HlsMediaLine>,
    val variants: List<HlsVariant>,
) {
    fun buildSanitizedMasterPlaylist(selected: HlsVariant): String = buildString {
        val sanitizedHeaderLines = headerLines.ifEmpty { listOf("#EXTM3U") }
        sanitizedHeaderLines.forEach { line ->
            append(line).append('\n')
        }

        val selectedAudioGroup = selected.audioGroupId
        mediaLines
            .filter { media ->
                selectedAudioGroup == null || media.groupId == selectedAudioGroup || media.type != "AUDIO"
            }
            .forEach { media ->
                append(media.rewrittenLine).append('\n')
            }

        append(selected.streamInfoLine).append('\n')
        append(selected.absoluteUri).append('\n')
    }

    companion object {
        fun parse(baseUrl: String, playlistText: String): HlsMasterPlaylist {
            val headerLines = mutableListOf<String>()
            val mediaLines = mutableListOf<HlsMediaLine>()
            val variants = mutableListOf<HlsVariant>()
            val lines = playlistText
                .replace("\r\n", "\n")
                .replace('\r', '\n')
                .lines()
                .map { it.trim() }
                .filter { it.isNotEmpty() }

            var index = 0
            while (index < lines.size) {
                val line = lines[index]
                when {
                    line.startsWith("#EXT-X-MEDIA", ignoreCase = true) -> {
                        val attributes = parseAttributes(line.substringAfter(':', ""))
                        val uri = attributes["URI"]
                        mediaLines += HlsMediaLine(
                            type = attributes["TYPE"].orEmpty(),
                            groupId = attributes["GROUP-ID"],
                            rewrittenLine = if (uri != null) {
                                rewriteAttribute(line, "URI", absolutizeHlsUri(baseUrl, uri))
                            } else {
                                line
                            },
                        )
                    }
                    line.startsWith("#EXT-X-STREAM-INF", ignoreCase = true) -> {
                        val attributes = parseAttributes(line.substringAfter(':', ""))
                        val uriIndex = (index + 1 until lines.size)
                            .firstOrNull { candidate -> !lines[candidate].startsWith("#") }
                        if (uriIndex != null) {
                            val variantUri = lines[uriIndex]
                            variants += HlsVariant(
                                id = "q${variants.size}",
                                streamInfoLine = line,
                                name = attributes["NAME"].orEmpty().trim('"'),
                                width = attributes["RESOLUTION"]?.substringBefore('x')?.toIntOrNull(),
                                height = attributes["RESOLUTION"]?.substringAfter('x', "")?.toIntOrNull(),
                                bandwidth = attributes["BANDWIDTH"]?.toLongOrNull(),
                                codecs = attributes["CODECS"].orEmpty(),
                                audioGroupId = attributes["AUDIO"],
                                absoluteUri = absolutizeHlsUri(baseUrl, variantUri),
                            )
                            index = uriIndex
                        }
                    }
                    line.startsWith("#EXTM3U", ignoreCase = true) ||
                        line.startsWith("#EXT-X-VERSION", ignoreCase = true) ||
                        line.startsWith("#EXT-X-INDEPENDENT-SEGMENTS", ignoreCase = true) ||
                        line.startsWith("#EXT-X-START", ignoreCase = true) -> {
                        headerLines += line
                    }
                }
                index++
            }

            return HlsMasterPlaylist(
                baseUrl = baseUrl,
                headerLines = headerLines.distinct(),
                mediaLines = mediaLines,
                variants = variants,
            )
        }
    }
}

private data class HlsMediaLine(
    val type: String,
    val groupId: String?,
    val rewrittenLine: String,
)

private data class HlsVariant(
    val id: String,
    val streamInfoLine: String,
    val name: String,
    val width: Int?,
    val height: Int?,
    val bandwidth: Long?,
    val codecs: String,
    val audioGroupId: String?,
    val absoluteUri: String,
) {
    fun toUiVariant(index: Int, playbackUrl: String): PlayerQualityVariant = PlayerQualityVariant(
        id = id.ifBlank { "q$index" },
        name = name,
        width = width,
        height = height,
        bandwidth = bandwidth,
        codecs = codecs,
        audioGroupId = audioGroupId,
        absoluteUri = absoluteUri,
        playbackUrl = playbackUrl,
    )
}

internal expect fun writeTemporaryHlsPlaylist(playlistText: String): String?

private fun looksLikeHlsPlaylist(url: String): Boolean {
    val path = url.substringBefore('?').substringBefore('#').lowercase()
    return path.endsWith(".m3u8") || url.contains(".m3u8", ignoreCase = true)
}

internal fun playerQualityNameForResolution(
    width: Int?,
    height: Int?,
    forButton: Boolean = false,
): String? {
    val w = width?.takeIf { it > 0 } ?: 0
    val h = height?.takeIf { it > 0 } ?: 0
    if (w <= 0 && h <= 0) return null
    val label = when {
        w >= 3840 || h >= 2160 -> "2160p"
        w >= 2560 || h >= 1440 -> "1440p"
        w >= 1920 || h >= 1080 -> "1080p"
        w >= 1280 || h >= 720 -> "720p"
        w >= 854 || h >= 480 -> "480p"
        w >= 640 || h >= 360 -> "360p"
        h > 0 -> "${h}p"
        else -> "${w}w"
    }
    return if (forButton) label.toPlayerQualityButtonName() else label
}

internal fun playerQualityNameForHeight(height: Int?, forButton: Boolean = false): String? =
    playerQualityNameForResolution(width = null, height = height, forButton = forButton)

internal fun String.toPlayerQualityButtonName(): String =
    if (equals("2160p", ignoreCase = true)) "4K UHD" else this

private fun parseAttributes(attributeText: String): Map<String, String> {
    val attributes = linkedMapOf<String, String>()
    var index = 0
    while (index < attributeText.length) {
        while (index < attributeText.length && (attributeText[index] == ',' || attributeText[index].isWhitespace())) index++
        val keyStart = index
        while (index < attributeText.length && attributeText[index] != '=') index++
        if (index >= attributeText.length) break
        val key = attributeText.substring(keyStart, index).trim().uppercase()
        index++
        val value = if (index < attributeText.length && attributeText[index] == '"') {
            index++
            val valueStart = index
            while (index < attributeText.length && attributeText[index] != '"') index++
            val quoted = attributeText.substring(valueStart, index)
            if (index < attributeText.length && attributeText[index] == '"') index++
            quoted
        } else {
            val valueStart = index
            while (index < attributeText.length && attributeText[index] != ',') index++
            attributeText.substring(valueStart, index).trim()
        }
        if (key.isNotBlank()) attributes[key] = value
        while (index < attributeText.length && attributeText[index] != ',') index++
    }
    return attributes
}

private fun rewriteAttribute(line: String, attributeName: String, value: String): String {
    val pattern = Regex("$attributeName=\"[^\"]*\"", RegexOption.IGNORE_CASE)
    return if (pattern.containsMatchIn(line)) {
        pattern.replace(line, "$attributeName=\"$value\"")
    } else {
        "$line,$attributeName=\"$value\""
    }
}

private fun absolutizeHlsUri(baseUrl: String, uri: String): String {
    val trimmed = uri.trim().trim('"')
    if (trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true)) {
        return trimmed
    }

    val schemeSeparator = baseUrl.indexOf("://")
    if (schemeSeparator <= 0) return trimmed
    val scheme = baseUrl.substring(0, schemeSeparator)
    val afterScheme = baseUrl.substring(schemeSeparator + 3)
    val hostEnd = afterScheme.indexOf('/').let { if (it < 0) afterScheme.length else it }
    val origin = "$scheme://${afterScheme.substring(0, hostEnd)}"

    if (trimmed.startsWith("//")) return "$scheme:$trimmed"
    if (trimmed.startsWith('/')) return origin + trimmed

    val directory = baseUrl.substringBeforeLast('/', missingDelimiterValue = baseUrl)
    return "$directory/$trimmed"
}

private fun formatOneDecimal(value: Double): String {
    val rounded = kotlin.math.round(value * 10.0) / 10.0
    val asText = rounded.toString()
    return if (asText.endsWith(".0")) asText.dropLast(2) else asText
}

private fun redactUrl(url: String): String = url.substringBefore('?')
