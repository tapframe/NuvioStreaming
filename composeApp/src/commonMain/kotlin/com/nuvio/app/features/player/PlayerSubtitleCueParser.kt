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

        return if (sourceUrl?.endsWith(".vtt", ignoreCase = true) == true || normalized.startsWith("WEBVTT")) {
            parseWebVtt(normalized)
        } else {
            parseSrt(normalized)
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

    private fun String.cleanSubtitleCueText(): String =
        replace(Regex("<[^>]+>"), "")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace(Regex("\\s+"), " ")
            .trim()
}
