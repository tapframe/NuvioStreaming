package com.nuvio.app.features.p2p

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.Locale
import java.util.concurrent.TimeUnit

private const val TAG = "P2pStreamingEngine"
private const val IDLE_TORRENT_TTL_MS = 120_000L
private const val FILE_INDEX_METADATA_TIMEOUT_MS = 15_000L
private const val FILE_INDEX_FAST_VALIDATION_TIMEOUT_MS = 10_000L
private const val FILE_INDEX_POLL_INTERVAL_MS = 250L
private const val STREAMING_CACHE_SIZE_BYTES = 128L * 1024L * 1024L
private const val STREAMING_CONNECTION_LIMIT = 160
private const val STREAMING_HALF_OPEN_CONNECTION_LIMIT = 120
private const val STREAMING_TOTAL_HALF_OPEN_CONNECTION_LIMIT = 500
private const val STREAMING_PEERS_HIGH_WATER = 900
private const val STREAMING_PEERS_LOW_WATER = 120
private const val STREAMING_NOMINAL_DIAL_TIMEOUT_MS = 8_000
private const val STREAMING_MIN_DIAL_TIMEOUT_MS = 1_500
private const val STREAMING_HANDSHAKE_TIMEOUT_MS = 3_000
private const val STREAMING_DISCONNECT_TIMEOUT_SECONDS = 120
private const val STREAMING_READ_AHEAD_PERCENT = 95
private const val STREAMING_PRELOAD_CACHE_PERCENT = 50
private const val STREAM_SCREEN_WARMUP_COOLDOWN_MS = 10_000L
private val VIDEO_EXTENSIONS = setOf("mkv", "mp4", "avi", "webm", "ts", "m4v", "mov", "wmv", "flv")

