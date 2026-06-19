package com.nuvio.app.features.p2p

import android.content.Context
import android.util.Log
import com.nuvio.app.core.i18n.localizedP2pUnknownTorrentError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

private const val TAG = "P2pStreamingEngine"
private val VIDEO_EXTENSIONS = setOf("mkv", "mp4", "avi", "webm", "ts", "m4v", "mov", "wmv", "flv")

actual object P2pStreamingEngine {
    private val _state = MutableStateFlow<P2pStreamingState>(P2pStreamingState.Idle)
    actual val state: StateFlow<P2pStreamingState> = _state.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lifecycleLock = Any()
    private var statsJob: Job? = null
    private var cleanupJob: Job? = null
    private var currentHash: String? = null
    private var streamGeneration = 0L
    private var appContext: Context? = null
    private val binary = TorrServerBinary()
    private val api = TorrServerApi(binary)

    fun initialize(context: Context) {
        appContext = context.applicationContext
        binary.initialize(context.applicationContext)
    }

    actual suspend fun startStream(request: P2pStreamRequest): String = withContext(Dispatchers.IO) {
        stopStreamNow(stopBinary = false)
        val generation = nextStreamGeneration()
        _state.value = P2pStreamingState.Connecting

        try {
            binary.start()
            ensureCurrentGeneration(generation)

            val magnetLink = buildMagnetUri(request.infoHash, request.trackers)
            Log.d(TAG, "Starting stream: $magnetLink")

            val hash = api.addTorrent(magnetLink)
                ?: throw P2pStreamingException("Failed to add torrent")
            if (!attachTorrentIfCurrent(generation, hash)) {
                api.dropTorrent(hash)
                throw CancellationException("P2P stream start was cancelled")
            }

            val resolvedIdx = resolveFileIndex(
                hash = hash,
                requestedIdx = request.fileIdx,
                filename = request.filename,
            )
            ensureCurrentGeneration(generation)

            val streamUrl = api.getStreamUrl(magnetLink, resolvedIdx)
            Log.d(TAG, "Stream URL: $streamUrl")

            startStatsPolling(hash, generation)

            ensureCurrentGeneration(generation)
            _state.value = P2pStreamingState.Streaming(
                localUrl = streamUrl,
                downloadSpeed = 0,
                uploadSpeed = 0,
                peers = 0,
                seeds = 0,
                bufferProgress = 0f,
                totalProgress = 0f,
            )

            streamUrl
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (isCurrentGeneration(generation)) {
                _state.value = P2pStreamingState.Error(e.message ?: localizedP2pUnknownTorrentError())
            }
            throw e
        }
    }

    actual fun stopStream() {
        scheduleStop(stopBinary = false)
    }

    actual fun shutdown() {
        scheduleStop(stopBinary = true)
    }

    private fun scheduleStop(stopBinary: Boolean) {
        val hash = detachActiveStream()
        val previousCleanup = cleanupJob
        cleanupJob = scope.launch {
            previousCleanup?.join()
            cleanupDetachedStream(hash, stopBinary)
        }
    }

    private suspend fun stopStreamNow(stopBinary: Boolean) {
        cleanupJob?.join()
        val hash = detachActiveStream()
        cleanupDetachedStream(hash, stopBinary)
    }

    private fun detachActiveStream(): String? {
        val detached = synchronized(lifecycleLock) {
            streamGeneration += 1
            val hash = currentHash
            val job = statsJob
            currentHash = null
            statsJob = null
            hash to job
        }
        detached.second?.cancel()
        _state.value = P2pStreamingState.Idle
        return detached.first
    }

    private suspend fun cleanupDetachedStream(hash: String?, stopBinary: Boolean) {
        hash?.let {
            try {
                api.dropTorrent(it)
            } catch (e: Exception) {
                Log.w(TAG, "Error dropping torrent", e)
            }
        }

        if (stopBinary) {
            try {
                binary.stop()
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping TorrServer", e)
            }
        }
    }

    private fun nextStreamGeneration(): Long =
        synchronized(lifecycleLock) {
            streamGeneration += 1
            streamGeneration
        }

    private fun attachTorrentIfCurrent(generation: Long, hash: String): Boolean =
        synchronized(lifecycleLock) {
            if (streamGeneration != generation) return@synchronized false
            currentHash = hash
            true
        }

    private fun isCurrentGeneration(generation: Long): Boolean =
        synchronized(lifecycleLock) { streamGeneration == generation }

    private fun ensureCurrentGeneration(generation: Long) {
        if (!isCurrentGeneration(generation)) {
            throw CancellationException("P2P stream start was cancelled")
        }
    }

    private fun buildMagnetUri(infoHash: String, extraTrackers: List<String>): String {
        val trackers = (DEFAULT_TRACKERS + extraTrackers).distinct()
        val trackerParams = trackers.joinToString("") { "&tr=$it" }
        return "magnet:?xt=urn:btih:$infoHash$trackerParams"
    }

    private suspend fun resolveFileIndex(hash: String, requestedIdx: Int?, filename: String?): Int {
        val deadline = System.currentTimeMillis() + 15_000L
        var files: List<TorrServerFile> = emptyList()

        while (System.currentTimeMillis() < deadline) {
            files = api.getTorrentStats(hash)?.files ?: emptyList()
            if (files.isNotEmpty()) break
            Log.d(TAG, "Waiting for torrent metadata...")
            delay(1_000L)
        }

        if (files.isEmpty()) {
            Log.w(TAG, "No files after metadata timeout, guessing index ${requestedIdx?.plus(1) ?: 1}")
            return requestedIdx?.plus(1) ?: 1
        }

        if (!filename.isNullOrBlank()) {
            val name = filename.trim()
            val exact = files.firstOrNull { file ->
                file.path.substringAfterLast('/').equals(name, ignoreCase = true)
            }
            if (exact != null) {
                Log.d(TAG, "File resolved by exact filename match: ${exact.path} -> id=${exact.id}")
                return exact.id
            }

            val contains = files.firstOrNull { file ->
                file.path.contains(name, ignoreCase = true)
            }
            if (contains != null) {
                Log.d(TAG, "File resolved by filename contains match: ${contains.path} -> id=${contains.id}")
                return contains.id
            }
        }

        if (requestedIdx != null) {
            val torrServerIndex = requestedIdx + 1
            if (files.any { it.id == torrServerIndex }) {
                Log.d(TAG, "File resolved by ID offset: id=$torrServerIndex")
                return torrServerIndex
            }
        }

        if (requestedIdx != null && requestedIdx in files.indices) {
            val positionalFile = files[requestedIdx]
            Log.d(TAG, "File resolved by positional index: [$requestedIdx] -> ${positionalFile.path} (id=${positionalFile.id})")
            return positionalFile.id
        }

        val videoFile = files
            .filter { file ->
                val ext = file.path.substringAfterLast('.', "").lowercase()
                ext in VIDEO_EXTENSIONS
            }
            .maxByOrNull { it.length }

        val result = videoFile?.id ?: files.maxByOrNull { it.length }?.id ?: 1
        Log.d(TAG, "File resolved by largest video fallback: id=$result")
        return result
    }

    private fun startStatsPolling(hash: String, generation: Long) {
        statsJob?.cancel()
        statsJob = scope.launch {
            while (isActive) {
                if (!isCurrentGeneration(generation)) return@launch
                try {
                    val stats = api.getTorrentStats(hash)
                    val currentState = _state.value
                    if (
                        stats != null &&
                        currentState is P2pStreamingState.Streaming &&
                        isCurrentGeneration(generation)
                    ) {
                        _state.value = currentState.copy(
                            downloadSpeed = stats.downloadSpeed,
                            uploadSpeed = stats.uploadSpeed,
                            peers = stats.peers,
                            seeds = stats.seeds,
                            preloadedBytes = stats.preloadedBytes,
                        )
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "Stats polling error", e)
                }
                delay(1_000L)
            }
        }
    }

    private fun requireContext(): Context =
        appContext ?: throw P2pStreamingException("P2P streaming engine is not initialized")

    private val DEFAULT_TRACKERS = listOf(
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.stealth.si:80/announce",
        "udp://tracker.openbittorrent.com:6969/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://tracker.torrent.eu.org:451/announce",
    )

    private class TorrServerBinary {
        private var context: Context? = null
        private var process: Process? = null
        private val healthClient = OkHttpClient.Builder()
            .connectTimeout(2, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build()

        val baseUrl: String get() = "http://127.0.0.1:$PORT"

        fun initialize(context: Context) {
            this.context = context.applicationContext
        }

        suspend fun start() = withContext(Dispatchers.IO) {
            if (isRunning()) {
                Log.d(TAG, "TorrServer already running")
                return@withContext
            }

            killOrphanedProcess()

            val ctx = requireContext()
            val binaryFile = File(ctx.applicationInfo.nativeLibraryDir, "libtorrserver.so")
            if (!binaryFile.exists()) {
                throw P2pStreamingException("TorrServer binary not found at ${binaryFile.absolutePath}")
            }

            if (!binaryFile.canExecute()) {
                binaryFile.setExecutable(true)
            }

            val configDir = File(ctx.filesDir, "torrserver").also { it.mkdirs() }
            val processBuilder = ProcessBuilder(
                binaryFile.absolutePath,
                "--port",
                PORT.toString(),
                "--path",
                configDir.absolutePath,
            )
            processBuilder.directory(configDir)
            processBuilder.redirectErrorStream(true)

            Log.d(TAG, "Starting TorrServer on port $PORT from ${binaryFile.absolutePath}")
            process = processBuilder.start()

            val proc = process!!
            Thread {
                try {
                    proc.inputStream.bufferedReader().forEachLine { line ->
                        Log.d(TAG, "[server] $line")
                    }
                } catch (_: Exception) {
                }
            }.apply {
                isDaemon = true
                start()
            }

            val deadline = System.currentTimeMillis() + STARTUP_TIMEOUT_MS
            while (System.currentTimeMillis() < deadline) {
                if (isRunning()) {
                    Log.d(TAG, "TorrServer started successfully")
                    return@withContext
                }
                if (!isProcessAlive(process)) {
                    val exitCode = process?.exitValue() ?: -1
                    process = null
                    throw P2pStreamingException("TorrServer process died on startup (exit code $exitCode)")
                }
                delay(HEALTH_CHECK_INTERVAL_MS)
            }

            stop()
            throw P2pStreamingException("TorrServer failed to start within ${STARTUP_TIMEOUT_MS / 1000}s")
        }

        fun isRunning(): Boolean {
            return try {
                val request = Request.Builder().url("$baseUrl/echo").build()
                healthClient.newCall(request).execute().use { it.isSuccessful }
            } catch (e: Exception) {
                false
            }
        }

        fun stop() {
            try {
                val request = Request.Builder().url("$baseUrl/shutdown").build()
                healthClient.newCall(request).execute().close()
            } catch (_: Exception) {
            }

            process?.let { proc ->
                try {
                    Thread.sleep(3_000L)
                    if (isProcessAlive(proc)) {
                        proc.destroyForcibly()
                    }
                } catch (_: Exception) {
                    proc.destroyForcibly()
                }
            }
            process = null
            Log.d(TAG, "TorrServer stopped")
        }

        private fun killOrphanedProcess() {
            try {
                val request = Request.Builder().url("$baseUrl/shutdown").build()
                healthClient.newCall(request).execute().close()
                Thread.sleep(1_000L)
                Log.d(TAG, "Shut down orphaned TorrServer instance")
            } catch (_: Exception) {
            }
        }

        private fun isProcessAlive(proc: Process?): Boolean {
            if (proc == null) return false
            return try {
                proc.exitValue()
                false
            } catch (_: IllegalThreadStateException) {
                true
            } catch (_: Exception) {
                false
            }
        }

        private fun requireContext(): Context =
            context ?: throw P2pStreamingException("P2P streaming engine is not initialized")

        companion object {
            const val PORT = 8091
            private const val STARTUP_TIMEOUT_MS = 15_000L
            private const val HEALTH_CHECK_INTERVAL_MS = 200L
        }
    }

    private data class TorrServerFile(
        val id: Int,
        val path: String,
        val length: Long,
    )

    private data class TorrServerStats(
        val downloadSpeed: Long,
        val uploadSpeed: Long,
        val peers: Int,
        val seeds: Int,
        val preloadedBytes: Long,
        val loadedSize: Long,
        val torrentSize: Long,
        val files: List<TorrServerFile>,
    )

    private class TorrServerApi(
        private val binary: TorrServerBinary,
    ) {
        private val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        private val baseUrl: String get() = binary.baseUrl

        suspend fun addTorrent(magnetLink: String, title: String? = null): String? = withContext(Dispatchers.IO) {
            val body = JSONObject().apply {
                put("action", "add")
                put("link", magnetLink)
                put("save_to_db", false)
                if (title != null) put("title", title)
            }

            val request = Request.Builder()
                .url("$baseUrl/torrents")
                .post(body.toString().toRequestBody(JSON_TYPE))
                .build()

            try {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        Log.e(TAG, "addTorrent failed: ${response.code}")
                        return@withContext null
                    }
                    val json = JSONObject(response.body?.string() ?: "{}")
                    val hash = json.optString("hash", "")
                    Log.d(TAG, "Torrent added: $hash")
                    hash.ifEmpty { null }
                }
            } catch (e: Exception) {
                Log.e(TAG, "addTorrent error", e)
                null
            }
        }

        suspend fun getTorrentStats(hash: String): TorrServerStats? = withContext(Dispatchers.IO) {
            val body = JSONObject().apply {
                put("action", "get")
                put("hash", hash)
            }

            val request = Request.Builder()
                .url("$baseUrl/torrents")
                .post(body.toString().toRequestBody(JSON_TYPE))
                .build()

            try {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext null
                    val json = JSONObject(response.body?.string() ?: "{}")

                    val files = mutableListOf<TorrServerFile>()
                    val fileList = json.optJSONArray("file_stats") ?: JSONArray()
                    for (i in 0 until fileList.length()) {
                        val file = fileList.getJSONObject(i)
                        files.add(
                            TorrServerFile(
                                id = file.optInt("id", i + 1),
                                path = file.optString("path", ""),
                                length = file.optLong("length", 0),
                            ),
                        )
                    }

                    TorrServerStats(
                        downloadSpeed = json.optLong("download_speed", 0),
                        uploadSpeed = json.optLong("upload_speed", 0),
                        peers = json.optInt("active_peers", 0),
                        seeds = json.optInt("connected_seeders", 0),
                        preloadedBytes = json.optLong("preloaded_bytes", 0),
                        loadedSize = json.optLong("loaded_size", 0),
                        torrentSize = json.optLong("torrent_size", 0),
                        files = files,
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "getTorrentStats error", e)
                null
            }
        }

        suspend fun dropTorrent(hash: String) = withContext(Dispatchers.IO) {
            val body = JSONObject().apply {
                put("action", "drop")
                put("hash", hash)
            }

            val request = Request.Builder()
                .url("$baseUrl/torrents")
                .post(body.toString().toRequestBody(JSON_TYPE))
                .build()

            try {
                client.newCall(request).execute().close()
                Log.d(TAG, "Torrent dropped: $hash")
            } catch (e: Exception) {
                Log.w(TAG, "dropTorrent error", e)
            }
        }

        fun getStreamUrl(magnetLink: String, fileIdx: Int): String {
            val encodedLink = URLEncoder.encode(magnetLink, "UTF-8")
            return "$baseUrl/stream?link=$encodedLink&index=$fileIdx&play"
        }
    }

    private val JSON_TYPE = "application/json".toMediaType()
}
