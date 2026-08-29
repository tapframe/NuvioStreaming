package com.nuvio.app.features.cast

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile

/**
 * Transcoding proxy that writes ffmpeg output to a cache file and serves it progressively.
 * TV can start playback immediately (frag mp4 with empty moov), seeking restarts transcode with -ss.
 */
class TranscodingProxyServer(
    private val appContext: Context,
    port: Int,
    sourceUrl: String,
    sourceHeaders: Map<String, String>,
    mimeType: String = "video/mp4",
    private val shouldTranscode: Boolean = false,
    private val maxResolution: CastMaxResolution = CastMaxResolution.P1080,
    private val useHardwareAccel: Boolean = true,
    private val subtitleFile: File? = null,
) : LocalHttpProxyServer(port, sourceUrl, sourceHeaders, mimeType) {

    private var ffmpegSession: Any? = null
    private var outputFile: File? = null
    private var startTimeMs: Long = 0L

    companion object {
        private const val TAG = "TranscodingProxy"
    }

    private fun getOutputFile(): File {
        if (outputFile != null) return outputFile!!
        val dir = File(appContext.cacheDir, "dlna_transcode")
        dir.mkdirs()
        // Clean old files older than 1h
        dir.listFiles()?.forEach { f ->
            if (System.currentTimeMillis() - f.lastModified() > 3600_000) try { f.delete() } catch (_: Exception) {}
        }
        val safeHash = (sourceUrl.hashCode().toString() + System.currentTimeMillis()).hashCode().toString().replace("-", "n")
        val f = File(dir, "cast_${safeHash}.mp4")
        outputFile = f
        return f
    }

    override fun serveVideo(session: IHTTPSession, isHead: Boolean): Response {
        if (!shouldTranscode || isHead) {
            return super.serveVideo(session, isHead)
        }

        val file = getOutputFile()
        // Start ffmpeg on first request or if seek detected via Range (restart)
        val range = session.headers["range"] ?: session.headers["Range"]
        val seekMs = parseRangeToMs(range, session.parms["seekMs"]?.toLongOrNull())

        if (ffmpegSession == null || file.length() == 0L || seekMs != startTimeMs) {
            // Restart transcode with seek
            try { FfmpegTranscoder.cancel(ffmpegSession) } catch (_: Exception) {}
            try { if (file.exists()) file.delete() } catch (_: Exception) {}
            startTimeMs = seekMs
            val cfg = FfmpegTranscoder.TranscodeConfig(
                inputUrl = sourceUrl,
                sourceHeaders = sourceHeaders,
                subtitleUrl = subtitleFile?.absolutePath,
                seekMs = seekMs,
                maxResolution = maxResolution,
                useHardwareAccel = useHardwareAccel,
                outputFile = file
            )
            ffmpegSession = FfmpegTranscoder.startAsync(appContext, cfg) { success ->
                Log.i(TAG, "Transcode finished success=$success file=${file.length()}")
            }
            // Give ffmpeg 800ms to write moov
            try { Thread.sleep(800) } catch (_: Exception) {}
        }

        return serveGrowingFile(session, file)
    }

    private fun serveGrowingFile(session: IHTTPSession, file: File): Response {
        val range = session.headers["range"] ?: session.headers["Range"]
        return try {
            if (range != null && range.startsWith("bytes=")) {
                // Simple range support: parse start
                val start = range.substringAfter("bytes=").substringBefore("-").toLongOrNull() ?: 0L
                val raf = RandomAccessFile(file, "r")
                raf.seek(start.coerceAtMost(file.length()))
                val remaining = file.length() - start
                val fis = FileInputStream(raf.fd)
                // For growing file we use chunked; TV handles
                val resp = newChunkedResponse(Response.Status.PARTIAL_CONTENT, "video/mp4", fis)
                resp.addHeader("Content-Range", "bytes $start-${file.length()-1}/${file.length()}")
                resp.addHeader("Accept-Ranges", "bytes")
                resp.addHeader("transferMode.dlna.org", "Streaming")
                resp.addHeader("contentFeatures.dlna.org", "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000")
                resp
            } else {
                // No range - serve progressive file as chunked, tailing as it grows
                val growingInput = GrowingFileInputStream(file, ffmpegSession)
                val resp = newChunkedResponse(Response.Status.OK, "video/mp4", growingInput)
                resp.addHeader("Accept-Ranges", "bytes")
                resp.addHeader("transferMode.dlna.org", "Streaming")
                resp.addHeader("contentFeatures.dlna.org", "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000")
                resp.addHeader("Access-Control-Allow-Origin", "*")
                resp
            }
        } catch (e: Exception) {
            Log.e(TAG, "serveGrowingFile error", e)
            super.serveVideo(session, false)
        }
    }

    private fun parseRangeToMs(range: String?, seekParam: Long?): Long {
        seekParam?.let { if (it > 0) return it }
        if (range == null) return 0L
        // For transcoded file we don't know byte->time mapping; ignore range and start 0 (TV will re-request with seek via separate control)
        // Better to parse time via DLNA Seek (REL_TIME) handled separately; proxy Range is ignored for transcode.
        return 0L
    }

    override fun stop() {
        try { FfmpegTranscoder.cancel(ffmpegSession) } catch (_: Exception) {}
        ffmpegSession = null
        // Keep file for a moment, delete on next transcode
        super.stop()
    }

    /**
     * InputStream that reads file as it grows while ffmpeg writes.
     * Blocks up to 5s when EOF but ffmpeg still running.
     */
    private class GrowingFileInputStream(
        private val file: File,
        private val session: Any?
    ) : java.io.InputStream() {
        private var raf = RandomAccessFile(file, "r")
        private var pos: Long = 0
        private var eofStreak = 0

        private fun isRunning(): Boolean {
            return try {
                val state = session?.javaClass?.getMethod("getState")?.invoke(session)
                state?.toString() == "RUNNING"
            } catch (_: Exception) { false }
        }

        override fun read(): Int {
            while (true) {
                if (pos < file.length()) {
                    raf.seek(pos)
                    val b = raf.read()
                    if (b != -1) {
                        pos++
                        eofStreak = 0
                        return b
                    }
                }
                if (!isRunning() && pos >= file.length()) {
                    return -1
                }
                if (eofStreak++ > 50) return -1 // 5s timeout
                try { Thread.sleep(100) } catch (_: Exception) { return -1 }
            }
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            while (true) {
                if (pos < file.length()) {
                    raf.seek(pos)
                    val available = (file.length() - pos).coerceAtMost(len.toLong()).toInt()
                    val read = raf.read(b, off, available.coerceAtLeast(1))
                    if (read > 0) {
                        pos += read
                        eofStreak = 0
                        return read
                    }
                }
                if (!isRunning() && pos >= file.length()) return -1
                if (eofStreak++ > 50) return -1
                try { Thread.sleep(100) } catch (_: Exception) { return -1 }
            }
        }

        override fun close() {
            try { raf.close() } catch (_: Exception) {}
            super.close()
        }
    }
}
