package com.nuvio.app.features.player

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

@Composable
actual fun rememberExternalPlayerLauncher(
    onResult: (ExternalPlaybackResult?) -> Unit,
): (ExternalPlayerIntentResult.Success) -> Boolean {
    val launcher = rememberLauncherForActivityResult(
        contract = ExternalPlayerActivityContract(),
    ) { playerResult ->
        val commonResult = playerResult?.let {
            ExternalPlaybackResult(
                positionMs = it.positionMs,
                durationMs = it.durationMs,
                endedByUser = it.endedByUser,
            )
        }
        onResult(commonResult)
    }

    return remember(launcher) {
        { intentResult: ExternalPlayerIntentResult.Success ->
            val intent = intentResult.intent
            if (intent is Intent) {
                try {
                    launcher.launch(intent)
                    true
                } catch (_: Throwable) {
                    false
                }
            } else {
                false
            }
        }
    }
}
