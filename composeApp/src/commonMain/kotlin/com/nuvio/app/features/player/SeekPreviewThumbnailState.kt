package com.nuvio.app.features.player

import androidx.compose.ui.graphics.ImageBitmap

/**
 * Her pozisyon için iki kalite seviyesi tutulur:
 * - lowRes  : 64x36px — hızlı, blurlu placeholder
 * - highRes : 320x180px — kaliteli, sonradan yüklenir
 */
data class SeekPreviewFrame(
    val lowRes: ImageBitmap? = null,
    val highRes: ImageBitmap? = null,
)

data class SeekPreviewState(
    val isEnabled: Boolean = false,
    val isGenerating: Boolean = false,
    val intervalMs: Long = SeekPreviewDefaults.INTERVAL_MS,
    val frames: Map<Int, SeekPreviewFrame> = emptyMap(),
) {
    /** En iyi mevcut frame'i döner — highRes varsa onu, yoksa lowRes */
    fun frameAt(positionMs: Long): SeekPreviewFrame? {
        val index = (positionMs / intervalMs).toInt()
        return frames[index]
            ?: frames[index - 1]
            ?: frames[index + 1]
            ?: frames[index - 2]
            ?: frames[index + 2]
    }

    // Geriye dönük uyumluluk için
    fun thumbnailAt(positionMs: Long) = frameAt(positionMs)?.highRes ?: frameAt(positionMs)?.lowRes
}

object SeekPreviewDefaults {
    // 35 saniyede bir
    const val INTERVAL_MS = 50_000L

    // Düşük kalite — sadece placeholder için, çok hızlı decode edilir
    const val LOW_RES_WIDTH_PX  = 64
    const val LOW_RES_HEIGHT_PX = 36

    // Yüksek kalite — asıl görüntü
    const val HIGH_RES_WIDTH_PX  = 320
    const val HIGH_RES_HEIGHT_PX = 180
}
