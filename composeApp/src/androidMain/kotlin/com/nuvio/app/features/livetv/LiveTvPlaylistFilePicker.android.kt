package com.nuvio.app.features.livetv

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
internal actual fun rememberLiveTvPlaylistFilePicker(
    onPlaylistLoaded: (fileName: String?, content: String) -> Unit,
    onError: (String) -> Unit,
): LiveTvPlaylistFilePicker {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            val content = context.contentResolver.openInputStream(uri)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            onPlaylistLoaded(uri.displayName(context), content)
        }.onFailure { error ->
            onError(error.message ?: "Failed to read M3U file.")
        }
    }

    return remember(launcher) {
        LiveTvPlaylistFilePicker(canPickFiles = true) {
            launcher.launch(
                arrayOf(
                    "application/x-mpegurl",
                    "application/vnd.apple.mpegurl",
                    "audio/mpegurl",
                    "audio/x-mpegurl",
                    "text/plain",
                    "application/octet-stream",
                ),
            )
        }
    }
}

private fun Uri.displayName(context: android.content.Context): String? {
    val cursor = context.contentResolver.query(this, null, null, null, null) ?: return lastPathSegment
    return cursor.use {
        val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameIndex >= 0 && it.moveToFirst()) it.getString(nameIndex) else lastPathSegment
    }
}