actual object P2pStreamingEngine {
    private val _state = MutableStateFlow<P2pStreamingState>(P2pStreamingState.Idle)
    actual val state: StateFlow<P2pStreamingState> = _state.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lifecycleLock = Any()
    private var statsJob: Job? = null
    private var preloadJob: Job? = null
    private var warmupJob: Job? = null
    private var warmupCooldownJob: Job? = null
    private var currentHash: String? = null
    private var streamGeneration = 0L
    private var appContext: Context? = null
    private val idleDropJobs = mutableMapOf<String, Job>()
    private val binary = TorrServerBinary()
    private val api = TorrServerApi(binary)

    fun initialize(context: Context) {
        appContext = context.applicationContext
        binary.initialize(context.applicationContext)
    }

    actual fun warmup() {
        if (appContext == null) return
        synchronized(lifecycleLock) {
            warmupCooldownJob?.cancel()
            warmupCooldownJob = null
            if (warmupJob?.isActive == true) return
            warmupJob = scope.launch {
                try {
                    binary.start()
                    if (api.ensureStreamingSettings().changed) {
                        binary.stop()
                        binary.start()
                        api.ensureStreamingSettings()
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "TorrServer warmup failed", e)
                }
            }
        }
    }

    actual fun cooldownWarmup() {
        synchronized(lifecycleLock) {
            if (currentHash != null) {
                return
            }
            warmupCooldownJob?.cancel()
            warmupCooldownJob = scope.launch {
                delay(STREAM_SCREEN_WARMUP_COOLDOWN_MS)
                val warmup = synchronized(lifecycleLock) {
                    if (currentHash != null) {
                        warmupCooldownJob = null
                        return@launch
                    }
                    val job = warmupJob
                    warmupJob = null
                    warmupCooldownJob = null
                    job
                }
                try {
                    warmup?.join()
                } catch (_: CancellationException) {
                }
                val shouldStop = synchronized(lifecycleLock) { currentHash == null }
                if (!shouldStop) {
                    return@launch
                }
                try {
                    binary.stop()
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to stop idle TorrServer", e)
                }
            }
        }
    }

    actual suspend fun startStream(request: P2pStreamRequest): String = withContext(Dispatchers.IO) {
        val requestedHash = request.infoHash.trim().takeIf { it.isNotEmpty() }
            ?: throw P2pStreamingException("Missing torrent info hash")
        val detached = beginStreamGeneration()
        val generation = detached.generation
        detached.hash?.let(::scheduleIdleDrop)
        _state.value = P2pStreamingState.Connecting

        var attachedHash: String? = null
        try {
            cancelWarmupCooldown()
            awaitWarmup()
            binary.start()
            ensureCurrentGeneration(generation)
            val settingsResult = api.ensureStreamingSettings()
            if (settingsResult.changed) {
                binary.stop()
                binary.start()
                api.ensureStreamingSettings()
            }
            ensureCurrentGeneration(generation)

            val magnetLink = buildMagnetUri(
                infoHash = requestedHash,
                magnetUri = request.magnetUri,
                extraTrackers = request.trackers,
            )

            val hash = api.addTorrent(magnetLink)
                ?: throw P2pStreamingException("Failed to add torrent")
            attachedHash = hash
            cancelIdleDrop(hash)
            if (!attachTorrentIfCurrent(generation, hash)) {
                scheduleIdleDrop(hash)
                throw CancellationException("P2P stream start was cancelled")
            }

            val requestedName = request.filename?.trim()?.takeIf { it.isNotEmpty() }
            val useEngineFileSelector = requestedName != null || request.fileIdx != null
            val resolvedIdx = if (useEngineFileSelector) {
                null
            } else {
                resolveFileIndex(
                    hash = hash,
                    requestedIdx = request.fileIdx,
                    filename = request.filename,
                )
            }
            ensureCurrentGeneration(generation)

            val streamSelector = TorrServerStreamSelector(
                legacyIndex = resolvedIdx,
                fileIdx = request.fileIdx,
                filename = requestedName,
            )
            val streamUrl = api.getStreamUrl(
                magnetLink = magnetLink,
                selector = streamSelector,
            )

            startPreload(
                hash = hash,
                generation = generation,
                magnetLink = magnetLink,
                selector = streamSelector,
            )
            startStatsPolling(
                hash = hash,
                generation = generation,
            )

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
            attachedHash?.takeUnless(::isHashCurrent)?.let(::scheduleIdleDrop)
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start P2P stream", e)
            attachedHash?.takeUnless(::isHashCurrent)?.let(::scheduleIdleDrop)
            if (isCurrentGeneration(generation)) {
                _state.value = P2pStreamingState.Error(e.message ?: "Unknown torrent error")
            }
            throw e
        }
    }

    actual fun stopStream() {
        detachActiveStream()?.let(::scheduleIdleDrop)
    }

    actual fun shutdown() {
        val hash = detachActiveStream()
        val idleHashes = cancelScheduledIdleDrops()
        val warmup = synchronized(lifecycleLock) {
            warmupCooldownJob?.cancel()
            warmupCooldownJob = null
            val job = warmupJob
            warmupJob = null
            job
        }
        warmup?.cancel()
        scope.launch {
            try {
                warmup?.join()
            } catch (_: CancellationException) {
            }

            (listOfNotNull(hash) + idleHashes)
                .distinctBy { hashKey(it) }
                .forEach {
                    try {
                        api.dropTorrent(it)
                    } catch (e: Exception) {
                        Log.w(TAG, "Error dropping torrent", e)
                    }
                }

            try {
                binary.stop()
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping TorrServer", e)
            }
        }
    }

    private data class DetachedStream(
        val generation: Long,
        val hash: String?,
        val statsJob: Job?,
        val preloadJob: Job?,
    )

    private fun beginStreamGeneration(): DetachedStream {
        val detached = synchronized(lifecycleLock) {
            streamGeneration += 1
            val detached = DetachedStream(
                generation = streamGeneration,
                hash = currentHash,
                statsJob = statsJob,
                preloadJob = preloadJob,
            )
            currentHash = null
            statsJob = null
            preloadJob = null
            detached
        }
        detached.statsJob?.cancel()
        detached.preloadJob?.cancel()
        return detached
    }

    private fun detachActiveStream(): String? {
        val detached = beginStreamGeneration()
        _state.value = P2pStreamingState.Idle
        return detached.hash
    }

    private suspend fun awaitWarmup() {
        val job = synchronized(lifecycleLock) { warmupJob?.takeIf { it.isActive } }
        job?.join()
    }

    private fun cancelWarmupCooldown() {
        synchronized(lifecycleLock) {
            warmupCooldownJob?.cancel()
            warmupCooldownJob = null
        }
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

    private fun isHashCurrent(hash: String): Boolean =
        synchronized(lifecycleLock) { hashMatches(currentHash, hash) }

    private fun scheduleIdleDrop(hash: String, delayMs: Long = IDLE_TORRENT_TTL_MS) {
        val key = hashKey(hash)
        if (key.isBlank()) return
        val job = scope.launch {
            delay(delayMs)
            val shouldDrop = synchronized(lifecycleLock) {
                if (hashMatches(currentHash, hash)) {
                    idleDropJobs.remove(key)
                    false
                } else {
                    idleDropJobs.remove(key)
                    true
                }
            }
            if (shouldDrop) {
                api.dropTorrent(hash)
            }
        }
        synchronized(lifecycleLock) {
            if (hashMatches(currentHash, hash)) {
                job.cancel()
                return
            }
            idleDropJobs.remove(key)?.cancel()
            idleDropJobs[key] = job
        }
    }

    private fun cancelIdleDrop(hash: String) {
        synchronized(lifecycleLock) {
            idleDropJobs.remove(hashKey(hash))?.let {
                it.cancel()
            }
        }
    }

    private fun cancelScheduledIdleDrops(): List<String> =
        synchronized(lifecycleLock) {
            val hashes = idleDropJobs.keys.toList()
            idleDropJobs.values.forEach { it.cancel() }
            idleDropJobs.clear()
            hashes
        }

    private fun hashMatches(left: String?, right: String?): Boolean {
        if (left.isNullOrBlank() || right.isNullOrBlank()) return false
        return hashKey(left) == hashKey(right)
    }

    private fun hashKey(hash: String): String =
        hash.trim().lowercase(Locale.US)

    private fun buildMagnetUri(
        infoHash: String,
        magnetUri: String?,
        extraTrackers: List<String>,
    ): String {
        val parsedMagnet = parseMagnetUri(magnetUri)
        val trackers = (DEFAULT_TRACKERS + parsedMagnet.trackers + extraTrackers)
            .asSequence()
            .mapNotNull(::normalizeTracker)
            .distinctBy { it.lowercase(Locale.US) }
            .toList()

        return buildString {
            append("magnet:?xt=urn:btih:")
            append(infoHash.trim())
            parsedMagnet.passthroughParams.forEach { param ->
                append('&')
                append(param)
            }
            trackers.forEach { tracker ->
                append("&tr=")
                append(URLEncoder.encode(tracker, "UTF-8"))
            }
        }
    }

    private data class ParsedMagnet(
        val trackers: List<String>,
        val passthroughParams: List<String>,
    )

    private fun parseMagnetUri(magnetUri: String?): ParsedMagnet {
        val raw = magnetUri
            ?.trim()
            ?.takeIf { it.startsWith("magnet:", ignoreCase = true) }
            ?: return ParsedMagnet(trackers = emptyList(), passthroughParams = emptyList())
        val query = raw.substringAfter('?', missingDelimiterValue = "")
        if (query.isBlank()) return ParsedMagnet(trackers = emptyList(), passthroughParams = emptyList())

        val trackers = mutableListOf<String>()
        val passthroughParams = mutableListOf<String>()
        query.split('&')
            .filter { it.isNotBlank() }
            .forEach { param ->
                val key = param.substringBefore('=').lowercase(Locale.US)
                when (key) {
                    "tr" -> trackers += decodeQueryValue(param.substringAfter('=', missingDelimiterValue = ""))
                    "xt" -> Unit
                    else -> passthroughParams += param
                }
            }
        return ParsedMagnet(
            trackers = trackers,
            passthroughParams = passthroughParams.distinct(),
        )
    }

    private fun decodeQueryValue(value: String): String =
        runCatching { URLDecoder.decode(value, "UTF-8") }
            .getOrDefault(value)

    private fun normalizeTracker(value: String): String? =
        value
            .trim()
            .removePrefix("tracker:")
            .trim()
            .takeIf { it.isNotEmpty() }

    private suspend fun resolveFileIndex(hash: String, requestedIdx: Int?, filename: String?): Int {
        val requestedName = filename?.trim()?.takeIf { it.isNotEmpty() }
        if (requestedIdx != null) {
            val torrServerIndex = requestedIdx + 1

            if (requestedName != null) {
                val files = waitForTorrentFiles(
                    hash = hash,
                    timeoutMs = FILE_INDEX_FAST_VALIDATION_TIMEOUT_MS,
                )
                if (files.isNotEmpty()) {
                    resolveByFilename(files, requestedName)?.let { match ->
                        return match.id
                    }

                    val requestedIdMatch = files.firstOrNull { it.id == torrServerIndex }
                    if (requestedIdMatch != null) {
                        return torrServerIndex
                    }

                    val positionalFile = files.getOrNull(requestedIdx)
                    if (positionalFile != null) {
                        return positionalFile.id
                    }
                }
            }
            return torrServerIndex
        }

        val files = waitForTorrentFiles(
            hash = hash,
            timeoutMs = FILE_INDEX_METADATA_TIMEOUT_MS,
        )

        if (files.isEmpty()) {
            return 1
        }

        if (requestedName != null) {
            resolveByFilename(files, requestedName)?.let { match ->
                return match.id
            }
        }

        val videoFile = files
            .filter { file ->
                val ext = file.path.substringAfterLast('.', "").lowercase()
                ext in VIDEO_EXTENSIONS
            }
            .maxByOrNull { it.length }

        val result = videoFile?.id ?: files.maxByOrNull { it.length }?.id ?: 1
        return result
    }

    private suspend fun waitForTorrentFiles(
        hash: String,
        timeoutMs: Long,
    ): List<TorrServerFile> {
        val startedAt = System.currentTimeMillis()
        var attempt = 0
        while (System.currentTimeMillis() - startedAt < timeoutMs) {
            attempt += 1
            val stats = api.getTorrentStats(hash)
            val files = stats?.files.orEmpty()
            if (files.isNotEmpty()) {
                return files
            }
            delay(FILE_INDEX_POLL_INTERVAL_MS)
        }
        return emptyList()
    }

    private fun resolveByFilename(files: List<TorrServerFile>, filename: String): TorrServerFile? {
        val name = filename.trim()
        val exactBasename = files.firstOrNull { file ->
            file.path.substringAfterLast('/').equals(name, ignoreCase = true)
        }
        if (exactBasename != null) {
            return exactBasename
        }

        val exactPath = files.firstOrNull { file ->
            file.path.equals(name, ignoreCase = true)
        }
        if (exactPath != null) {
            return exactPath
        }

        val contains = files.firstOrNull { file ->
            file.path.contains(name, ignoreCase = true)
        }
        if (contains != null) {
            return contains
        }

        return null
    }

    private fun startPreload(
        hash: String,
        generation: Long,
        magnetLink: String,
        selector: TorrServerStreamSelector,
    ) {
        val job = scope.launch {
            try {
                api.preloadTorrent(
                    magnetLink = magnetLink,
                    selector = selector,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Torrent preload failed", e)
            }
        }
        val previousJob = synchronized(lifecycleLock) {
            if (streamGeneration == generation && hashMatches(currentHash, hash)) {
                val previous = preloadJob
                preloadJob = job
                previous
            } else {
                job.cancel()
                null
            }
        }
        previousJob?.cancel()
    }

    private fun startStatsPolling(
        hash: String,
        generation: Long,
    ) {
        val job = scope.launch {
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
        val previousJob = synchronized(lifecycleLock) {
            if (streamGeneration == generation && hashMatches(currentHash, hash)) {
                val previous = statsJob
                statsJob = job
                previous
            } else {
                job.cancel()
                null
            }
        }
        previousJob?.cancel()
    }

    private val DEFAULT_TRACKERS = listOf(
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.demonii.com:1337/announce",
        "udp://open.stealth.si:80/announce",
        "https://torrent.tracker.durukanbal.com:443/announce",
        "udp://wepzone.net:6969/announce",
        "udp://tracker.wepzone.net:6969/announce",
        "udp://tracker.torrent.eu.org:451/announce",
        "udp://tracker.theoks.net:6969/announce",
        "udp://tracker.t-1.org:6969/announce",
        "udp://tracker.darkness.services:6969/announce",
        "udp://tracker-udp.gbitt.info:80/announce",
        "udp://t.overflow.biz:6969/announce",
        "udp://open.dstud.io:6969/announce",
        "udp://explodie.org:6969/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://bittorrent-tracker.e-n-c-r-y-p-t.net:1337/announce",
        "https://tracker.zhuqiy.com:443/announce",
        "https://tracker.pmman.tech:443/announce",
        "https://tracker.moeblog.cn:443/announce",
        "https://tracker.bt4g.com:443/announce",
    )

    private class TorrServerBinary {
        private var context: Context? = null
        private var process: Process? = null
        private val startMutex = Mutex()
        private val healthClient = OkHttpClient.Builder()
            .connectTimeout(2, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build()

        val baseUrl: String get() = "http://127.0.0.1:$PORT"

        fun initialize(context: Context) {
            this.context = context.applicationContext
        }

        suspend fun start() = startMutex.withLock {
            withContext(Dispatchers.IO) {
                if (isRunning()) {
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

                process = processBuilder.start()

                val proc = process!!
                Thread {
                    try {
                        proc.inputStream.bufferedReader().forEachLine { }
                    } catch (_: Exception) {
                    }
                }.apply {
                    isDaemon = true
                    start()
                }

                val deadline = System.currentTimeMillis() + STARTUP_TIMEOUT_MS
                while (System.currentTimeMillis() < deadline) {
                    if (isRunning()) {
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
        }

        private fun killOrphanedProcess() {
            try {
                val request = Request.Builder().url("$baseUrl/shutdown").build()
                healthClient.newCall(request).execute().close()
                Thread.sleep(1_000L)
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
        val index: Int,
        val path: String,
        val length: Long,
    )

    private data class TorrServerStreamSelector(
        val legacyIndex: Int?,
        val fileIdx: Int?,
        val filename: String?,
    )

    private data class TorrServerStats(
        val status: String,
        val downloadSpeed: Long,
        val uploadSpeed: Long,
        val peers: Int,
        val seeds: Int,
        val totalPeers: Int,
        val pendingPeers: Int,
        val halfOpenPeers: Int,
        val preloadedBytes: Long,
        val preloadSize: Long,
        val loadedSize: Long,
        val torrentSize: Long,
        val bytesRead: Long,
        val bytesReadUsefulData: Long,
        val chunksRead: Long,
        val chunksReadUseful: Long,
        val chunksReadWasted: Long,
        val piecesDirtiedGood: Long,
        val piecesDirtiedBad: Long,
        val files: List<TorrServerFile>,
    )

    private data class StreamingSettingsResult(
        val success: Boolean,
        val changed: Boolean,
    )

    private class TorrServerApi(
        private val binary: TorrServerBinary,
    ) {
        private val settingsMutex = Mutex()
        private val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
        private val preloadClient = client.newBuilder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()

        private val baseUrl: String get() = binary.baseUrl

        suspend fun ensureStreamingSettings(): StreamingSettingsResult = settingsMutex.withLock {
            withContext(Dispatchers.IO) {
                try {
                    val settings = getSettings() ?: return@withContext StreamingSettingsResult(
                        success = false,
                        changed = false,
                    )
                    val changes = mutableListOf<String>()

                    putIfDifferent(settings, "CacheSize", STREAMING_CACHE_SIZE_BYTES, changes)
                    putIfDifferent(settings, "ConnectionsLimit", STREAMING_CONNECTION_LIMIT, changes)
                    putIfDifferent(settings, "HalfOpenConnectionsLimit", STREAMING_HALF_OPEN_CONNECTION_LIMIT, changes)
                    putIfDifferent(settings, "TotalHalfOpenConnectionsLimit", STREAMING_TOTAL_HALF_OPEN_CONNECTION_LIMIT, changes)
                    putIfDifferent(settings, "TorrentPeersHighWater", STREAMING_PEERS_HIGH_WATER, changes)
                    putIfDifferent(settings, "TorrentPeersLowWater", STREAMING_PEERS_LOW_WATER, changes)
                    putIfDifferent(settings, "NominalDialTimeoutMs", STREAMING_NOMINAL_DIAL_TIMEOUT_MS, changes)
                    putIfDifferent(settings, "MinDialTimeoutMs", STREAMING_MIN_DIAL_TIMEOUT_MS, changes)
                    putIfDifferent(settings, "HandshakeTimeoutMs", STREAMING_HANDSHAKE_TIMEOUT_MS, changes)
                    putIfDifferent(settings, "TorrentDisconnectTimeout", STREAMING_DISCONNECT_TIMEOUT_SECONDS, changes)
                    putIfDifferent(settings, "ReaderReadAHead", STREAMING_READ_AHEAD_PERCENT, changes)
                    putIfDifferent(settings, "PreloadCache", STREAMING_PRELOAD_CACHE_PERCENT, changes)
                    putIfDifferent(settings, "ResponsiveMode", true, changes)
                    putIfDifferent(settings, "DisableDHT", false, changes)
                    putIfDifferent(settings, "DisablePEX", false, changes)
                    putIfDifferent(settings, "DisableTCP", false, changes)
                    putIfDifferent(settings, "DisableUTP", false, changes)
                    putIfDifferent(settings, "DisableUpload", false, changes)
                    putIfDifferent(settings, "ForceEncrypt", false, changes)
                    putIfDifferent(settings, "DownloadRateLimit", 0, changes)
                    putIfDifferent(settings, "UploadRateLimit", 0, changes)
                    putIfDifferent(settings, "RetrackersMode", 1, changes)
                    putIfDifferent(settings, "EnableLPD", true, changes)
                    putIfDifferent(settings, "LPDIPv6", false, changes)
                    putIfDifferent(settings, "StoreSettingsInJson", true, changes)

                    if (changes.isEmpty()) {
                        return@withContext StreamingSettingsResult(
                            success = true,
                            changed = false,
                        )
                    }

                    val body = JSONObject().apply {
                        put("action", "set")
                        put("sets", settings)
                    }
                    val request = Request.Builder()
                        .url("$baseUrl/settings")
                        .post(body.toString().toRequestBody(JSON_TYPE))
                        .build()

                    client.newCall(request).execute().use { response ->
                        if (!response.isSuccessful) {
                            Log.w(TAG, "streaming-settings: set failed code=${response.code}")
                            return@withContext StreamingSettingsResult(
                                success = false,
                                changed = false,
                            )
                        }
                    }
                    StreamingSettingsResult(
                        success = true,
                        changed = true,
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "streaming-settings: failed", e)
                    StreamingSettingsResult(
                        success = false,
                        changed = false,
                    )
                }
            }
        }

        private fun getSettings(): JSONObject? {
            val body = JSONObject().apply {
                put("action", "get")
            }
            val request = Request.Builder()
                .url("$baseUrl/settings")
                .post(body.toString().toRequestBody(JSON_TYPE))
                .build()

            return client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "streaming-settings: get failed code=${response.code}")
                    null
                } else {
                    JSONObject(response.body?.string()?.takeIf { it.isNotBlank() } ?: "{}")
                }
            }
        }

        private fun putIfDifferent(
            settings: JSONObject,
            key: String,
            desiredValue: Int,
            changes: MutableList<String>,
        ) {
            val hasKey = settings.has(key)
            val currentValue = settings.optInt(key, Int.MIN_VALUE)
            if (!hasKey || currentValue != desiredValue) {
                settings.put(key, desiredValue)
                changes += key
            }
        }

        private fun putIfDifferent(
            settings: JSONObject,
            key: String,
            desiredValue: Long,
            changes: MutableList<String>,
        ) {
            val hasKey = settings.has(key)
            val currentValue = settings.optLong(key, Long.MIN_VALUE)
            if (!hasKey || currentValue != desiredValue) {
                settings.put(key, desiredValue)
                changes += key
            }
        }

        private fun putIfDifferent(
            settings: JSONObject,
            key: String,
            desiredValue: Boolean,
            changes: MutableList<String>,
        ) {
            val hasKey = settings.has(key)
            val currentValue = settings.optBoolean(key, !desiredValue)
            if (!hasKey || currentValue != desiredValue) {
                settings.put(key, desiredValue)
                changes += key
            }
        }

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
                    hash.ifEmpty { null }
                }
            } catch (e: Exception) {
                Log.e(TAG, "addTorrent error", e)
                null
            }
        }

        suspend fun preloadTorrent(
            magnetLink: String,
            selector: TorrServerStreamSelector,
        ): Boolean = withContext(Dispatchers.IO) {
            val url = getStreamUrl(
                magnetLink = magnetLink,
                selector = selector,
                mode = "preload",
            )
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            val call = preloadClient.newCall(request)
            val cancellationHandle = currentCoroutineContext()[Job]?.invokeOnCompletion { cause ->
                if (cause is CancellationException) {
                    call.cancel()
                }
            }
            try {
                call.execute().use { response ->
                    if (!response.isSuccessful) {
                        Log.w(TAG, "preload: request failed code=${response.code}")
                        return@withContext false
                    }
                    true
                }
            } finally {
                cancellationHandle?.dispose()
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
                                index = file.optInt("index", i),
                                path = file.optString("path", ""),
                                length = file.optLong("length", 0),
                            ),
                        )
                    }

                    TorrServerStats(
                        status = json.optString("stat_string", ""),
                        downloadSpeed = json.optLong("download_speed", 0),
                        uploadSpeed = json.optLong("upload_speed", 0),
                        peers = json.optInt("active_peers", 0),
                        seeds = json.optInt("connected_seeders", 0),
                        totalPeers = json.optInt("total_peers", 0),
                        pendingPeers = json.optInt("pending_peers", 0),
                        halfOpenPeers = json.optInt("half_open_peers", 0),
                        preloadedBytes = json.optLong("preloaded_bytes", 0),
                        preloadSize = json.optLong("preload_size", 0),
                        loadedSize = json.optLong("loaded_size", 0),
                        torrentSize = json.optLong("torrent_size", 0),
                        bytesRead = json.optLong("bytes_read", 0),
                        bytesReadUsefulData = json.optLong("bytes_read_useful_data", 0),
                        chunksRead = json.optLong("chunks_read", 0),
                        chunksReadUseful = json.optLong("chunks_read_useful", 0),
                        chunksReadWasted = json.optLong("chunks_read_wasted", 0),
                        piecesDirtiedGood = json.optLong("pieces_dirtied_good", 0),
                        piecesDirtiedBad = json.optLong("pieces_dirtied_bad", 0),
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
            } catch (e: Exception) {
                Log.w(TAG, "dropTorrent error", e)
            }
        }

        fun getStreamUrl(
            magnetLink: String,
            selector: TorrServerStreamSelector,
            mode: String = "play",
        ): String {
            val params = mutableListOf(
                "link=${URLEncoder.encode(magnetLink, "UTF-8")}",
                mode,
            )
            selector.legacyIndex?.let { params += "index=$it" }
            selector.fileIdx?.let { params += "fileIdx=$it" }
            selector.filename
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?.let { params += "filename=${URLEncoder.encode(it, "UTF-8")}" }
            return "$baseUrl/stream?${params.joinToString("&")}"
        }
    }

    private val JSON_TYPE = "application/json".toMediaType()
}
