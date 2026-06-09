package com.nuvio.app.features.player

import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import java.util.Locale

internal fun playbackMediaItemFromUrl(
    url: String,
    responseHeaders: Map<String, String> = emptyMap(),
): MediaItem {
    val builder = MediaItem.Builder().setUri(url)
    inferPlaybackMimeType(
        url = url,
        responseHeaders = responseHeaders,
    )?.let(builder::setMimeType)
    return builder.build()
}

private fun inferPlaybackMimeType(
    url: String,
    responseHeaders: Map<String, String>,
): String? =
    inferMimeTypeFromResponseHeaders(responseHeaders)
        ?: inferMimeTypeFromPath(url)

private fun inferMimeTypeFromResponseHeaders(headers: Map<String, String>): String? {
    if (headers.isEmpty()) return null

    headers.entries
        .firstOrNull { (key, _) -> key.equals("Content-Type", ignoreCase = true) }
        ?.value
        ?.let(::normalizeMimeType)
        ?.let { return it }

    val contentDisposition = headers.entries
        .firstOrNull { (key, _) -> key.equals("Content-Disposition", ignoreCase = true) }
        ?.value
        ?: return null

    val filename = contentDisposition
        .substringAfter("filename*=", missingDelimiterValue = "")
        .substringAfterLast("''", missingDelimiterValue = "")
        .ifBlank {
            contentDisposition.substringAfter("filename=", missingDelimiterValue = "")
        }
        .trim()
        .trim('"', '\'')
        .takeIf { it.isNotBlank() }

    return inferMimeTypeFromPath(filename)
}

private fun normalizeMimeType(contentType: String?): String? {
    val normalized = contentType
        ?.substringBefore(';')
        ?.trim()
        ?.lowercase(Locale.US)
        ?: return null

    return when (normalized) {
        "application/vnd.apple.mpegurl",
        "application/mpegurl",
        "application/x-mpegurl",
        "audio/mpegurl",
        "audio/x-mpegurl",
        "application/m3u8" -> MimeTypes.APPLICATION_M3U8

        "application/dash+xml",
        "video/vnd.mpeg.dash.mpd" -> MimeTypes.APPLICATION_MPD

        "application/vnd.ms-sstr+xml" -> MimeTypes.APPLICATION_SS

        "video/mp4",
        "application/mp4",
        "video/x-m4v" -> MimeTypes.VIDEO_MP4

        "video/webm",
        "audio/webm" -> MimeTypes.VIDEO_WEBM

        "video/x-matroska",
        "audio/x-matroska",
        "video/mkv",
        "audio/mkv" -> MimeTypes.VIDEO_MATROSKA

        else -> null
    }
}

private fun inferMimeTypeFromPath(path: String?): String? {
    val normalized = path
        ?.trim()
        ?.lowercase(Locale.US)
        ?.takeIf { it.isNotBlank() }
        ?: return null
    val pathWithoutFragment = normalized.substringBefore('#')
    val pathPart = pathWithoutFragment.substringBefore('?')
    val queryPart = pathWithoutFragment.substringAfter('?', missingDelimiterValue = "")
    val fileName = pathPart.substringAfterLast('/')
    val extension = fileName.substringAfterLast('.', missingDelimiterValue = "")

    return when {
        extension == "m3u8" -> MimeTypes.APPLICATION_M3U8
        extension == "mpd" -> MimeTypes.APPLICATION_MPD
        extension == "ism" || extension == "isml" -> MimeTypes.APPLICATION_SS
        extension == "mkv" -> MimeTypes.VIDEO_MATROSKA
        extension == "webm" -> MimeTypes.VIDEO_WEBM
        extension == "mp4" || extension == "m4v" -> MimeTypes.VIDEO_MP4
        extension == "ts" || extension == "mts" || extension == "m2ts" -> MimeTypes.VIDEO_MP2T
        extension == "mov" -> MIME_VIDEO_QUICK_TIME
        extension == "avi" -> MimeTypes.VIDEO_AVI
        extension == "mpeg" || extension == "mpg" -> MimeTypes.VIDEO_MPEG
        else -> inferMimeTypeFromQuery(queryPart)
            ?: inferMimeTypeFromDelimitedToken(pathPart)
            ?: inferMimeTypeFromDelimitedToken(queryPart)
    }
}

private fun inferMimeTypeFromQuery(query: String): String? {
    if (query.isBlank()) return null

    query.split('&').forEach { parameter ->
        val key = parameter.substringBefore('=', missingDelimiterValue = "").trim()
        val value = parameter.substringAfter('=', missingDelimiterValue = "").trim()
        if (key.isBlank() || value.isBlank()) return@forEach

        when (key) {
            "format",
            "mime",
            "mime_type",
            "contenttype",
            "content_type",
            "type",
            "ext",
            "extension",
            "output" -> when (value.substringAfterLast('/').substringAfterLast('.')) {
                "m3u8" -> return MimeTypes.APPLICATION_M3U8
                "mpd" -> return MimeTypes.APPLICATION_MPD
                "ism", "isml" -> return MimeTypes.APPLICATION_SS
                "mkv" -> return MimeTypes.VIDEO_MATROSKA
                "webm" -> return MimeTypes.VIDEO_WEBM
                "mp4", "m4v" -> return MimeTypes.VIDEO_MP4
                "ts", "mts", "m2ts" -> return MimeTypes.VIDEO_MP2T
                "mov" -> return MIME_VIDEO_QUICK_TIME
                "avi" -> return MimeTypes.VIDEO_AVI
                "mpeg", "mpg" -> return MimeTypes.VIDEO_MPEG
            }
        }

        when (value) {
            "application/vnd.apple.mpegurl",
            "application/mpegurl",
            "application/x-mpegurl",
            "audio/mpegurl",
            "audio/x-mpegurl",
            "application/m3u8",
            "hls" -> return MimeTypes.APPLICATION_M3U8
            "application/dash+xml",
            "video/vnd.mpeg.dash.mpd",
            "dash" -> return MimeTypes.APPLICATION_MPD
            "application/vnd.ms-sstr+xml",
            "smoothstreaming",
            "ss" -> return MimeTypes.APPLICATION_SS
        }
    }

    return null
}

private fun inferMimeTypeFromDelimitedToken(value: String): String? =
    when {
        DELIMITED_M3U8_PATTERN.containsMatchIn(value) -> MimeTypes.APPLICATION_M3U8
        DELIMITED_MPD_PATTERN.containsMatchIn(value) -> MimeTypes.APPLICATION_MPD
        DELIMITED_SS_PATTERN.containsMatchIn(value) -> MimeTypes.APPLICATION_SS
        else -> null
    }

private const val MIME_VIDEO_QUICK_TIME = "video/quicktime"
private val DELIMITED_M3U8_PATTERN = Regex("(^|[=/_.?&-])m3u8($|[=/_.?&-])")
private val DELIMITED_MPD_PATTERN = Regex("(^|[=/_.?&-])mpd($|[=/_.?&-])")
private val DELIMITED_SS_PATTERN = Regex("(^|[=/_.?&-])(ism|isml)($|[=/_.?&-])")
