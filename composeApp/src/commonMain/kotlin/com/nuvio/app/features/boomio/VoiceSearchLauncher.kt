package com.nuvio.app.features.boomio

import androidx.compose.runtime.Composable

/**
 * Composable effect exposing the platform's speech-to-text dialog.
 *
 * On Android this launches the system voice recognizer
 * (`RecognizerIntent.ACTION_RECOGNIZE_SPEECH`) — the recognizer activity owns
 * the mic, so no RECORD_AUDIO permission is needed on this app. The returned
 * launch lambda reports false when no recognition service is available or the
 * launch fails, so the caller can surface an error.
 *
 * @param prompt Spoken/visible prompt for the recognition dialog.
 * @param onResult Called with the first recognized transcript, or null if the
 *   user cancelled or nothing was heard.
 * @return A lambda that launches voice recognition; true if a dialog started.
 */
@Composable
expect fun rememberSpeechLauncher(
    prompt: String,
    onResult: (String?) -> Unit,
): () -> Boolean
