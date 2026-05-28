package com.nuvio.app.features.player

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.annotation.OptIn
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.transformer.Composition
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import android.media.MediaMetadataRetriever

sealed class ThumbnailResult {
    data class LowRes(val index: Int, val bitmap: ImageBitmap) : ThumbnailResult()
    data class HighRes(val index: Int, val bitmap: ImageBitmap) : ThumbnailResult()
}

internal class SeekPreviewGenerator {

    fun isSupported(sourceUrl: String): Boolean {
        if (sourceUrl.lowercase().startsWith("magnet:")) return false
        return true
    }

    fun generateThumbnails(
        sourceUrl: String,
        durationMs: Long,
        intervalMs: Long,
        headers: Map<String, String>,
    ): Flow<ThumbnailResult> = channelFlow {
        val isHls = sourceUrl.lowercase().contains(".m3u8")
        val hdrs = headers.ifEmpty { emptyMap() }
        val frameCount = (durationMs / intervalMs).toInt().coerceAtLeast(1)

        if (isHls) {
            // HLS: manifest parse edip her pozisyon için doğru segment bul
            val segments = parseHlsSegments(sourceUrl, hdrs)
            if (segments.isEmpty()) return@channelFlow

            suspend fun decodeHlsFrame(
                i: Int, w: Int, h: Int,
            ): Pair<Int, ImageBitmap>? {
                val targetSec = i * intervalMs / 1000.0
                val seg = segments.segmentAt(targetSec) ?: return null
                val offsetUs = ((targetSec - seg.startSec) * 1_000_000).toLong().coerceAtLeast(0L)
                val retriever = MediaMetadataRetriever()
                return try {
                    retriever.setDataSource(seg.url, hdrs)
                    val bmp = retriever.decodeBestFrame(offsetUs, w, h) ?: return null
                    i to bmp
                } catch (_: Exception) { null }
                finally { try { retriever.release() } catch (_: Exception) {} }
            }

            // LowRes — 8 paralel
            (0 until frameCount).chunked((frameCount / 8).coerceAtLeast(1)).map { chunk ->
                async(Dispatchers.IO) {
                    for (i in chunk) {
                        if (!isActive) break
                        val r = decodeHlsFrame(
                            i,
                            SeekPreviewDefaults.LOW_RES_WIDTH_PX,
                            SeekPreviewDefaults.LOW_RES_HEIGHT_PX,
                        ) ?: continue
                        send(ThumbnailResult.LowRes(r.first, r.second))
                    }
                }
            }.awaitAll()

            if (!isActive) return@channelFlow

            // HighRes — 8 paralel
            (0 until frameCount).chunked((frameCount / 8).coerceAtLeast(1)).map { chunk ->
                async(Dispatchers.IO) {
                    for (i in chunk) {
                        if (!isActive) break
                        val r = decodeHlsFrame(
                            i,
                            SeekPreviewDefaults.HIGH_RES_WIDTH_PX,
                            SeekPreviewDefaults.HIGH_RES_HEIGHT_PX,
                        ) ?: continue
                        send(ThumbnailResult.HighRes(r.first, r.second))
                    }
                }
            }.awaitAll()

        } else {
            // Direct URL (MP4, MKV vb.) — 8 paralel retriever
            suspend fun decodeDirectFrame(
                i: Int, w: Int, h: Int,
            ): Pair<Int, ImageBitmap>? {
                val retriever = MediaMetadataRetriever()
                return try {
                    retriever.setDataSource(sourceUrl, hdrs)
                    val bmp = retriever.decodeBestFrame(i * intervalMs * 1_000L, w, h)
                        ?: return null
                    i to bmp
                } catch (_: Exception) { null }
                finally { try { retriever.release() } catch (_: Exception) {} }
            }

            (0 until frameCount).chunked((frameCount / 8).coerceAtLeast(1)).map { chunk ->
                async(Dispatchers.IO) {
                    for (i in chunk) {
                        if (!isActive) break
                        val r = decodeDirectFrame(
                            i,
                            SeekPreviewDefaults.LOW_RES_WIDTH_PX,
                            SeekPreviewDefaults.LOW_RES_HEIGHT_PX,
                        ) ?: continue
                        send(ThumbnailResult.LowRes(r.first, r.second))
                    }
                }
            }.awaitAll()

            if (!isActive) return@channelFlow

            (0 until frameCount).chunked((frameCount / 8).coerceAtLeast(1)).map { chunk ->
                async(Dispatchers.IO) {
                    for (i in chunk) {
                        if (!isActive) break
                        val r = decodeDirectFrame(
                            i,
                            SeekPreviewDefaults.HIGH_RES_WIDTH_PX,
                            SeekPreviewDefaults.HIGH_RES_HEIGHT_PX,
                        ) ?: continue
                        send(ThumbnailResult.HighRes(r.first, r.second))
                    }
                }
            }.awaitAll()
        }
    }.flowOn(Dispatchers.IO)

