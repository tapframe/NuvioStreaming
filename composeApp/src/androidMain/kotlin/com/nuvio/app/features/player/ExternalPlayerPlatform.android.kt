package com.nuvio.app.features.player

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.core.content.FileProvider
import java.io.File
import java.net.URI

private const val AndroidSystemPlayerId = "android_system"

internal actual object ExternalPlayerPlatform {
    private var appContext: Context? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
    }

    actual fun defaultPlayerId(): String? = AndroidSystemPlayerId

    actual fun availablePlayers(): List<ExternalPlayerApp> =
        listOf(ExternalPlayerApp(AndroidSystemPlayerId, "Android system player"))

    actual fun open(
        request: ExternalPlayerPlaybackRequest,
        playerId: String?,
    ): ExternalPlayerOpenResult {
        val context = appContext ?: return ExternalPlayerOpenResult.Failed
        val uri = request.sourceUrl.toExternalPlaybackUri(context)
            ?: return ExternalPlayerOpenResult.Failed
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, request.sourceUrl.videoMimeType())
            addCategory(Intent.CATEGORY_DEFAULT)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (uri.scheme.equals("content", ignoreCase = true)) {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            putExtra(Intent.EXTRA_TITLE, request.streamTitle ?: request.title)
            putExtra("title", request.streamTitle ?: request.title)
            if (request.sourceHeaders.isNotEmpty()) {
                putExtra("headers", request.sourceHeaders.toAndroidHeadersBundle())
            }
        }

        return try {
            context.startActivity(intent)
            ExternalPlayerOpenResult.Opened
        } catch (_: ActivityNotFoundException) {
            ExternalPlayerOpenResult.NoPlayerAvailable
        } catch (_: Throwable) {
            ExternalPlayerOpenResult.Failed
        }
    }

    private fun String.toExternalPlaybackUri(context: Context): Uri? {
        val trimmed = trim()
        if (trimmed.isBlank()) return null
        if (!trimmed.startsWith("file:", ignoreCase = true)) {
            return Uri.parse(trimmed)
        }

        val localFile = runCatching { File(URI(trimmed)) }.getOrNull() ?: return Uri.parse(trimmed)
        return runCatching {
            FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                localFile,
            )
        }.getOrNull()
    }
}

private fun Map<String, String>.toAndroidHeadersBundle(): Bundle =
    Bundle().apply {
        forEach { (key, value) ->
            putString(key, value)
        }
    }

private fun String.videoMimeType(): String {
    val normalized = substringBefore('?').substringBefore('#').lowercase()
    return when {
        normalized.endsWith(".m3u8") -> "application/x-mpegURL"
        normalized.endsWith(".mpd") -> "application/dash+xml"
        normalized.endsWith(".mkv") -> "video/x-matroska"
        normalized.endsWith(".webm") -> "video/webm"
        normalized.endsWith(".avi") -> "video/x-msvideo"
        normalized.endsWith(".mov") -> "video/quicktime"
        else -> "video/*"
    }
}
