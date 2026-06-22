package com.nuvio.app.features.player

import kotlin.math.max

object PlayerSubtitleCueParser {
    fun parse(text: String, sourceUrl: String? = null): List<SubtitleSyncCue> {
        val normalized = text
            .removePrefix("\uFEFF")
            .replace("\r\n", "\n")
            .replace('\r', '\n')
            .trim()
        if (normalized.isBlank()) return emptyList()

        return when (detectSubtitleFormat(sourceUrl, normalized)) {
            SubtitleFormatHint.WebVtt -> parseWebVtt(normalized)
            SubtitleFormatHint.Ass -> parseAss(normalized)
            SubtitleFormatHint.Ttml -> parseTtml(normalized)
            SubtitleFormatHint.Srt -> parseSrt(normalized)
        }
    }

    private enum class SubtitleFormatHint {
        Srt,
        WebVtt,
        Ass,
        Ttml,
    }

    private fun detectSubtitleFormat(sourceUrl: String?, text: String): SubtitleFormatHint {
        val sourcePath = sourceUrl
            ?.substringBefore('?')
            ?.substringBefore('#')
            ?.lowercase()
            .orEmpty()
        val sample = text.take(4_096).lowercase()

        return when {
            sourcePath.endsWith(".vtt") || sourcePath.endsWith(".webvtt") || text.startsWith("WEBVTT") ->
                SubtitleFormatHint.WebVtt
            sourcePath.endsWith(".ass") || sourcePath.endsWith(".ssa") ||
                (sample.contains("[events]") && sample.contains("dialogue:")) ->
                SubtitleFormatHint.Ass
            sourcePath.endsWith(".ttml") || sourcePath.endsWith(".dfxp") || sourcePath.endsWith(".xml") ||
                Regex("""<tt[\s>]""", RegexOption.IGNORE_CASE).containsMatchIn(text.take(512)) ->
                SubtitleFormatHint.Ttml
            else -> SubtitleFormatHint.Srt
        }
    }

    private fun parseSrt(text: String): List<SubtitleSyncCue> =
        text.split(Regex("\n{2,}"))
            .mapNotNull { block ->
                val lines = block.lines()
                    .map { it.trim() }
                    .filter { it.isNotBlank() }
                val timingIndex = lines.indexOfFirst { it.contains("-->") }
                if (timingIndex < 0) return@mapNotNull null
                val start = parseCueStart(lines[timingIndex]) ?: return@mapNotNull null
                val body = lines.drop(timingIndex + 1)
                    .joinToString(" ")
                    .cleanSubtitleCueText()
                if (body.isBlank()) null else SubtitleSyncCue(start, body)
            }
            .sortedBy { it.startTimeMs }

    private fun parseWebVtt(text: String): List<SubtitleSyncCue> =
        text.lines()
            .dropWhile { it.trim().isEmpty() || it.trim().startsWith("WEBVTT") }
            .joinToString("\n")
            .split(Regex("\n{2,}"))
            .mapNotNull { block ->
                val lines = block.lines()
                    .map { it.trim() }
                    .filter { it.isNotBlank() && !it.startsWith("NOTE") }
                val timingIndex = lines.indexOfFirst { it.contains("-->") }
                if (timingIndex < 0) return@mapNotNull null
                val start = parseCueStart(lines[timingIndex]) ?: return@mapNotNull null
                val body = lines.drop(timingIndex + 1)
                    .joinToString(" ")
                    .cleanSubtitleCueText()
                if (body.isBlank()) null else SubtitleSyncCue(start, body)
            }
            .sortedBy { it.startTimeMs }

    private fun parseAss(text: String): List<SubtitleSyncCue> {
        var inEventsSection = false
        var formatFields: List<String>? = null

        return text.lines()
            .mapNotNull { rawLine ->
                val line = rawLine.trim()
                when {
                    line.equals("[Events]", ignoreCase = true) -> {
                        inEventsSection = true
                        null
                    }
                    line.startsWith("[") && line.endsWith("]") -> {
                        inEventsSection = false
                        null
                    }
                    inEventsSection && line.startsWith("Format:", ignoreCase = true) -> {
                        formatFields = line.substringAfter(':')
                            .split(',')
                            .map { it.trim() }
                        null
                    }
                    inEventsSection && line.startsWith("Dialogue:", ignoreCase = true) ->
                        parseAssDialogue(line.substringAfter(':'), formatFields)
                    else -> null
                }
            }
            .sortedBy { it.startTimeMs }
    }

