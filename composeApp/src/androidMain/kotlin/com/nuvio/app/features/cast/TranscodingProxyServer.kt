package com.nuvio.app.features.cast

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.InputStream

/**
 * Extends LocalHttpProxyServer with optional ffmpeg live transcode.
 * When transcode is enabled and codec hint says HEVC/AV1, it pipes ffmpeg stdout instead of direct relay.
 * Falls back to passthrough if ffmpeg not available.
 */
class TranscodingProxyServer(
    port: Int,
    sourceUrl: String,
    sourceHeaders: Map<String, String>,
    mimeType: String = "video/mp4",
    private val shouldTranscode: Boolean = false,
    private val maxResolution: CastMaxResolution = CastMaxResolution.P1080,
    private val useHardwareAccel: Boolean = true,
) : LocalHttpProxyServer(port, sourceUrl, sourceHeaders, mimeType) {

    private var transcodeStream: InputStream? = null
    private var transcodeFuture: java.util.concurrent.Future<*>? = null

    companion object {
        private const val TAG = "TranscodingProxy"
    }

    override fun serveVideo(session: IHTTPSession, isHead: Boolean): Response {
        if (!shouldTranscode || isHead) {
            return super.serveVideo(session, isHead)
        }

        // Try to start ffmpeg transcode
        val range = session.headers["range"] ?: session.headers["Range"]
        val seekMs = parseRangeToSeekMs(range)
        val config = FfmpegTranscoder.TranscodeConfig(
            inputUrl = getSourceUrlForTranscode(),
            sourceHeaders = getSourceHeadersForTranscode(),
            seekMs = seekMs,
            maxResolution = maxResolution,
            useHardwareAccel = useHardwareAccel,
        )
        val result = FfmpegTranscoder.start(config)
        if (result != null) {
            transcodeStream = result.first
            transcodeFuture = result.second
            Log.i(TAG, "Serving transcoded stream seekMs=$seekMs")
            val response = newChunkedResponse(Response.Status.OK, "video/mp4", result.first)
            response.addHeader("Accept-Ranges", "none")
            response.addHeader("transferMode.dlna.org", "Streaming")
            response.addHeader("contentFeatures.dlna.org", "DLNA.ORG_OP=00;DLNA.ORG_CI=1;DLNA.ORG_FLAGS=01500000000000000000000000000000")
            response.addHeader("Access-Control-Allow-Origin", "*")
            return response
        } else {
            Log.w(TAG, "Transcoder unavailable, fallback to passthrough")
            return super.serveVideo(session, isHead)
        }
    }

    private fun getSourceUrlForTranscode(): String = sourceUrl

    private fun getSourceHeadersForTranscode(): Map<String, String> = sourceHeaders

    private fun parseRangeToSeekMs(range: String?): Long {
        if (range == null) return 0L
        // Range: bytes=12345-
        return try {
            val bytes = range.substringAfter("bytes=").substringBefore("-").trim().toLongOrNull() ?: 0L
            // Approx: assume 5 Mbps ~ 625KB/s => ms ~ bytes / 625
            // Better: just let ffmpeg -ss handle seconds if we knew duration/bitrate, else 0
            // For MVP we ignore range for transcode (start from 0), TV will buffer
            0L
        } catch (_: Exception) {
            0L
        }
    }

    override fun stop() {
        try {
            transcodeStream?.close()
        } catch (_: Exception) {}
        try {
            transcodeFuture?.cancel(true)
        } catch (_: Exception) {}
        super.stop()
    }
}
