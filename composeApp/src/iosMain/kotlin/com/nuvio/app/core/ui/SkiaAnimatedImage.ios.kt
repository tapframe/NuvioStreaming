@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

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
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import platform.Foundation.NSCachesDirectory
import platform.Foundation.NSData
import platform.Foundation.NSDate
import platform.Foundation.NSFileManager
import platform.Foundation.NSFileModificationDate
import platform.Foundation.NSFileSize
import platform.Foundation.NSNotificationCenter
import platform.Foundation.NSNumber
import platform.Foundation.NSOperationQueue
import platform.Foundation.NSSearchPathForDirectoriesInDomains
import platform.Foundation.NSUserDomainMask
import platform.Foundation.create
import platform.Foundation.timeIntervalSince1970
import platform.UIKit.UIApplicationDidEnterBackgroundNotification
import platform.UIKit.UIApplicationDidReceiveMemoryWarningNotification
import platform.UIKit.UIApplicationWillEnterForegroundNotification
import platform.posix.memcpy
import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.Canvas
import org.jetbrains.skia.Codec
import org.jetbrains.skia.Data
import org.jetbrains.skia.Image
import org.jetbrains.skia.ImageInfo
import org.jetbrains.skia.Rect
import org.jetbrains.skia.SamplingMode

private const val MinFrameDurationMillis = 20
private const val MaxCachedSourceBytes = 24L * 1024 * 1024
private const val MaxConcurrentLoads = 6
private const val IdleRetentionMillis = 2_000L

private const val MaxAnimationBudgetBytes = 120L * 1024 * 1024

private const val MaxPerAnimationBytes = 20L * 1024 * 1024

private const val SizeBucketPx = 64

internal const val MaxAnimationTargetEdgePx = 1024
internal const val DefaultAnimationTargetEdgePx = 256

private const val MinAnimationEdgePx = 96

private const val MaxDiskCacheBytes = 96L * 1024 * 1024
private const val DiskCacheDirectoryName = "nuvio-animated-sources"

internal const val AnimatedImageProbeLogging = false

private val animatedSourceHttpClient by lazy { HttpClient(Darwin) }
private val loadSemaphore = Semaphore(MaxConcurrentLoads)

// ---------------------------------------------------------------------------
// Compressed source cache (bytes only)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Disk tier
// ---------------------------------------------------------------------------

private fun diskCacheFileName(url: String): String {
    var hashA = -0x340d631b7bdddcdbL   // 14695981039346656037
    var hashB = 0x27D4EB2F165667C5L
    for (char in url) {
        val value = char.code.toLong()
        hashA = (hashA xor value) * 0x100000001B3L
        hashB = (hashB xor (value + 0x9E3779B9L)) * -0x3D4D51C2D82B14B1L
    }
    fun hex(value: Long): String {
        val digits = "0123456789abcdef"
        val builder = StringBuilder(16)
        for (shift in 60 downTo 0 step 4) {
            builder.append(digits[((value ushr shift) and 0xF).toInt()])
        }
        return builder.toString()
    }
    return hex(hashA) + hex(hashB)
}

private val diskCacheDirectory: String? by lazy {
    runCatching {
        val caches = NSSearchPathForDirectoriesInDomains(
            NSCachesDirectory,
            NSUserDomainMask,
            true,
        ).firstOrNull() as? String ?: return@runCatching null

        val directory = "$caches/$DiskCacheDirectoryName"
        NSFileManager.defaultManager.createDirectoryAtPath(
            path = directory,
            withIntermediateDirectories = true,
            attributes = null,
            error = null,
        )
        directory
    }.getOrNull()
}

private fun NSData.toByteArray(): ByteArray {
    val size = length.toInt()
    if (size <= 0) return ByteArray(0)
    val result = ByteArray(size)
    result.usePinned { pinned -> memcpy(pinned.addressOf(0), bytes, length) }
    return result
}

private fun ByteArray.toNSData(): NSData? {
    if (isEmpty()) return null
    return usePinned { pinned ->
        NSData.create(bytes = pinned.addressOf(0), length = size.toULong())
    }
}

