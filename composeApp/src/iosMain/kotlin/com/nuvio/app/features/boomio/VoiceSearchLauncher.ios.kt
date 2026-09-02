package com.nuvio.app.features.boomio

import androidx.compose.runtime.Composable

/**
 * iOS actual: no system speech dialog is wired up for the companion remote —
 * the launch lambda always reports failure so callers can fall back gracefully.
 */
@Composable
actual fun rememberSpeechLauncher(
    prompt: String,
    onResult: (String?) -> Unit,
): () -> Boolean = { false }