    // ── HLS ────────────────────────────────────────────────────────────────

    data class HlsSegment(val url: String, val startSec: Double, val durationSec: Double)

    private fun List<HlsSegment>.segmentAt(timeSec: Double): HlsSegment? =
        firstOrNull { timeSec >= it.startSec && timeSec < it.startSec + it.durationSec }
            ?: lastOrNull { timeSec >= it.startSec }

    private fun parseHlsSegments(
        manifestUrl: String,
        headers: Map<String, String>,
    ): List<HlsSegment> = try {
        val masterText = fetchText(manifestUrl, headers)
        val base = manifestUrl.substringBeforeLast("/") + "/"

        // Master playlist ise → en yüksek bandwidth media playlist'i seç
        val mediaPlaylistUrl = masterText.lines()
            .firstOrNull { !it.startsWith("#") && it.isNotBlank() && it.contains(".m3u8") }
            ?.let { if (it.startsWith("http")) it else base + it }
            ?: manifestUrl

        val playlistText = if (mediaPlaylistUrl != manifestUrl)
            fetchText(mediaPlaylistUrl, headers) else masterText
        val playlistBase = mediaPlaylistUrl.substringBeforeLast("/") + "/"

        val segments = mutableListOf<HlsSegment>()
        var segDuration = 0.0
        var elapsed = 0.0

        playlistText.lines().forEach { line ->
            when {
                line.startsWith("#EXTINF:") ->
                    segDuration = line.removePrefix("#EXTINF:").substringBefore(",")
                        .toDoubleOrNull() ?: 0.0
                !line.startsWith("#") && line.isNotBlank() -> {
                    val url = if (line.startsWith("http")) line else playlistBase + line
                    segments += HlsSegment(url, elapsed, segDuration)
                    elapsed += segDuration
                    segDuration = 0.0
                }
            }
        }
        segments
    } catch (_: Exception) { emptyList() }

    private fun fetchText(url: String, headers: Map<String, String>): String {
        val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
        headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
        conn.connectTimeout = 8_000
        conn.readTimeout = 8_000
        return conn.inputStream.bufferedReader().readText().also { conn.disconnect() }
    }
}

// ── MediaMetadataRetriever uzantıları ──────────────────────────────────────

/**
 * MKV/HEVC için 3 strateji dener.
 * Hepsi siyah frame dönerse null.
 */
private fun MediaMetadataRetriever.decodeBestFrame(
    timeUs: Long,
    width: Int,
    height: Int,
): ImageBitmap? {
    val strategies = intArrayOf(
        MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
        MediaMetadataRetriever.OPTION_NEXT_SYNC,
        MediaMetadataRetriever.OPTION_CLOSEST,
    )
    for (opt in strategies) {
        val raw = try {
            getScaledFrameAtTime(timeUs, opt, width, height)
        } catch (_: Exception) { null } ?: continue
        val argb = raw.toArgb()
        if (!argb.isBlack()) return argb.asImageBitmap()
        argb.recycle()
    }
    return null
}

private fun Bitmap.isBlack(): Boolean {
    val stepX = (width / 16).coerceAtLeast(1)
    val stepY = (height / 16).coerceAtLeast(1)
    var dark = 0; var total = 0
    for (x in 0 until width step stepX)
        for (y in 0 until height step stepY) {
            val p = getPixel(x, y)
            if (((p shr 16) and 0xFF) < 20 &&
                ((p shr 8) and 0xFF) < 20 &&
                (p and 0xFF) < 20) dark++
            total++
        }
    return total > 0 && dark.toFloat() / total > 0.90f
}

private fun Bitmap.toArgb(): Bitmap {
    if (config == Bitmap.Config.ARGB_8888) return this
    val dst = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    android.graphics.Canvas(dst).drawBitmap(this, 0f, 0f, null)
    recycle()
    return dst
}
