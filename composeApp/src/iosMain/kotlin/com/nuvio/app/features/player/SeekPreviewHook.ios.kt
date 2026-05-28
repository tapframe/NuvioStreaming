package com.nuvio.app.features.player

import androidx.compose.runtime.Composable

/**
 * iOS actual — hiçbir şey yapmaz, disabled state döner.
 * Tek satır. iOS koduna başka hiçbir şey dokunmaz.
 */
@Composable
internal actual fun rememberAndroidSeekPreview(
    sourceUrl: String?,
    durationMs: Long,
    headers: Map<String, String>,
): SeekPreviewState = SeekPreviewState()
