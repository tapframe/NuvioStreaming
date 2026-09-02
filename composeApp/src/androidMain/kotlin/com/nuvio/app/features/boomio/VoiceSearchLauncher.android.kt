package com.nuvio.app.features.boomio

import android.content.Context
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * Android actual: launches the system voice-recognition dialog via
 * [RecognizerIntent]. The recognizer activity (Google) owns the mic, so this
 * app needs no RECORD_AUDIO permission.
 */
@Composable
actual fun rememberSpeechLauncher(
    prompt: String,
    onResult: (String?) -> Unit,
): () -> Boolean {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val transcript = result.data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?.firstOrNull()
        onResult(transcript)
    }
    return remember(launcher) {
        val available = hasRecognitionService(context)
        fun launch(): Boolean {
            if (!available) return false
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                )
                putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            return try {
                launcher.launch(intent)
                true
            } catch (_: Throwable) {
                false
            }
        }
        { launch() }
    }
}

private fun hasRecognitionService(context: Context): Boolean = try {
    context.packageManager
        .queryIntentActivities(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH),
            0,
        )
        .isNotEmpty()
} catch (_: Throwable) {
    false
}
