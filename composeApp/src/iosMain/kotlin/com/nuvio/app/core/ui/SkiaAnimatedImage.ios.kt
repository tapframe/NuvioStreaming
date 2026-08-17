package com.nuvio.app.core.ui

import androidx.compose.animation.core.withInfiniteAnimationFrameNanos
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
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

internal suspend fun loadSkiaAnimatedImage(url: String): SkiaAnimatedImage? =
    loadSemaphore.withPermit {
        val bytes = cachedSourceBytes(url) ?: withContext(Dispatchers.Default) {
            runCatching {
                animatedSourceHttpClient.get(url).body<ByteArray>().takeIf { it.isNotEmpty() }
            }.getOrNull()
        }?.also { storeSourceBytes(url, it) } ?: return@withPermit null

        withContext(Dispatchers.Default) { SkiaAnimatedImage.fromBytes(bytes) }
    }

@Composable
internal fun rememberAnimatedFrame(image: SkiaAnimatedImage?): ImageBitmap? {
    if (image == null) return null

    var frame by remember(image) { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(image) {
        image.decodeFrame(0)?.let { frame = it }
        if (image.frameCount <= 1) return@LaunchedEffect

        var frameIndex = 0
        var accumulatedMillis = 0L
        var previousNanos = 0L

        while (true) {
            withInfiniteAnimationFrameNanos { nanos ->
                if (previousNanos != 0L) {
                    accumulatedMillis += (nanos - previousNanos) / 1_000_000
                }
                previousNanos = nanos
            }

            var advanced = false
            var guard = 0
            while (accumulatedMillis >= image.frameDurationMillis(frameIndex) && guard < image.frameCount) {
                accumulatedMillis -= image.frameDurationMillis(frameIndex)
                frameIndex = (frameIndex + 1) % image.frameCount
                advanced = true
                guard++
            }

            if (advanced) {
                image.decodeFrame(frameIndex)?.let { frame = it }
            }
        }
    }

    return frame
}

internal sealed interface SkiaAnimatedImageState {
    data object Loading : SkiaAnimatedImageState
    data class Ready(val image: SkiaAnimatedImage) : SkiaAnimatedImageState
    data object Failed : SkiaAnimatedImageState
}

@Composable
internal fun rememberSkiaAnimatedImage(url: String): SkiaAnimatedImageState {
    var state by remember(url) {
        mutableStateOf<SkiaAnimatedImageState>(SkiaAnimatedImageState.Loading)
    }

    LaunchedEffect(url) {
        val loaded = loadSkiaAnimatedImage(url)
        if (loaded == null) {
            state = SkiaAnimatedImageState.Failed
            return@LaunchedEffect
        }
        if (!isActive) {
            loaded.close()
            return@LaunchedEffect
        }
        if (AnimatedImageProbeLogging) {
            println("[SkiaAnimatedImage] $url -> frameCount=${loaded.frameCount}")
        }
        state = if (loaded.frameCount > 1) {
            SkiaAnimatedImageState.Ready(loaded)
        } else {
            loaded.close()
            SkiaAnimatedImageState.Failed
        }
    }

    val current = state
    DisposableEffect(current) {
        onDispose { (current as? SkiaAnimatedImageState.Ready)?.image?.close() }
    }

    return state
}
