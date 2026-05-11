package com.nuvio.app.features.home

private val yearRegex = Regex("""\b(19|20)\d{2}\b""")
private val isoDateRegex = Regex("""\d{4}-\d{2}-\d{2}""")

internal fun MetaPreview.isUnreleased(todayIsoDate: String): Boolean {
    rawReleaseDate
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?.let { rawReleased ->
            isoCalendarDateOrNull(rawReleased.substringBefore('T'))?.let { releaseDate ->
                return releaseDate > todayIsoDate
            }
        }

    val info = releaseInfo ?: return false
    isoCalendarDateOrNull(info.trim())?.let { releaseDate ->
        return releaseDate > todayIsoDate
    }

    val releaseYear = yearRegex.find(info)?.value?.toIntOrNull() ?: return false
    val currentYear = todayIsoDate.take(4).toIntOrNull() ?: return false
    return releaseYear > currentYear
}

internal fun HomeCatalogSection.filterReleasedItems(todayIsoDate: String): HomeCatalogSection {
    val filteredItems = items.filterReleasedItems(todayIsoDate)
    return if (filteredItems.size == items.size) this else copy(items = filteredItems)
}

internal fun List<MetaPreview>.filterReleasedItems(todayIsoDate: String): List<MetaPreview> =
    filterNot { item -> item.isUnreleased(todayIsoDate) }

private fun isoCalendarDateOrNull(value: String?): String? {
    val date = value?.trim()?.takeIf { isoDateRegex.matches(it) } ?: return null
    val year = date.substring(0, 4).toIntOrNull() ?: return null
    val month = date.substring(5, 7).toIntOrNull()?.takeIf { it in 1..12 } ?: return null
    val day = date.substring(8, 10).toIntOrNull() ?: return null
    if (day !in 1..daysInMonth(year, month)) return null
    return date
}

private fun daysInMonth(year: Int, month: Int): Int =
    when (month) {
        2 -> if (isLeapYear(year)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }

private fun isLeapYear(year: Int): Boolean =
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
