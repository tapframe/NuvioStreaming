package com.nuvio.app.features.trakt

private val TraktIsoDateTimeRegex = Regex(
    """^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$""",
)

internal fun parseTraktIsoDateTimeToEpochMs(value: String): Long? {
    val match = TraktIsoDateTimeRegex.matchEntire(value.trim()) ?: return null
    val year = match.groupValues[1].toIntOrNull() ?: return null
    val month = match.groupValues[2].toIntOrNull()?.takeIf { it in 1..12 } ?: return null
    val day = match.groupValues[3].toIntOrNull() ?: return null
    val hour = match.groupValues[4].toIntOrNull()?.takeIf { it in 0..23 } ?: return null
    val minute = match.groupValues[5].toIntOrNull()?.takeIf { it in 0..59 } ?: return null
    val second = match.groupValues[6].toIntOrNull()?.takeIf { it in 0..59 } ?: return null
    if (day !in 1..daysInMonth(year, month)) return null

    val millisecond = match.groupValues[7]
        .takeIf { it.isNotEmpty() }
        ?.padEnd(3, '0')
        ?.take(3)
        ?.toIntOrNull()
        ?: 0
    val offsetMs = parseOffsetMs(match.groupValues[8]) ?: return null

    return isoEpochDay(year, month, day) * MillisPerDay +
        hour * MillisPerHour +
        minute * MillisPerMinute +
        second * MillisPerSecond +
        millisecond -
        offsetMs
}

private fun parseOffsetMs(value: String): Long? {
    if (value == "Z") return 0L
    val sign = when (value.firstOrNull()) {
        '+' -> 1L
        '-' -> -1L
        else -> return null
    }
    val digits = value.drop(1).replace(":", "")
    if (digits.length != 4) return null
    val hours = digits.take(2).toIntOrNull()?.takeIf { it in 0..23 } ?: return null
    val minutes = digits.drop(2).toIntOrNull()?.takeIf { it in 0..59 } ?: return null
    return sign * ((hours * MillisPerHour) + (minutes * MillisPerMinute))
}

private fun isoEpochDay(year: Int, month: Int, day: Int): Long {
    val adjustedYear = year.toLong() - if (month <= 2) 1L else 0L
    val era = if (adjustedYear >= 0L) adjustedYear / 400L else (adjustedYear - 399L) / 400L
    val yearOfEra = adjustedYear - era * 400L
    val adjustedMonth = month.toLong() + if (month > 2) -3L else 9L
    val dayOfYear = (153L * adjustedMonth + 2L) / 5L + day - 1L
    val dayOfEra = yearOfEra * 365L + yearOfEra / 4L - yearOfEra / 100L + dayOfYear
    return era * 146_097L + dayOfEra - 719_468L
}

private fun daysInMonth(year: Int, month: Int): Int =
    when (month) {
        2 -> if (isLeapYear(year)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }

private fun isLeapYear(year: Int): Boolean =
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)

private const val MillisPerSecond = 1_000L
private const val MillisPerMinute = 60L * MillisPerSecond
private const val MillisPerHour = 60L * MillisPerMinute
private const val MillisPerDay = 24L * MillisPerHour
