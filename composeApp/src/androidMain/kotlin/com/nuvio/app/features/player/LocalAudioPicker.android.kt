package com.nuvio.app.features.player

import android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
internal actual fun rememberLocalAudioPicker(onPicked: (String) -> Unit): () -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
        onResult = { uri ->
            if (uri == null) {
                logLocalAudio(context, "local audio pick cancelled")
                return@rememberLauncherForActivityResult
            }
            runCatching {
                context.contentResolver.takePersistableUriPermission(uri, FLAG_GRANT_READ_URI_PERMISSION)
            }
            logLocalAudio(context, "local audio picked uri=$uri")
            onPicked(uri.toString())
        },
    )
    return remember { { launcher.launch(arrayOf("audio/*")) } }
}
