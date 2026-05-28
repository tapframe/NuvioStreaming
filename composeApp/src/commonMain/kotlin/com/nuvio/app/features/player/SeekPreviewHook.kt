package com.nuvio.app.features.player

import androidx.compose.runtime.Composable

/**
 * commonMain stub — iOS'ta her zaman disabled state döner, hiçbir şey yapmaz.
 *
 * androidMain'deki gerçek implementasyon bu fonksiyonu override eder
 * ve MediaMetadataRetriever ile thumbnail üretir.
 *
 * Bu sayede:
 *   - iOS kodu değişmez
 *   - expect/actual gerekmez
 *   - PlayerScreen.kt commonMain'de kalır
 */
@Composable
internal expect fun rememberAndroidSeekPreview(
    sourceUrl: String?,
    durationMs: Long,
    headers: Map<String, String>,
): SeekPreviewState
