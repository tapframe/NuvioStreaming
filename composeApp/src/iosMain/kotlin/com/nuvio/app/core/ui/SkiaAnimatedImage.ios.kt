package com.nuvio.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.request.get
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.Codec
import org.jetbrains.skia.Data
import org.jetbrains.skia.Image

private const val MinFrameDurationMillis = 20
private const val MaxCachedSourceBytes = 24L * 1024 * 1024
private const val MaxConcurrentLoads = 6

private const val IdleRetentionMillis = 2_000L

internal const val AnimatedImageProbeLogging = true

private val animatedSourceHttpClient by lazy { HttpClient(Darwin) }
private val loadSemaphore = Semaphore(MaxConcurrentLoads)

private val sourceCacheLock = Mutex()
private val sourceCache = LinkedHashMap<String, ByteArray>()
private var sourceCacheBytes = 0L

private suspend fun cachedSourceBytes(url: String): ByteArray? = sourceCacheLock.withLock {
    val bytes = sourceCache.remove(url) ?: return@withLock null
    sourceCache[url] = bytes
    bytes
}

private suspend fun storeSourceBytes(url: String, bytes: ByteArray) = sourceCacheLock.withLock {
    sourceCache.remove(url)?.let { sourceCacheBytes -= it.size }
    sourceCache[url] = bytes
    sourceCacheBytes += bytes.size

    while (sourceCacheBytes > MaxCachedSourceBytes && sourceCache.isNotEmpty()) {
        val eldest = sourceCache.keys.first()
        sourceCache.remove(eldest)?.let { sourceCacheBytes -= it.size }
    }
}

internal class SkiaAnimatedImage private constructor(
    private val codec: Codec,
    @Suppress("unused") private val source: Data,
) {
    private val frameInfos = codec.framesInfo
    private val bitmap = Bitmap().apply { allocPixels(codec.imageInfo) }
    private var lastDecodedFrame = -1
    private var closed = false

    val frameCount: Int = codec.frameCount

    fun frameDurationMillis(index: Int): Int =
        frameInfos.getOrNull(index)?.duration?.coerceAtLeast(MinFrameDurationMillis)
            ?: MinFrameDurationMillis

    fun decodeFrame(index: Int): ImageBitmap? {
        if (closed) return null
        return runCatching {
            val requiredFrame = frameInfos.getOrNull(index)?.requiredFrame ?: -1
            if (lastDecodedFrame >= 0 && lastDecodedFrame == requiredFrame) {
                codec.readPixels(bitmap, index, lastDecodedFrame)
            } else {
                codec.readPixels(bitmap, index)
            }
            lastDecodedFrame = index
            Image.makeFromBitmap(bitmap).toComposeImageBitmap()
        }.getOrNull()
    }

    fun close() {
        if (closed) return
        closed = true
        runCatching { bitmap.close() }
        runCatching { codec.close() }
    }

    companion object {
        fun fromBytes(bytes: ByteArray): SkiaAnimatedImage? = runCatching {
            val data = Data.makeFromBytes(bytes)
            val codec = Codec.makeFromData(data)
            SkiaAnimatedImage(codec, data)
        }.getOrNull()
    }
}

private suspend fun loadSkiaAnimatedImage(url: String): SkiaAnimatedImage? =
    loadSemaphore.withPermit {
        val bytes = cachedSourceBytes(url) ?: withContext(Dispatchers.Default) {
            runCatching {
                animatedSourceHttpClient.get(url).body<ByteArray>().takeIf { it.isNotEmpty() }
            }.getOrNull()
        }?.also { storeSourceBytes(url, it) } ?: return@withPermit null

        withContext(Dispatchers.Default) { SkiaAnimatedImage.fromBytes(bytes) }
    }

private class SharedAnimation(
    val url: String,
    val image: SkiaAnimatedImage,
) {
    var refCount: Int = 0
    var job: Job? = null
    var idleEviction: Job? = null
    val frame: MutableState<ImageBitmap?> = mutableStateOf(null)
}

private val registryScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
private val registry = mutableMapOf<String, SharedAnimation>()
private val pending = mutableMapOf<String, Deferred<SharedAnimation?>>()

private suspend fun acquireShared(url: String): SharedAnimation? {
    registry[url]?.let { existing ->
        existing.refCount++
        existing.idleEviction?.cancel()
        existing.idleEviction = null
        startIfNeeded(existing)
        return existing
    }

    val inFlight = pending[url] ?: registryScope.async {
        val image = loadSkiaAnimatedImage(url) ?: return@async null
        if (AnimatedImageProbeLogging) {
            println("[SkiaAnimatedImage] $url -> frameCount=${image.frameCount}")
        }
        if (image.frameCount <= 1) {
            // Nothing to animate; let Coil render it statically.
            image.close()
            return@async null
        }
        SharedAnimation(url, image).also { registry[url] = it }
    }.also { pending[url] = it }

    val shared = try {
        inFlight.await()
    } finally {
        if (pending[url] === inFlight) pending.remove(url)
    } ?: return null

    shared.refCount++
    shared.idleEviction?.cancel()
    shared.idleEviction = null
    startIfNeeded(shared)
    return shared
}

private fun startIfNeeded(shared: SharedAnimation) {
    if (shared.job != null) return
    shared.job = registryScope.launch {
        val image = shared.image
        var index = 0
        withContext(Dispatchers.Default) { image.decodeFrame(0) }?.let { shared.frame.value = it }

        while (image.frameCount > 1) {
            delay(image.frameDurationMillis(index).toLong())
            index = (index + 1) % image.frameCount
            withContext(Dispatchers.Default) { image.decodeFrame(index) }
                ?.let { shared.frame.value = it }
        }
    }
}

private fun releaseShared(shared: SharedAnimation) {
    shared.refCount--
    if (shared.refCount > 0) return

    shared.idleEviction?.cancel()
    shared.idleEviction = registryScope.launch {
        delay(IdleRetentionMillis)
        evictIfIdle(shared.url)
    }
}

private fun evictIfIdle(url: String) {
    val shared = registry[url] ?: return
    if (shared.refCount > 0) return
    shared.job?.cancel()
    shared.job = null
    shared.idleEviction = null
    registry.remove(url)
    shared.frame.value = null
    shared.image.close()
}

@Composable
internal fun rememberAnimatedFrame(url: String): ImageBitmap? {
    var shared by remember(url) { mutableStateOf<SharedAnimation?>(null) }

    DisposableEffect(url) {
        var released = false
        var acquired: SharedAnimation? = null

        val subscription = registryScope.launch {
            val result = acquireShared(url) ?: return@launch
            if (released) {
                releaseShared(result)
                return@launch
            }
            acquired = result
            shared = result
        }

        onDispose {
            released = true
            subscription.cancel()
            acquired?.let { releaseShared(it) }
        }
    }

    return shared?.frame?.value
}
