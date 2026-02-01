package com.nuvio.tv.ui.screens.detail

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

fun formatReleaseDate(isoDate: String): String {
    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val outputFormat = SimpleDateFormat("MMMM d, yyyy", Locale.US)
        val date = inputFormat.parse(isoDate)
        date?.let { outputFormat.format(it) } ?: ""
    } catch (e: Exception) {
        try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val outputFormat = SimpleDateFormat("MMMM d, yyyy", Locale.US)
            val date = inputFormat.parse(isoDate)
            date?.let { outputFormat.format(it) } ?: ""
        } catch (e: Exception) {
            ""
        }
    }
}
