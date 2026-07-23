package com.nuvio.app.features.telegram

import co.touchlab.kermit.Logger
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytesWriter
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.drinkless.tdlib.TdApi
import java.net.ServerSocket

object TelegramStreamingProxy {
    private val log = Logger.withTag("TelegramProxy")
    private const val CHUNK_SIZE = 2 * 1024 * 1024
    private const val PREFETCH_SIZE = 20 * 1024 * 1024L
    private const val DOWNLOAD_TIMEOUT_MS = 30_000L
    private const val DOWNLOAD_PRIORITY = 32
    private const val POLL_INTERVAL_MS = 100L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var port: Int = 0
    private var server: io.ktor.server.engine.EmbeddedServer<*, *>? = null
    @Volatile private var lastStreamedFileId: Int? = null


    fun start() {
        if (server != null) return
        port = findFreePort()
        server = embeddedServer(CIO, port = port) {
            routing {
                get("/file/{fileId}") {
                    val fileId = call.parameters["fileId"]?.toIntOrNull()
                    log.d { "Streaming request: fileId=$fileId range=${call.request.headers[HttpHeaders.Range]}" }
                    if (fileId == null) {
                        call.respond(HttpStatusCode.BadRequest)
                        return@get
                    }

                    val prev = lastStreamedFileId
                    if (prev != null && prev != fileId) {
                        scope.launch { deleteFile(prev) }
                    }
                    lastStreamedFileId = fileId

                    val rangeHeader = call.request.headers[HttpHeaders.Range]
                    val (rangeStart, rangeEnd) = parseRange(rangeHeader)

                    val fileInfo = getFileInfo(fileId)
                    val totalSize = fileInfo?.second ?: 0L
                    val localPath = fileInfo?.first
                    log.d { "FileInfo: fileId=$fileId totalSize=$totalSize localPath=$localPath" }

                    if (totalSize <= 0L) {
                        call.respond(HttpStatusCode.NotFound)
                        return@get
                    }

                    val start = rangeStart ?: 0L
                    val end = rangeEnd ?: (totalSize - 1L)
                    val length = end - start + 1

                    call.response.header(HttpHeaders.ContentLength, length.toString())
                    call.response.header(HttpHeaders.AcceptRanges, "bytes")
                    call.response.header(
                        HttpHeaders.ContentRange,
                        "bytes $start-$end/$totalSize"
                    )

                    val status = if (rangeHeader != null) HttpStatusCode.PartialContent else HttpStatusCode.OK

                    call.respondBytesWriter(
                        contentType = io.ktor.http.ContentType.Video.Any,
                        status = status
                    ) {
                        var offset = start
                        while (offset <= end) {
                            val chunkSize = minOf(CHUNK_SIZE.toLong(), end - offset + 1).toInt()
                            val bytes = downloadChunk(fileId, localPath, offset, chunkSize)
                            if (bytes == null || bytes.isEmpty()) break
                            writeFully(bytes)
                            offset += bytes.size
                        }
                    }
                }
            }
        }
        server!!.start(wait = false)
        log.d { "Streaming proxy started on port $port" }
    }

    fun stop() {
        lastStreamedFileId?.let { scope.launch { deleteFile(it) } }
        lastStreamedFileId = null
        server?.stop(0, 0)
        server = null
        log.d { "Streaming proxy stopped" }
    }

    private suspend fun deleteFile(fileId: Int) {
        runCatching {
            TelegramClient.sendRequest(TdApi.CancelDownloadFile().also { req ->
                req.fileId = fileId
                req.onlyIfPending = false
            })
        }
        runCatching {
            TelegramClient.sendRequest(TdApi.DeleteFile().also { it.fileId = fileId })
            log.d { "Deleted cached file $fileId" }
        }
    }

    fun getUrl(fileId: Int): String {
        if (server == null) start()
        val url = "http://127.0.0.1:$port/file/$fileId"
        log.d { "Generated stream URL: $url" }
        return url
    }

    private suspend fun downloadChunk(
        fileId: Int,
        localPath: String?,
        offset: Long,
        limit: Int
    ): ByteArray? {
        withTimeoutOrNull(DOWNLOAD_TIMEOUT_MS) {
            TelegramClient.sendRequest(TdApi.DownloadFile().also { req ->
                req.fileId = fileId
                req.priority = DOWNLOAD_PRIORITY
                req.offset = offset
                req.limit = PREFETCH_SIZE
                req.synchronous = false
            })
        }

        val ready = withTimeoutOrNull(DOWNLOAD_TIMEOUT_MS) {
            var attempts = 0
            while (attempts < 300) {
                val file = TelegramClient.sendRequest(TdApi.GetFile(fileId)) as? TdApi.File
                val local = file?.local
                if (local != null && (local.isDownloadingCompleted || local.downloadedPrefixSize >= limit)) {
                    return@withTimeoutOrNull true
                }
                delay(POLL_INTERVAL_MS)
                attempts++
            }
            false
        }
        if (ready != true) return null

        val data = TelegramClient.sendRequest(
            TdApi.ReadFilePart(fileId, offset, limit.toLong())
        ) as? TdApi.Data
        return data?.data?.takeIf { it.isNotEmpty() }
    }

    private suspend fun getFileInfo(fileId: Int): Pair<String?, Long>? {
        val file = TelegramClient.sendRequest(TdApi.GetFile(fileId)) as? TdApi.File ?: return null
        val totalSize = file.size.takeIf { it > 0 } ?: file.expectedSize
        val localPath = file.local?.path?.takeIf { it.isNotBlank() }
        return Pair(localPath, totalSize)
    }

    private fun parseRange(header: String?): Pair<Long?, Long?> {
        if (header == null) return Pair(null, null)
        return try {
            val range = header.removePrefix("bytes=")
            val parts = range.split("-")
            val start = parts.getOrNull(0)?.toLongOrNull()
            val end = parts.getOrNull(1)?.toLongOrNull()
            Pair(start, end)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            Pair(null, null)
        }
    }

    private fun findFreePort(): Int {
        ServerSocket(0).use { return it.localPort }
    }
}
