package com.nuvio.app.features.player

import android.net.Uri
import android.os.SystemClock
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import co.touchlab.kermit.Logger

/**
 * media3 [DataSource] wrapper that records the latency of the first successful
 * `open()` into [PlayerTtfbProbe] as a proxy for time-to-first-byte of the media
 * fetch. Later opens are Range probes or parallel segments and are ignored by the
 * probe (which only records the first).
 *
 * NOTE: static, uncompiled port of the legacy `LoggingDataSource`. Desktop
 * (compose-media-player) and iOS hooks are follow-ups.
 */
internal class LoggingDataSource(
    private val upstream: DataSource,
    private val site: String,
) : DataSource {
    private val log = Logger.withTag("LoggingDataSource")

    override fun addTransferListener(transferListener: TransferListener) {
        upstream.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        val t0 = SystemClock.elapsedRealtime()
        val uriName = dataSpec.uri.path?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "stream"
        return try {
            val len = upstream.open(dataSpec)
            val elapsed = (SystemClock.elapsedRealtime() - t0).coerceAtLeast(0L)
            PlayerTtfbProbe.recordFirstOpen(elapsed)
            log.d { "[$site] file=$uriName pos=${dataSpec.position} reqLen=${dataSpec.length} -> len=$len ms=$elapsed" }
            len
        } catch (e: Exception) {
            val elapsed = (SystemClock.elapsedRealtime() - t0).coerceAtLeast(0L)
            log.w(e) { "[$site] file=$uriName pos=${dataSpec.position} FAILED ms=$elapsed" }
            throw e
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
        upstream.read(buffer, offset, length)

    override fun getUri(): Uri? = upstream.uri

    override fun getResponseHeaders(): Map<String, List<String>> = upstream.responseHeaders

    override fun close() {
        upstream.close()
    }
}

internal class LoggingDataSourceFactory(
    private val upstreamFactory: DataSource.Factory,
    private val site: String,
) : DataSource.Factory {
    override fun createDataSource(): DataSource =
        LoggingDataSource(upstreamFactory.createDataSource(), site)
}