private fun diskCacheRead(url: String): ByteArray? = runCatching {
    val directory = diskCacheDirectory ?: return@runCatching null
    val path = "$directory/${diskCacheFileName(url)}"
    val data = NSFileManager.defaultManager.contentsAtPath(path) ?: return@runCatching null
    NSFileManager.defaultManager.setAttributes(
        attributes = mapOf<Any?, Any>(NSFileModificationDate to NSDate()),
        ofItemAtPath = path,
        error = null,
    )
    data.toByteArray().takeIf { it.isNotEmpty() }
}.getOrNull()

private fun diskCacheWrite(url: String, bytes: ByteArray) {
    runCatching {
        val directory = diskCacheDirectory ?: return
        val data = bytes.toNSData() ?: return
        NSFileManager.defaultManager.createFileAtPath(
            path = "$directory/${diskCacheFileName(url)}",
            contents = data,
            attributes = null,
        )
        trimDiskCache(directory)
    }
}

private fun trimDiskCache(directory: String) {
    runCatching {
        val manager = NSFileManager.defaultManager
        val names = manager.contentsOfDirectoryAtPath(directory, null) ?: return

        data class Entry(val path: String, val size: Long, val modified: Double)

        val entries = names.mapNotNull { name ->
            val path = "$directory/$name"
            val attributes = manager.attributesOfItemAtPath(path, null) ?: return@mapNotNull null
            val size = (attributes[NSFileSize] as? NSNumber)?.longLongValue ?: return@mapNotNull null
            val modified = (attributes[NSFileModificationDate] as? NSDate)
                ?.timeIntervalSince1970 ?: 0.0
            Entry(path, size, modified)
        }

        var total = entries.sumOf { it.size }
        if (total <= MaxDiskCacheBytes) return

        for (entry in entries.sortedBy { it.modified }) {
            if (total <= MaxDiskCacheBytes) break
            manager.removeItemAtPath(entry.path, null)
            total -= entry.size
        }
    }
}

