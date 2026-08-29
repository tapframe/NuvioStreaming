package com.nuvio.app.features.cast

import android.content.Context
import android.util.Log
import java.io.File
import java.lang.reflect.Method
import java.lang.reflect.Proxy

/**
 * Production ffmpeg transcoder using ffmpeg-kit (min-gpl).
 * Uses file-based progressive output: ffmpeg writes to cache file with frag mp4,
 * NanoHTTPD serves file as it grows (chunked). This avoids pipe complexity and
 * works on all Samsung DLNA TV (supports http-get mp4).
 *
 * Command: ffmpeg -y -headers "..." -i <url> -ss <seek> -c:v h264_mediacodec -vf scale -c:a aac -f mp4 -movflags frag_keyframe+empty_moov <output>
 * If hw accel fails, fallback to libx264 ultrafast.
 */
object FfmpegTranscoder {
    private const val TAG = "FfmpegTranscoder"

    data class TranscodeConfig(
        val inputUrl: String,
        val sourceHeaders: Map<String, String>,
        val subtitleUrl: String? = null, // local path after download, burned via subtitles filter
        val seekMs: Long = 0L,
        val maxResolution: CastMaxResolution = CastMaxResolution.P1080,
        val useHardwareAccel: Boolean = true,
        val transcodeAudio: Boolean = true,
        val outputFile: File,
    )

    fun buildCommand(config: TranscodeConfig): String {
        val headersArg = if (config.sourceHeaders.isNotEmpty()) {
            val headerLines = config.sourceHeaders.entries.joinToString("\\r\\n") { "${it.key}: ${it.value}" }
            "-headers \"${headerLines}\\r\\n\""
        } else ""

        val seekArg = if (config.seekMs > 0) "-ss ${config.seekMs / 1000.0}" else ""

        // Build video filter chain: scale + subtitles burn-in if needed
        val filters = mutableListOf<String>()
        when (config.maxResolution) {
            CastMaxResolution.SOURCE -> {}
            CastMaxResolution.P1080 -> filters.add("scale='min(1920,iw)':-2")
            CastMaxResolution.P720 -> filters.add("scale='min(1280,iw)':-2")
            CastMaxResolution.P480 -> filters.add("scale='min(854,iw)':-2")
        }
        config.subtitleUrl?.let { subPath ->
            // Escape path for ffmpeg subtitles filter
            val escaped = subPath.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
            filters.add("subtitles='$escaped'")
        }
        val vfArg = if (filters.isNotEmpty()) "-vf \"${filters.joinToString(",")}\"" else ""

        val videoCodec = if (config.useHardwareAccel) "h264_mediacodec" else "libx264"
        val videoArgs = if (config.useHardwareAccel) {
            "-c:v $videoCodec -b:v 4M -maxrate 6M -pix_fmt yuv420p"
        } else {
            "-c:v $videoCodec -preset ultrafast -crf 23 -pix_fmt yuv420p"
        }

        val audioArgs = if (config.transcodeAudio) "-c:a aac -b:a 128k -ac 2" else "-c:a copy"

        return listOf(
            "-y",
            headersArg,
            seekArg,
            "-i \"${config.inputUrl}\"",
            if (config.subtitleUrl != null && vfArg.isBlank()) "" else vfArg,
            videoArgs,
            audioArgs,
            "-f mp4 -movflags frag_keyframe+empty_moov \"${config.outputFile.absolutePath}\""
        ).filter { it.isNotBlank() }.joinToString(" ")
    }

    /**
     * Starts async ffmpeg to [outputFile] via reflection (optional ffmpeg-kit).
     * Returns opaque session object for cancellation or null if not available (fallback to passthrough).
     */
    fun startAsync(context: Context, config: TranscodeConfig, onComplete: (Boolean) -> Unit = {}): Any? {
        val cmd = buildCommand(config)
        Log.i(TAG, "FFmpeg start: $cmd -> ${config.outputFile}")
        config.outputFile.parentFile?.mkdirs()
        if (config.outputFile.exists()) config.outputFile.delete()
        return try {
            val kitClazz = Class.forName("com.arthenica.ffmpegkit.FFmpegKit")
            val returnCodeClazz = Class.forName("com.arthenica.ffmpegkit.ReturnCode")
            val sessionStateClazz = Class.forName("com.arthenica.ffmpegkit.SessionState")
            val sessionClazz = Class.forName("com.arthenica.ffmpegkit.FFmpegSession")

            val executeAsync = kitClazz.getMethod(
                "executeAsync",
                String::class.java,
                Class.forName("com.arthenica.ffmpegkit.FFmpegSessionCompleteCallback"),
                Class.forName("com.arthenica.ffmpegkit.LogCallback"),
                Class.forName("com.arthenica.ffmpegkit.StatisticsCallback")
            )

            // Build callbacks via dynamic proxy
            val completeCb = Proxy.newProxyInstance(
                kitClazz.classLoader,
                arrayOf(Class.forName("com.arthenica.ffmpegkit.FFmpegSessionCompleteCallback"))
            ) { _, _, args ->
                val sess = args[0]
                val state = sess.javaClass.getMethod("getState").invoke(sess)
                val rc = sess.javaClass.getMethod("getReturnCode").invoke(sess)
                val isSuccess = returnCodeClazz.getMethod("isSuccess", Class.forName("com.arthenica.ffmpegkit.ReturnCode")).invoke(null, rc) as Boolean
                val failedState = sessionStateClazz.getField("FAILED").get(null)
                val completedState = sessionStateClazz.getField("COMPLETED").get(null)
                when {
                    isSuccess -> {
                        Log.i(TAG, "FFmpeg success")
                        onComplete(true)
                    }
                    state == failedState -> {
                        Log.e(TAG, "FFmpeg failed rc=$rc")
                        if (config.useHardwareAccel) {
                            Log.w(TAG, "Retry with libx264")
                            val fallback = config.copy(useHardwareAccel = false)
                            startAsync(context, fallback, onComplete)
                        } else onComplete(false)
                    }
                    state == completedState -> {
                        Log.i(TAG, "FFmpeg completed success=$isSuccess")
                        onComplete(isSuccess)
                    }
                }
                null
            }
            val logCb = Proxy.newProxyInstance(kitClazz.classLoader, arrayOf(Class.forName("com.arthenica.ffmpegkit.LogCallback"))) { _, _, args ->
                val log = args[0]
                val msg = log.javaClass.getMethod("getMessage").invoke(log) as String
                Log.d(TAG, "ffmpeg: $msg")
                null
            }
            val statsCb = Proxy.newProxyInstance(kitClazz.classLoader, arrayOf(Class.forName("com.arthenica.ffmpegkit.StatisticsCallback"))) { _, _, args ->
                // ignore
                null
            }
            executeAsync.invoke(null, cmd, completeCb, logCb, statsCb) as Any
        } catch (e: ClassNotFoundException) {
            Log.w(TAG, "ffmpeg-kit not available, fallback to passthrough: ${e.message}")
            onComplete(false)
            null
        } catch (e: Exception) {
            Log.e(TAG, "ffmpeg start failed", e)
            onComplete(false)
            null
        }
    }

    fun cancel(session: Any?) {
        try {
            session?.javaClass?.getMethod("cancel")?.invoke(session)
        } catch (_: Exception) {}
    }

    fun isAvailable(): Boolean = try {
        Class.forName("com.arthenica.ffmpegkit.FFmpegKit"); true
    } catch (_: Exception) { false }
}
