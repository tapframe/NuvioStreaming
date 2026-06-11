package com.nuvio.app.features.player.dualsubtitle

/**
 * Cross-platform subtitle parser supporting SRT and WebVTT formats.
 *
 * Parses subtitle files into a list of [SubtitleCue] objects that can be
 * queried by playback position for the dual subtitle overlay.
 */
object SubtitleParser {

    /**
     * Parses subtitle text content into a sorted list of cues.
     * Auto-detects format (SRT vs WebVTT) based on content.
     */
    fun parse(content: String): List<SubtitleCue> {
        val trimmed = content.trim()
        return when {
            trimmed.startsWith("WEBVTT") -> parseVtt(trimmed)
            else -> parseSrt(trimmed)
        }
    }

    /**
     * Finds the active cue at a given playback position.
     * Uses binary search for O(log n) performance.
     */
    fun findCueAtPosition(cues: List<SubtitleCue>, positionMs: Long): SubtitleCue? {
        if (cues.isEmpty()) return null

        // Binary search for the approximate position
        var low = 0
        var high = cues.size - 1
        var result: SubtitleCue? = null

        while (low <= high) {
            val mid = (low + high) / 2
            val cue = cues[mid]
            when {
                positionMs < cue.startTimeMs -> high = mid - 1
                positionMs > cue.endTimeMs -> low = mid + 1
                else -> {
                    result = cue
                    break
                }
            }
        }

        // Fallback: linear scan in nearby range (handles overlapping cues)
        if (result == null) {
            val searchStart = (low - 2).coerceAtLeast(0)
            val searchEnd = (low + 2).coerceAtMost(cues.size - 1)
            for (i in searchStart..searchEnd) {
                val cue = cues[i]
                if (positionMs in cue.startTimeMs..cue.endTimeMs) {
                    result = cue
                    break
                }
            }
        }

        return result
    }

    // --- SRT Parser ---

    private fun parseSrt(content: String): List<SubtitleCue> {
        val cues = mutableListOf<SubtitleCue>()
        val blocks = content.split(Regex("""\r?\n\r?\n"""))

        for (block in blocks) {
            val lines = block.trim().lines()
            if (lines.size < 3) continue

            // Find the timestamp line (skip sequence number)
            val timestampLineIndex = lines.indexOfFirst { it.contains("-->") }
            if (timestampLineIndex < 0) continue

            val timestampLine = lines[timestampLineIndex]
            val times = parseTimestampLine(timestampLine) ?: continue

            val textLines = lines.subList(timestampLineIndex + 1, lines.size)
            val text = textLines
                .joinToString("\n")
                .replace(Regex("<[^>]+>"), "") // Strip HTML tags
                .replace(Regex("\\{[^}]+\\}"), "") // Strip ASS tags
                .trim()

            if (text.isNotBlank()) {
                cues.add(SubtitleCue(startTimeMs = times.first, endTimeMs = times.second, text = text))
            }
        }

        return cues.sortedBy { it.startTimeMs }
    }

    // --- WebVTT Parser ---

    private fun parseVtt(content: String): List<SubtitleCue> {
        val cues = mutableListOf<SubtitleCue>()
        // Remove WEBVTT header and metadata
        val bodyStart = content.indexOf("\n\n")
        if (bodyStart < 0) return emptyList()
        val body = content.substring(bodyStart).trim()
        val blocks = body.split(Regex("""\r?\n\r?\n"""))

        for (block in blocks) {
            val lines = block.trim().lines()
            if (lines.isEmpty()) continue

            val timestampLineIndex = lines.indexOfFirst { it.contains("-->") }
            if (timestampLineIndex < 0) continue

            val timestampLine = lines[timestampLineIndex]
            val times = parseTimestampLine(timestampLine) ?: continue

            val textLines = lines.subList(timestampLineIndex + 1, lines.size)
            val text = textLines
                .joinToString("\n")
                .replace(Regex("<[^>]+>"), "")
                .trim()

            if (text.isNotBlank()) {
                cues.add(SubtitleCue(startTimeMs = times.first, endTimeMs = times.second, text = text))
            }
        }

        return cues.sortedBy { it.startTimeMs }
    }

    // --- Timestamp Parsing ---

    private fun parseTimestampLine(line: String): Pair<Long, Long>? {
        val parts = line.split("-->")
        if (parts.size != 2) return null
        val start = parseTimestamp(parts[0].trim()) ?: return null
        val end = parseTimestamp(parts[1].trim().split(" ").first()) ?: return null
        return start to end
    }

    /**
     * Parses timestamps in formats:
     * - HH:MM:SS,mmm (SRT)
     * - HH:MM:SS.mmm (VTT)
     * - MM:SS.mmm (VTT short)
     */
    private fun parseTimestamp(timestamp: String): Long? {
        val cleaned = timestamp.replace(',', '.')
        val parts = cleaned.split(":")
        return when (parts.size) {
            3 -> {
                val hours = parts[0].toLongOrNull() ?: return null
                val minutes = parts[1].toLongOrNull() ?: return null
                val secParts = parts[2].split(".")
                val seconds = secParts[0].toLongOrNull() ?: return null
                val millis = secParts.getOrNull(1)?.padEnd(3, '0')?.take(3)?.toLongOrNull() ?: 0L
                hours * 3600000L + minutes * 60000L + seconds * 1000L + millis
            }
            2 -> {
                val minutes = parts[0].toLongOrNull() ?: return null
                val secParts = parts[1].split(".")
                val seconds = secParts[0].toLongOrNull() ?: return null
                val millis = secParts.getOrNull(1)?.padEnd(3, '0')?.take(3)?.toLongOrNull() ?: 0L
                minutes * 60000L + seconds * 1000L + millis
            }
            else -> null
        }
    }
}
