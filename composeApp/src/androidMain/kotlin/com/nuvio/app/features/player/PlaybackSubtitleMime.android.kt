package com.nuvio.app.features.player

import androidx.media3.common.MimeTypes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

internal suspend fun resolveSubtitleMimeType(url: String, headers: Map<String, String>? = null): String =
    withContext(Dispatchers.IO) {
        resolveSubtitleMimeTypeBlocking(url, headers)
    }

private fun resolveSubtitleMimeTypeBlocking(url: String, headers: Map<String, String>?): String {
    probeSubtitleHeaders(url, headers)?.let { (contentType, contentDisposition) ->
        mapSubtitleMime(contentType)?.let { return it }
        filenameFromContentDisposition(contentDisposition)?.let(::guessSubtitleMime)?.let { return it }
    }
    return guessSubtitleMime(url)
}

private fun probeSubtitleHeaders(url: String, headers: Map<String, String>? = null): Pair<String?, String?>? {
    val methods = listOf("HEAD", "GET")
    methods.forEach { method ->
        runCatching {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 5_000
                readTimeout = 5_000
                instanceFollowRedirects = true
                setRequestProperty("Accept", "*/*")
                headers?.forEach { (key, value) ->
                    setRequestProperty(key, value)
                }
            }
            try {
                connection.responseCode
                connection.contentType to connection.getHeaderField("Content-Disposition")
            } finally {
                connection.disconnect()
            }
        }.getOrNull()?.let { return it }
    }
    return null
}

private fun mapSubtitleMime(contentType: String?): String? {
    val normalized = contentType
        ?.substringBefore(';')
        ?.trim()
        ?.lowercase()
        ?: return null

    return when (normalized) {
        "application/x-subrip",
        "application/srt",
        "text/srt",
        "text/plain" -> MimeTypes.APPLICATION_SUBRIP
        "text/vtt",
        "application/vtt" -> MimeTypes.TEXT_VTT
        "text/x-ssa",
        "text/ssa",
        "text/ass",
        "application/x-ssa" -> MimeTypes.TEXT_SSA
        "application/ttml+xml",
        "text/xml",
        "application/xml" -> MimeTypes.APPLICATION_TTML
        else -> null
    }
}

private fun filenameFromContentDisposition(contentDisposition: String?): String? =
    contentDisposition
        ?.substringAfter("filename=", missingDelimiterValue = "")
        ?.trim()
        ?.trim('"')
        ?.takeIf { it.isNotEmpty() }

private fun guessSubtitleMime(url: String): String {
    val lower = url.lowercase()
    return when {
        lower.contains(".srt") -> MimeTypes.APPLICATION_SUBRIP
        lower.contains(".vtt") || lower.contains(".webvtt") -> MimeTypes.TEXT_VTT
        lower.contains(".ass") || lower.contains(".ssa") -> MimeTypes.TEXT_SSA
        lower.contains(".ttml") || lower.contains(".dfxp") || lower.contains(".xml") -> MimeTypes.APPLICATION_TTML
        else -> MimeTypes.TEXT_VTT
    }
}

