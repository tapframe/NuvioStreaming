package com.nuvio.app.features.player

import android.net.Uri
import android.os.SystemClock
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import com.nuvio.app.core.logging.InAppLogger

internal class ResponseHeaderOverridingDataSourceFactory(
    private val upstreamFactory: DataSource.Factory,
    private val defaultResponseHeaders: Map<String, String>,
) : DataSource.Factory {
    override fun createDataSource(): DataSource =
        ResponseHeaderOverridingDataSource(
            upstream = upstreamFactory.createDataSource(),
            defaultResponseHeaders = defaultResponseHeaders,
        )
}

internal class PlaybackLoggingDataSourceFactory(
    private val upstreamFactory: DataSource.Factory,
    private val sourceLabel: String,
) : DataSource.Factory {
    override fun createDataSource(): DataSource =
        PlaybackLoggingDataSource(
            upstream = upstreamFactory.createDataSource(),
            sourceLabel = sourceLabel,
        )
}

private class PlaybackLoggingDataSource(
    private val upstream: DataSource,
    private val sourceLabel: String,
) : DataSource {
    private var openedUri: String? = null
    private var openedAtMs: Long = 0L
    private var bytesRead: Long = 0L
    private var expectedLength: Long = -1L

    override fun addTransferListener(transferListener: TransferListener) {
        upstream.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        val uri = dataSpec.uri.toString()
        openedUri = uri
        openedAtMs = SystemClock.elapsedRealtime()
        bytesRead = 0L
        expectedLength = -1L

        InAppLogger.debug(
            "Player/Network",
            "open source=$sourceLabel uri=${InAppLogger.redactUrl(uri)} method=${dataSpec.httpMethod} " +
                "position=${dataSpec.position} length=${dataSpec.length}",
        )

        return try {
            val length = upstream.open(dataSpec)
            expectedLength = length
            InAppLogger.info(
                "Player/Network",
                "open ok source=$sourceLabel uri=${InAppLogger.redactUrl(uri)} expectedBytes=${describeBytes(length)} " +
                    "responseHeaders=${responseHeaderKeys(upstream.responseHeaders)}",
            )
            length
        } catch (error: Throwable) {
            InAppLogger.warn(
                "Player/Network",
                "open failed source=$sourceLabel uri=${InAppLogger.redactUrl(uri)}: ${InAppLogger.throwableSummary(error)}",
            )
            throw error
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        return try {
            val read = upstream.read(buffer, offset, length)
            if (read > 0) {
                bytesRead += read.toLong()
            }
            read
        } catch (error: Throwable) {
            InAppLogger.warn(
                "Player/Network",
                "read failed source=$sourceLabel uri=${InAppLogger.redactUrl(openedUri)} " +
                    "bytesRead=$bytesRead: ${InAppLogger.throwableSummary(error)}",
            )
            throw error
        }
    }

    override fun getUri(): Uri? = upstream.uri

    override fun getResponseHeaders(): Map<String, List<String>> = upstream.responseHeaders

    override fun close() {
        val uri = openedUri
        val startedAt = openedAtMs
        val elapsedMs = if (startedAt > 0L) SystemClock.elapsedRealtime() - startedAt else 0L
        try {
            upstream.close()
        } finally {
            if (uri != null) {
                InAppLogger.debug(
                    "Player/Network",
                    "close source=$sourceLabel uri=${InAppLogger.redactUrl(uri)} bytesRead=$bytesRead " +
                        "expectedBytes=${describeBytes(expectedLength)} durationMs=$elapsedMs",
                )
            }
            openedUri = null
            openedAtMs = 0L
            bytesRead = 0L
            expectedLength = -1L
        }
    }
}

private class ResponseHeaderOverridingDataSource(
    private val upstream: DataSource,
    private val defaultResponseHeaders: Map<String, String>,
) : DataSource {

    override fun addTransferListener(transferListener: TransferListener) {
        upstream.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long = upstream.open(dataSpec)

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
        upstream.read(buffer, offset, length)

    override fun getUri(): Uri? = upstream.uri

    override fun getResponseHeaders(): Map<String, List<String>> {
        val upstreamHeaders = upstream.responseHeaders
        if (defaultResponseHeaders.isEmpty()) return upstreamHeaders

        val merged = LinkedHashMap<String, List<String>>(upstreamHeaders.size + defaultResponseHeaders.size)
        merged.putAll(upstreamHeaders)
        defaultResponseHeaders.forEach { (key, value) ->
            merged[key] = listOf(value)
        }
        return merged
    }

    override fun close() {
        upstream.close()
    }
}

private fun responseHeaderKeys(headers: Map<String, List<String>>): String =
    headers.keys
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .sortedBy { it.lowercase() }
        .joinToString(separator = ",")
        .ifBlank { "none" }

private fun describeBytes(value: Long): String =
    if (value >= 0L) value.toString() else "unknown"
