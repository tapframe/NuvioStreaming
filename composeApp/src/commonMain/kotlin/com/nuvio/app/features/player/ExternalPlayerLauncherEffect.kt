package com.nuvio.app.features.player

import androidx.compose.runtime.Composable

/**
 * Common playback result from an external player.
 * Mirrors ExternalPlayerResultParser.PlaybackResult but lives in commonMain.
 */
data class ExternalPlaybackResult(
    val positionMs: Long,
    val durationMs: Long?,
    val endedByUser: Boolean,
)

/**
 * A composable effect that registers a platform-specific external player launcher.
 *
 * On Android, this registers an ActivityResultLauncher using ExternalPlayerActivityContract.
 * On iOS, this falls back to the fire-and-forget open() approach.
 *
 * @param onResult Called when the external player returns a result (Android only).
 * @return A lambda that accepts an ExternalPlayerIntentResult.Success and launches the external player.
 */
@Composable
expect fun rememberExternalPlayerLauncher(
    onResult: (ExternalPlaybackResult?) -> Unit,
): (ExternalPlayerIntentResult.Success) -> Boolean
