package com.nuvio.app.features.player

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.coroutines.coroutineContext

internal data class LibmpvAddonSubtitleRequest(
    val trackId: String,
    val url: String,
)

/**
 * Downloads addon subtitles outside mpv, whose synchronous sub-add network open can delay A/V.
 * Files live only for the current source because mpv may retain them for later sid reuse.
 */
internal class LibmpvAddonSubtitleLoader(
    private val cacheDirectory: File,
    private val dataSourceFactory: () -> DataSource.Factory,
    private val maxFileBytes: Long = 10L * 1024L * 1024L,
    private val maxSourceBytes: Long = 32L * 1024L * 1024L,
    private val maxSourceFiles: Int = 64,
) {
    private val loadMutex = Mutex()
    private val stateLock = Any()
    private val cachedFiles = linkedMapOf<String, File>()
    private var sourceGeneration = 0L
    private var activeDataSource: DataSource? = null

    init {
        cacheDirectory.listFiles().orEmpty().forEach(File::delete)
    }

    suspend fun load(request: LibmpvAddonSubtitleRequest): File = loadMutex.withLock {
        coroutineContext.ensureActive()
        val key = request.cacheKey()
        synchronized(stateLock) {
            cachedFiles[key]?.takeIf(File::isFile)?.let { return@withLock it }
        }

        val generation = synchronized(stateLock) { sourceGeneration }
        cacheDirectory.mkdirs()
        val target = File(cacheDirectory, "$key.${request.subtitleExtension()}")
        val partial = File(cacheDirectory, "$key.part")
        partial.delete()
        val dataSource = dataSourceFactory().createDataSource()
        synchronized(stateLock) {
            activeDataSource = dataSource
        }

        try {
            val size = runInterruptible(Dispatchers.IO) {
                download(request.url, dataSource, partial)
            }
            coroutineContext.ensureActive()
            synchronized(stateLock) {
                if (generation != sourceGeneration) throw CancellationException("Playback source changed")
                val totalBytes = cachedFiles.values.sumOf(File::length)
                if (cachedFiles.size >= maxSourceFiles || totalBytes + size > maxSourceBytes) {
                    throw IOException("libmpv addon subtitle cache limit exceeded")
                }
                if (!partial.renameTo(target)) {
                    throw IOException("Unable to publish staged libmpv subtitle")
                }
                cachedFiles[key] = target
            }
            target
        } finally {
            synchronized(stateLock) {
                if (activeDataSource === dataSource) activeDataSource = null
            }
            runCatching { dataSource.close() }
            partial.delete()
        }
    }

    fun cancelActive() {
        val dataSource = synchronized(stateLock) { activeDataSource }
        runCatching { dataSource?.close() }
    }

    fun clearSource() {
        synchronized(stateLock) {
            sourceGeneration += 1L
            cachedFiles.clear()
        }
        cancelActive()
        cacheDirectory.listFiles().orEmpty().forEach(File::delete)
        cacheDirectory.delete()
    }

    private fun download(url: String, dataSource: DataSource, target: File): Long {
        val declaredLength = dataSource.open(
            DataSpec.Builder()
                .setUri(Uri.parse(url))
                .setFlags(DataSpec.FLAG_ALLOW_GZIP)
                .build(),
        )
        if (declaredLength > maxFileBytes) {
            throw IOException("Addon subtitle exceeds the per-file cache limit")
        }

        var totalBytes = 0L
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        FileOutputStream(target).use { output ->
            while (true) {
                if (Thread.currentThread().isInterrupted) throw InterruptedException()
                val read = dataSource.read(buffer, 0, buffer.size)
                if (read == C.RESULT_END_OF_INPUT) break
                totalBytes += read
                if (totalBytes > maxFileBytes) {
                    throw IOException("Addon subtitle exceeds the per-file cache limit")
                }
                output.write(buffer, 0, read)
            }
        }
        return totalBytes
    }
}

private fun LibmpvAddonSubtitleRequest.cacheKey(): String {
    val bytes = MessageDigest.getInstance("SHA-256")
        .digest("$trackId\u0000$url".encodeToByteArray())
    return bytes.joinToString(separator = "") { byte -> "%02x".format(byte) }
}

private fun LibmpvAddonSubtitleRequest.subtitleExtension(): String {
    val extension = Uri.parse(url).path
        ?.substringAfterLast('.', missingDelimiterValue = "")
        ?.lowercase()
    return extension?.takeIf {
        it in setOf("srt", "vtt", "ass", "ssa", "ttml", "dfxp", "xml", "sub")
    } ?: "srt"
}