private suspend fun fetchSourceBytes(url: String): ByteArray? = loadSemaphore.withPermit {
    cachedSourceBytes(url)?.let { return@withPermit it }

    withContext(Dispatchers.Default) { diskCacheRead(url) }?.let { fromDisk ->
        storeSourceBytes(url, fromDisk)
        return@withPermit fromDisk
    }

    val downloaded = withContext(Dispatchers.Default) {
        runCatching {
            animatedSourceHttpClient.get(url).body<ByteArray>().takeIf { it.isNotEmpty() }
        }.getOrNull()
    } ?: return@withPermit null

    storeSourceBytes(url, downloaded)
    withContext(Dispatchers.Default) { diskCacheWrite(url, downloaded) }
    downloaded
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

private class AnimationFrames(
    val frames: List<ImageBitmap>,
    val durationsMs: IntArray,
    val bytes: Long,
)

private fun decodeAnimation(
    source: ByteArray,
    targetWidth: Int,
    targetHeight: Int,
    budgetBytes: Long,
): AnimationFrames? {
    val data = runCatching { Data.makeFromBytes(source) }.getOrNull() ?: return null
    val codec = runCatching { Codec.makeFromData(data) }.getOrNull()
    if (codec == null) {
        runCatching { data.close() }
        return null
    }

    var sourceBitmap: Bitmap? = null
    try {
        val frameCount = codec.frameCount
        if (frameCount <= 1) return null

        val info = codec.imageInfo
        val sourceWidth = info.width
        val sourceHeight = info.height
        if (sourceWidth <= 0 || sourceHeight <= 0) return null

        val drawScale = min(
            min(targetWidth.toFloat() / sourceWidth, targetHeight.toFloat() / sourceHeight),
            1f,
        )
        val budgetScale = sqrt(
            MaxPerAnimationBytes.toDouble() /
                (sourceWidth.toDouble() * sourceHeight.toDouble() * 4.0 * frameCount.toDouble())
        ).toFloat()
        val scale = min(drawScale, budgetScale)

        val outWidth = max(1, (sourceWidth * scale).toInt())
        val outHeight = max(1, (sourceHeight * scale).toInt())

        if (budgetScale < drawScale && max(outWidth, outHeight) < MinAnimationEdgePx) {
            if (AnimatedImageProbeLogging) {
                println(
                    "[SkiaAnimatedImage] skipped: $frameCount frames only fit at " +
                        "${outWidth}x$outHeight, below the ${MinAnimationEdgePx}px floor"
                )
            }
            return null
        }

        val totalBytes = outWidth.toLong() * outHeight.toLong() * 4L * frameCount.toLong()
        if (totalBytes > budgetBytes) {
            if (AnimatedImageProbeLogging) {
                println(
                    "[SkiaAnimatedImage] skipped: ${totalBytes / 1024}KB needed, " +
                        "${budgetBytes / 1024}KB left in budget"
                )
            }
            return null
        }

        val infos = codec.framesInfo
        val decodeTarget = Bitmap().apply { allocPixels(info) }
        sourceBitmap = decodeTarget

        val frames = ArrayList<ImageBitmap>(frameCount)
        val durations = IntArray(frameCount)
        var lastDecodedFrame = -1

        for (index in 0 until frameCount) {
            val requiredFrame = infos.getOrNull(index)?.requiredFrame ?: -1
            if (lastDecodedFrame >= 0 && lastDecodedFrame == requiredFrame) {
                codec.readPixels(decodeTarget, index, lastDecodedFrame)
            } else {
                codec.readPixels(decodeTarget, index)
            }
            lastDecodedFrame = index
            durations[index] = infos.getOrNull(index)?.duration
                ?.coerceAtLeast(MinFrameDurationMillis)
                ?: MinFrameDurationMillis

            val fullSize = Image.makeFromBitmap(decodeTarget)
            try {
                val scaled = Bitmap().apply {
                    allocPixels(ImageInfo.makeN32Premul(outWidth, outHeight))
                }
                val canvas = Canvas(scaled)
                try {
                    canvas.drawImageRect(
                        image = fullSize,
                        src = Rect.makeWH(sourceWidth.toFloat(), sourceHeight.toFloat()),
                        dst = Rect.makeWH(outWidth.toFloat(), outHeight.toFloat()),
                        samplingMode = SamplingMode.MITCHELL,
                        paint = null,
                        strict = true,
                    )
                } finally {
                    runCatching { canvas.close() }
                }
                frames += Image.makeFromBitmap(scaled).toComposeImageBitmap()
                runCatching { scaled.close() }
            } finally {
                runCatching { fullSize.close() }
            }
        }

        if (AnimatedImageProbeLogging) {
            println(
                "[SkiaAnimatedImage] decoded ${sourceWidth}x$sourceHeight -> " +
                    "${outWidth}x$outHeight, frames=$frameCount, ${totalBytes / 1024}KB"
            )
        }
        return AnimationFrames(frames, durations, totalBytes)
    } catch (throwable: Throwable) {
        return null
    } finally {
        runCatching { sourceBitmap?.close() }
        runCatching { codec.close() }
        runCatching { data.close() }
    }
}

// ---------------------------------------------------------------------------
// Shared, reference-counted, budgeted animations
// ---------------------------------------------------------------------------

private class SharedAnimation(
    val key: String,
    val animation: AnimationFrames,
) {
    var refCount: Int = 0
    var job: Job? = null
    var idleEviction: Job? = null
    val frame: MutableState<ImageBitmap?> = mutableStateOf(animation.frames.firstOrNull())
}

private val registryScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
private val registry = mutableMapOf<String, SharedAnimation>()
private val pending = mutableMapOf<String, Deferred<SharedAnimation?>>()
private var budgetUsedBytes = 0L
private var animationsPaused = false
private var lifecycleObserversInstalled = false

private fun installLifecycleObservers() {
    if (lifecycleObserversInstalled) return
    lifecycleObserversInstalled = true

    val center = NSNotificationCenter.defaultCenter
    val mainQueue = NSOperationQueue.mainQueue

    center.addObserverForName(
        name = UIApplicationDidEnterBackgroundNotification,
        `object` = null,
        queue = mainQueue,
    ) { _ ->
        animationsPaused = true
        registry.values.forEach { shared ->
            shared.job?.cancel()
            shared.job = null
        }
    }

    center.addObserverForName(
        name = UIApplicationWillEnterForegroundNotification,
        `object` = null,
        queue = mainQueue,
    ) { _ ->
        animationsPaused = false
        registry.values.forEach { shared ->
            if (shared.refCount > 0) startIfNeeded(shared)
        }
    }

    center.addObserverForName(
        name = UIApplicationDidReceiveMemoryWarningNotification,
        `object` = null,
        queue = mainQueue,
    ) { _ ->
        registry.keys.toList().forEach { key -> evictIfIdle(key) }
        if (AnimatedImageProbeLogging) {
            println("[SkiaAnimatedImage] memory warning: budget now ${budgetUsedBytes / 1024}KB")
        }
    }
}

private fun bucket(value: Int): Int {
    val clamped = value.coerceIn(1, MaxAnimationTargetEdgePx)
    return ((clamped + SizeBucketPx - 1) / SizeBucketPx) * SizeBucketPx
}

private suspend fun acquireShared(url: String, targetWidth: Int, targetHeight: Int): SharedAnimation? {
    installLifecycleObservers()
    val key = "$url|${targetWidth}x$targetHeight"

    registry[key]?.let { existing ->
        existing.refCount++
        existing.idleEviction?.cancel()
        existing.idleEviction = null
        startIfNeeded(existing)
        return existing
    }

    val inFlight = pending[key] ?: registryScope.async {
        val bytes = fetchSourceBytes(url) ?: return@async null
        val remaining = MaxAnimationBudgetBytes - budgetUsedBytes
        if (remaining <= 0) return@async null

        val animation = withContext(Dispatchers.Default) {
            decodeAnimation(bytes, targetWidth, targetHeight, remaining)
        } ?: return@async null

        registry[key]?.let { return@async it }

        if (budgetUsedBytes + animation.bytes > MaxAnimationBudgetBytes) return@async null

        budgetUsedBytes += animation.bytes
        val shared = SharedAnimation(key, animation)
        registry[key] = shared

        shared.idleEviction = registryScope.launch {
            delay(IdleRetentionMillis)
            evictIfIdle(key)
        }
        shared
    }.also { pending[key] = it }

    val shared = try {
        inFlight.await()
    } finally {
        if (pending[key] === inFlight) pending.remove(key)
    } ?: return null

    shared.refCount++
    shared.idleEviction?.cancel()
    shared.idleEviction = null
    startIfNeeded(shared)
    return shared
}

private fun startIfNeeded(shared: SharedAnimation) {
    if (shared.job != null || animationsPaused) return
    val animation = shared.animation
    if (animation.frames.size <= 1) return

    shared.job = registryScope.launch {
        var index = 0
        while (true) {
            delay(animation.durationsMs[index].toLong())
            index = (index + 1) % animation.frames.size
            shared.frame.value = animation.frames[index]
        }
    }
}

private fun releaseShared(shared: SharedAnimation) {
    shared.refCount--
    if (shared.refCount > 0) return

    shared.idleEviction?.cancel()
    shared.idleEviction = registryScope.launch {
        delay(IdleRetentionMillis)
        evictIfIdle(shared.key)
    }
}

private fun evictIfIdle(key: String) {
    val shared = registry[key] ?: return
    if (shared.refCount > 0) return
    shared.job?.cancel()
    shared.job = null
    shared.idleEviction?.cancel()
    shared.idleEviction = null
    registry.remove(key)
    shared.frame.value = null
    budgetUsedBytes -= shared.animation.bytes
    if (budgetUsedBytes < 0) budgetUsedBytes = 0
}

// ---------------------------------------------------------------------------
// Compose entry point
// ---------------------------------------------------------------------------

internal class AnimatedFrame(
    val bitmap: ImageBitmap?,
    val unavailable: Boolean,
)

@Composable
internal fun rememberAnimatedFrame(
    url: String,
    targetWidthPx: Int,
    targetHeightPx: Int,
): AnimatedFrame {
    val width = bucket(targetWidthPx)
    val height = bucket(targetHeightPx)
    var shared by remember(url, width, height) { mutableStateOf<SharedAnimation?>(null) }
    var unavailable by remember(url, width, height) { mutableStateOf(false) }

    DisposableEffect(url, width, height) {
        var released = false
        var acquired: SharedAnimation? = null

        val subscription = registryScope.launch {
            val result = acquireShared(url, width, height)
            if (result == null) {
                unavailable = true
                return@launch
            }
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

    return AnimatedFrame(bitmap = shared?.frame?.value, unavailable = unavailable)
}
