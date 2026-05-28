package com.nuvio.app.features.player

import androidx.compose.runtime.*
import kotlinx.coroutines.flow.catch

@Composable
internal actual fun rememberAndroidSeekPreview(
    sourceUrl: String?,
    durationMs: Long,
    headers: Map<String, String>,
): SeekPreviewState {
    var state by remember { mutableStateOf(SeekPreviewState()) }
    val generator = remember { SeekPreviewGenerator() }

    LaunchedEffect(sourceUrl) {
        state = SeekPreviewState()
    }

    LaunchedEffect(sourceUrl, durationMs) {
        val url = sourceUrl ?: return@LaunchedEffect
        if (durationMs < 30_000L) return@LaunchedEffect
        if (!generator.isSupported(url)) return@LaunchedEffect

        state = SeekPreviewState(isEnabled = true, isGenerating = true)

        val frames = mutableMapOf<Int, SeekPreviewFrame>()
        val totalFrames = (durationMs / SeekPreviewDefaults.INTERVAL_MS).toInt().coerceAtLeast(1)

        generator.generateThumbnails(
            sourceUrl = url,
            durationMs = durationMs,
            intervalMs = SeekPreviewDefaults.INTERVAL_MS,
            headers = headers,
        ).catch { }.collect { result ->
            when (result) {
                is ThumbnailResult.LowRes -> {
                    val existing = frames[result.index] ?: SeekPreviewFrame()
                    frames[result.index] = existing.copy(lowRes = result.bitmap)
                }
                is ThumbnailResult.HighRes -> {
                    val existing = frames[result.index] ?: SeekPreviewFrame()
                    frames[result.index] = existing.copy(highRes = result.bitmap)
                }
            }
            state = state.copy(
                frames = frames.toMap(),
                // Tüm highRes yüklenince tamamlandı say
                isGenerating = frames.values.count { it.highRes != null } < totalFrames,
            )
        }

        state = state.copy(isGenerating = false)
    }

    return state
}
