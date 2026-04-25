package com.nuvio.app.core.format

import com.nuvio.app.core.i18n.localizedMonthName

/**
 * Formats ISO calendar dates (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss…) for UI as "2025 February 1".
 * Other strings (e.g. year-only "2024", human text from addons) are returned unchanged.
 */
fun formatReleaseDateForDisplay(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return raw
    val datePart = trimmed.substringBefore('T').trim()
    val parts = datePart.split('-')
    if (parts.size != 3) return raw
    val year = parts[0].toIntOrNull() ?: return raw
    val month = parts[1].toIntOrNull()?.takeIf { it in 1..12 } ?: return raw
    val day = parts[2].toIntOrNull()?.takeIf { it in 1..31 } ?: return raw
    return "$year ${localizedMonthName(month)} $day"
}

/**
 * Parses a release/air string (ISO date, year-only, or timestamp prefix) for compact UI (e.g. year chips).
 */
fun extractReleaseYearForDisplay(raw: String): Int? {
    val t = raw.trim()
    if (t.isEmpty()) return null
    if (t.length == 4 && t.all { it.isDigit() }) {
        return t.toIntOrNull()?.takeIf { it in 1000..9999 }
    }
    val datePart = t.substringBefore('T').trim()
    val yearStr = datePart.split('-').firstOrNull() ?: return null
    return yearStr.toIntOrNull()?.takeIf { it in 1000..9999 }
}