    private fun parseAssDialogue(payload: String, formatFields: List<String>?): SubtitleSyncCue? {
        val fields = formatFields.orEmpty()
        val parts = payload
            .split(',', limit = fields.ifEmpty { defaultAssFormatFields }.size)
            .map { it.trim() }
        val startIndex = fields.indexOfField("Start").takeIf { it >= 0 } ?: 1
        val textIndex = fields.indexOfField("Text").takeIf { it >= 0 } ?: 9

        if (parts.size <= startIndex || parts.size <= textIndex) return null
        val start = parseTimestamp(parts[startIndex]) ?: return null
        val body = parts[textIndex]
            .cleanAssCueText()
            .cleanSubtitleCueText()
        return if (body.isBlank()) null else SubtitleSyncCue(start, body)
    }

    private fun parseTtml(text: String): List<SubtitleSyncCue> =
        Regex("""<p\b([^>]*)>(.*?)</p>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
            .findAll(text)
            .mapNotNull { match ->
                val attrs = match.groupValues[1]
                val startRaw = attrs.attributeValue("begin")
                    ?: attrs.attributeValue("start")
                    ?: return@mapNotNull null
                val start = parseTtmlTimestamp(startRaw) ?: return@mapNotNull null
                val body = match.groupValues[2]
                    .replace(Regex("""<br\s*/?>""", RegexOption.IGNORE_CASE), " ")
                    .cleanSubtitleCueText()
                if (body.isBlank()) null else SubtitleSyncCue(start, body)
            }
            .sortedBy { it.startTimeMs }
            .toList()

    private fun parseCueStart(timingLine: String): Long? {
        val startPart = timingLine.substringBefore("-->").trim()
        return parseTimestamp(startPart)
    }

    private fun parseTimestamp(raw: String): Long? {
        val cleaned = raw.substringBefore(' ').replace(',', '.')
        val parts = cleaned.split(':')
        if (parts.size !in 2..3) return null

        val secondsPart = parts.last()
        val seconds = secondsPart.substringBefore('.').toLongOrNull() ?: return null
        val millis = secondsPart.substringAfter('.', "")
            .take(3)
            .padEnd(3, '0')
            .toLongOrNull()
            ?: 0L
        val minutes = parts[parts.size - 2].toLongOrNull() ?: return null
        val hours = if (parts.size == 3) parts[0].toLongOrNull() ?: return null else 0L

        return max(0L, hours * 3_600_000L + minutes * 60_000L + seconds * 1_000L + millis)
    }

    private fun parseTtmlTimestamp(raw: String): Long? {
        val cleaned = raw.trim().substringBefore(' ')
        if (cleaned.isBlank()) return null

        parseClockTimeWithFrames(cleaned)?.let { return it }
        parseTimestamp(cleaned)?.let { return it }

        val match = Regex("""^([0-9]+(?:\.[0-9]+)?)(ms|h|m|s)$""", RegexOption.IGNORE_CASE)
            .matchEntire(cleaned)
            ?: return null
        val value = match.groupValues[1].toDoubleOrNull() ?: return null
        val multiplier = when (match.groupValues[2].lowercase()) {
            "h" -> 3_600_000.0
            "m" -> 60_000.0
            "s" -> 1_000.0
            "ms" -> 1.0
            else -> return null
        }
        return max(0L, (value * multiplier).toLong())
    }

    private fun parseClockTimeWithFrames(raw: String): Long? {
        val parts = raw.split(':')
        if (parts.size != 4) return null

        val hours = parts[0].toLongOrNull() ?: return null
        val minutes = parts[1].toLongOrNull() ?: return null
        val seconds = parts[2].toLongOrNull() ?: return null
        val frames = parts[3].substringBefore('.').toLongOrNull() ?: return null
        return max(0L, hours * 3_600_000L + minutes * 60_000L + seconds * 1_000L + frames * 1_000L / 30L)
    }

    private val defaultAssFormatFields = listOf(
        "Layer",
        "Start",
        "End",
        "Style",
        "Name",
        "MarginL",
        "MarginR",
        "MarginV",
        "Effect",
        "Text",
    )

    private fun List<String>.indexOfField(name: String): Int =
        indexOfFirst { it.equals(name, ignoreCase = true) }

    private fun String.attributeValue(name: String): String? =
        Regex("""\b${Regex.escape(name)}\s*=\s*["']([^"']+)["']""", RegexOption.IGNORE_CASE)
            .find(this)
            ?.groupValues
            ?.getOrNull(1)
            ?.takeIf { it.isNotBlank() }

    private fun String.cleanAssCueText(): String =
        replace(Regex("""\{[^}]*}"""), "")
            .replace("\\N", " ")
            .replace("\\n", " ")
            .replace("\\h", " ")

    private fun String.cleanSubtitleCueText(): String =
        replace(Regex("<[^>]+>"), "")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace(Regex("\\s+"), " ")
            .trim()
}
