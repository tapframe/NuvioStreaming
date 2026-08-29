package com.nuvio.app.features.cast

import android.util.Log
import java.io.InputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.Future

/**
 * Wrapper around ffmpeg-kit for live DLNA transcoding.
 * Falls back gracefully if ffmpeg-kit is not on classpath (e.g. in tests / iOS stub builds).
 *
 * Live pipeline:  ffmpeg -headers "X: Y\r\n" -i <inputUrl> -ss <seek> -c:v <codec> -vf scale... -c:a aac ... -f mp4 -movflags frag_keyframe+empty_moov pipe:1
 * The output InputStream is piped to NanoHTTPD chunked response.
 *
 * For now we use reflection to avoid hard compile dependency on ffmpeg-kit when not present.
 * When ffmpeg-kit is added to build.gradle.kts, reflection will resolve to real FFmpegKit.
 */
object FfmpegTranscoder {
    private const val TAG = "FfmpegTranscoder"

    data class TranscodeConfig(
        val inputUrl: String,
        val sourceHeaders: Map<String, String>,
        val seekMs: Long = 0L,
        val maxResolution: CastMaxResolution = CastMaxResolution.P1080,
        val useHardwareAccel: Boolean = true,
        val transcodeAudio: Boolean = true,
        val mimeHint: String = "video/mp4",
    )

    // Heuristic: detect if input is already AVC (no transcode needed) - caller should check CastSettings.shouldTranscodeForCodec()
    fun buildCommand(config: TranscodeConfig): String {
        val headersArg = if (config.sourceHeaders.isNotEmpty()) {
            val headerLines = config.sourceHeaders.entries.joinToString("\\r\\n") { "${it.key}: ${it.value}" }
            // ffmpeg -headers expects each line ends with \r\n
            "-headers \"$headerLines\\r\\n\""
        } else ""

        val seekArg = if (config.seekMs > 0) "-ss ${config.seekMs / 1000.0}" else ""

        val scaleFilter = when (config.maxResolution) {
            CastMaxResolution.SOURCE -> ""
            CastMaxResolution.P1080 -> "-vf \"scale='min(1920,iw)':-2\""
            CastMaxResolution.P720 -> "-vf \"scale='min(1280,iw)':-2\""
            CastMaxResolution.P480 -> "-vf \"scale='min(854,iw)':-2\""
        }

        val videoCodec = if (config.useHardwareAccel) "h264_mediacodec" else "libx264"
        val videoArgs = if (config.useHardwareAccel) {
            "-c:v $videoCodec -b:v 4M -maxrate 6M"
        } else {
            "-c:v $videoCodec -preset ultrafast -crf 23"
        }

        val audioArgs = if (config.transcodeAudio) "-c:a aac -b:a 128k -ac 2" else "-c:a copy"

        // Use frag MP4 for streaming (moov at start, no seek index required)
        return listOf(
            headersArg,
            seekArg,
            "-i \"${config.inputUrl}\"",
            videoArgs,
            scaleFilter,
            audioArgs,
            "-f mp4 -movflags frag_keyframe+empty_moov pipe:1"
        ).filter { it.isNotBlank() }.joinToString(" ")
    }

    /**
     * Starts an ffmpeg process and returns InputStream of stdout.
     * Uses ProcessBuilder fallback if ffmpeg-kit not available.
     * Caller must close stream when done and call future.cancel(true).
     */
    fun start(config: TranscodeConfig): Pair<InputStream, Future<*>>? {
        val command = buildCommand(config)
        Log.i(TAG, "Starting transcode: ffmpeg $command")
        return tryStartWithFfmpegKit(command) ?: tryStartWithProcess(command)
    }

    private fun tryStartWithFfmpegKit(command: String): Pair<InputStream, Future<*>>? {
        return try {
            // Reflective call to com.arthenica.ffmpegkit.FFmpegKit.executeAsync
            val ffmpegKitClazz = Class.forName("com.arthenica.ffmpegkit.FFmpegKit")
            val sessionClazz = Class.forName("com.arthenica.ffmpegkit.FFmpegSession")
            // For pipe mode, ffmpeg-kit cannot easily give InputStream, we use file pipe temp?
            // Instead we fallback to ProcessBuilder for true streaming.
            // Return null to trigger ProcessBuilder path.
            Log.d(TAG, "ffmpeg-kit found but using ProcessBuilder for pipe streaming")
            null
        } catch (e: ClassNotFoundException) {
            Log.w(TAG, "ffmpeg-kit not on classpath, transcoding will use ProcessBuilder or fail gracefully")
            null
        } catch (e: Exception) {
            Log.w(TAG, "ffmpeg-kit reflection failed: ${e.message}")
            null
        }
    }

    private fun tryStartWithProcess(command: String): Pair<InputStream, Future<*>>? {
        return try {
            // For environments without ffmpeg binary (emulator), we cannot spawn ffmpeg.
            // Return null so caller falls back to passthrough proxy.
            val ffmpegBinary = findFfmpegBinary() ?: run {
                Log.w(TAG, "ffmpeg binary not found on device, fallback to passthrough")
                return null
            }
            val fullCmd = "$ffmpegBinary $command"
            Log.i(TAG, "Exec: $fullCmd")
            val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", fullCmd))
            val executor = Executors.newSingleThreadExecutor()
            val future = executor.submit {
                val err = process.errorStream.bufferedReader().readText()
                if (err.isNotBlank()) Log.w(TAG, "ffmpeg stderr: ${err.take(2000)}")
                process.waitFor()
                Log.i(TAG, "ffmpeg exited ${process.exitValue()}")
            }
            // Wrap stdout as InputStream; if process fails, stream will close
            val input: InputStream = process.inputStream
            input to future
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start ffmpeg process", e)
            null
        }
    }

    private fun findFfmpegBinary(): String? {
        // Check common locations; on Android ffmpeg-kit provides lib, not binary.
        // We ship via ffmpeg-kit, so binary not directly accessible.
        // For now return null to indicate we should use passthrough.
        // When ffmpeg-kit is integrated properly, use FFmpegKitConfig.getFFmpegSessions etc.
        return null
    }

    fun isAvailable(): Boolean {
        return try {
            Class.forName("com.arthenica.ffmpegkit.FFmpegKit")
            true
        } catch (_: Exception) {
            false
        }
    }
}
