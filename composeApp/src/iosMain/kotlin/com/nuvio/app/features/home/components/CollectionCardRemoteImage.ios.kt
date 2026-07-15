package com.nuvio.app.features.home.components

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.interop.UIKitView
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.request.get
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.reinterpret
import platform.CoreGraphics.CGImageRef
import platform.CoreFoundation.CFDataCreate
import platform.ImageIO.CGImageSourceCreateImageAtIndex
import platform.ImageIO.CGImageSourceCreateWithData
import platform.ImageIO.CGImageSourceGetCount
import platform.UIKit.UIImage
import platform.UIKit.UIImageView
import platform.UIKit.UIViewContentMode
import platform.CoreGraphics.CGImageRelease
import kotlinx.cinterop.usePinned

private val animatedImageHttpClient = HttpClient(Darwin)
private val animatedImageDecodeScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
private const val MaxCachedAnimatedImages = 12
private const val DefaultAnimatedFrameDelayCentiseconds = 10
private val animatedImageCache = mutableMapOf<String, UIImage>()
private val animatedImageCacheOrder = mutableListOf<String>()
private val animatedImageInFlight = mutableMapOf<String, Deferred<UIImage?>>()

private enum class AnimatedRasterFormat {
    Gif,
    Webp,
}

private data class AnimatedFrame(
    val image: UIImage,
    val delayCentiseconds: Int,
)

private data class ExpandedAnimatedFrames(
    val images: List<UIImage>,
    val tickCentiseconds: Int,
)

private class AnimatedImageViewHolder {
    var imageView: UIImageView? = null

    fun clear() {
        imageView?.stopAnimating()
        imageView?.image = null
        imageView = null
    }
}

@OptIn(ExperimentalForeignApi::class)
@Composable
internal actual fun CollectionCardRemoteImage(
    imageUrl: String,
    contentDescription: String,
    modifier: Modifier,
    contentScale: ContentScale,
    animateIfPossible: Boolean,
) {
    val animatedFormat = imageUrl.animatedRasterFormatOrNull()
    if (!animateIfPossible || animatedFormat == null) {
        AsyncImage(
            model = imageUrl,
            contentDescription = contentDescription,
            modifier = modifier,
            contentScale = contentScale,
        )
        return
    }

    var animatedImage by remember(imageUrl) { mutableStateOf(cachedAnimatedImage(imageUrl)) }
    var fallbackToAsyncImage by remember(imageUrl) { mutableStateOf(false) }

    LaunchedEffect(imageUrl, animatedFormat) {
        fallbackToAsyncImage = false
        val image = loadAnimatedImage(imageUrl, animatedFormat)
        if (image != null) {
            animatedImage = image
        } else {
            fallbackToAsyncImage = true
        }
    }

    if (fallbackToAsyncImage) {
        AsyncImage(
            model = imageUrl,
            contentDescription = contentDescription,
            modifier = modifier,
            contentScale = contentScale,
        )
        return
    }

    val uiContentMode = contentScale.toUIViewContentMode()
    val imageViewHolder = remember(imageUrl) { AnimatedImageViewHolder() }
    DisposableEffect(imageUrl) {
        onDispose {
            imageViewHolder.clear()
        }
    }

    UIKitView(
        modifier = modifier,
        interactive = false,
        factory = {
            UIImageView().apply {
                contentMode = uiContentMode
                clipsToBounds = true
                userInteractionEnabled = false
                tag = imageUrl.hashCode().toLong()
                imageViewHolder.imageView = this
                updateAnimatedImage(animatedImage)
            }
        },
        update = { imageView ->
            imageViewHolder.imageView = imageView
            if (imageView.tag != imageUrl.hashCode().toLong()) {
                imageView.tag = imageUrl.hashCode().toLong()
            }
            if (imageView.contentMode != uiContentMode) {
                imageView.contentMode = uiContentMode
            }
            imageView.updateAnimatedImage(animatedImage)
        },
    )
}

private fun UIImageView.updateAnimatedImage(image: UIImage?) {
    if (this.image != image) {
        stopAnimating()
        this.image = image
    }
    if (image != null) {
        startAnimating()
    }
}

private fun cachedAnimatedImage(imageUrl: String): UIImage? {
    val image = animatedImageCache[imageUrl] ?: return null
    animatedImageCacheOrder.remove(imageUrl)
    animatedImageCacheOrder.add(imageUrl)
    return image
}

private fun storeAnimatedImage(imageUrl: String, image: UIImage) {
    animatedImageCache[imageUrl] = image
    animatedImageCacheOrder.remove(imageUrl)
    animatedImageCacheOrder.add(imageUrl)

    while (animatedImageCacheOrder.size > MaxCachedAnimatedImages) {
        val eldestKey = animatedImageCacheOrder.removeFirstOrNull() ?: break
        animatedImageCache.remove(eldestKey)
    }
}

@OptIn(ExperimentalForeignApi::class)
private suspend fun loadAnimatedImage(
    imageUrl: String,
    format: AnimatedRasterFormat,
): UIImage? {
    cachedAnimatedImage(imageUrl)?.let { return it }

    val request = animatedImageInFlight[imageUrl] ?: animatedImageDecodeScope.async {
        runCatching {
            val bytes = animatedImageHttpClient.get(imageUrl).body<ByteArray>()
            bytes
                .takeIf { it.isNotEmpty() }
                ?.let { imageBytes ->
                    UIImage.animatedImageWithData(
                        data = imageBytes.toCFData(),
                        frameDurationsCentiseconds = when (format) {
                            AnimatedRasterFormat.Gif -> parseGifFrameDurationsCentiseconds(imageBytes)
                            AnimatedRasterFormat.Webp -> parseWebpFrameDurationsCentiseconds(imageBytes)
                        },
                    )
                }
        }.getOrNull()
    }.also { animatedImageInFlight[imageUrl] = it }

    val image = try {
        request.await()
    } finally {
        if (animatedImageInFlight[imageUrl] === request) {
            animatedImageInFlight.remove(imageUrl)
        }
    }

    if (image != null) {
        storeAnimatedImage(imageUrl, image)
    }

    return image
}

@OptIn(ExperimentalForeignApi::class)
private fun ByteArray.toCFData() =
    usePinned { pinned ->
        CFDataCreate(
            allocator = null,
            bytes = pinned.addressOf(0).reinterpret(),
            length = size.toLong(),
        )
    }

@OptIn(ExperimentalForeignApi::class)
private fun UIImage.Companion.animatedImageWithData(
    data: kotlinx.cinterop.CPointer<cnames.structs.__CFData>?,
    frameDurationsCentiseconds: List<Int>,
): UIImage? {
    return runCatching {
        val source = data?.let { CGImageSourceCreateWithData(it, null) } ?: return null
        val count = CGImageSourceGetCount(source).toInt()
        val frames = mutableListOf<AnimatedFrame>()

        for (index in 0 until count) {
            val imageRef: CGImageRef = CGImageSourceCreateImageAtIndex(source, index.toULong(), null) ?: continue
            try {
                frames.add(
                    AnimatedFrame(
                        image = UIImage.imageWithCGImage(imageRef),
                        delayCentiseconds = frameDurationsCentiseconds.getOrNull(index)
                            ?.coerceAtLeast(1)
                            ?: DefaultAnimatedFrameDelayCentiseconds,
                    )
                )
            } finally {
                CGImageRelease(imageRef)
            }
        }

        if (frames.isEmpty()) return null

        val expanded = expandedAnimatedFrames(frames)
        val durationSeconds = (expanded.images.size * expanded.tickCentiseconds) / 100.0
        UIImage.animatedImageWithImages(expanded.images, durationSeconds)
    }.getOrNull()
}

private fun expandedAnimatedFrames(frames: List<AnimatedFrame>): ExpandedAnimatedFrames {
    val normalizedDelays = frames.map { it.delayCentiseconds.coerceAtLeast(1) }
    val tickCentiseconds = normalizedDelays.reduce(::greatestCommonDivisor)
    val expandedSize = normalizedDelays.sumOf { it / tickCentiseconds }
    val expandedFrames = ArrayList<UIImage>(expandedSize)

    frames.forEach { frame ->
        val repeatCount = (frame.delayCentiseconds.coerceAtLeast(1) / tickCentiseconds).coerceAtLeast(1)
        repeat(repeatCount) {
            expandedFrames.add(frame.image)
        }
    }

    return ExpandedAnimatedFrames(
        images = expandedFrames,
        tickCentiseconds = tickCentiseconds,
    )
}

private fun greatestCommonDivisor(a: Int, b: Int): Int {
    var x = a
    var y = b
    while (y != 0) {
        val temp = x % y
        x = y
        y = temp
    }
    return x.coerceAtLeast(1)
}

private fun parseGifFrameDurationsCentiseconds(bytes: ByteArray): List<Int> {
    if (bytes.size < 13 || !bytes.hasGifHeader()) return emptyList()

    var index = 6
    if (index + 7 > bytes.size) return emptyList()

    val logicalScreenPacked = bytes[index + 4].unsignedInt()
    index += 7

    if (logicalScreenPacked and 0x80 != 0) {
        val globalColorTableSize = 3 * (1 shl ((logicalScreenPacked and 0x07) + 1))
        index += globalColorTableSize
    }

    val frameDurations = mutableListOf<Int>()
    var pendingDelayCentiseconds: Int? = null

    while (index < bytes.size) {
        when (bytes[index].unsignedInt()) {
            0x21 -> {
                if (index + 1 >= bytes.size) break
                val extensionLabel = bytes[index + 1].unsignedInt()
                if (extensionLabel == 0xF9) {
                    if (index + 7 >= bytes.size) break
                    val delayHundredths = bytes.readUnsignedShort(index + 4)
                    pendingDelayCentiseconds = if (delayHundredths <= 0) {
                        DefaultAnimatedFrameDelayCentiseconds
                    } else {
                        delayHundredths
                    }
                    index += 8
                } else {
                    index += 2
                    index = bytes.skipGifSubBlocks(index)
                }
            }

            0x2C -> {
                if (index + 9 >= bytes.size) break
                val imageDescriptorPacked = bytes[index + 9].unsignedInt()
                index += 10

                if (imageDescriptorPacked and 0x80 != 0) {
                    val localColorTableSize = 3 * (1 shl ((imageDescriptorPacked and 0x07) + 1))
                    index += localColorTableSize
                }

                if (index >= bytes.size) break
                index += 1
                index = bytes.skipGifSubBlocks(index)

                frameDurations += pendingDelayCentiseconds ?: DefaultAnimatedFrameDelayCentiseconds
                pendingDelayCentiseconds = null
            }

            0x3B -> break
            else -> break
        }
    }

    return frameDurations
}

private fun parseWebpFrameDurationsCentiseconds(bytes: ByteArray): List<Int> {
    if (bytes.size < 12 || !bytes.hasWebpHeader()) return emptyList()

    var index = 12
    val frameDurations = mutableListOf<Int>()

    while (index + 8 <= bytes.size) {
        val chunkDataStart = index + 8
        val chunkSize = bytes.readUnsignedInt32(index + 4)
        if (chunkSize < 0) break

        val chunkDataEndLong = chunkDataStart.toLong() + chunkSize
        if (chunkDataEndLong > bytes.size) break
        val chunkDataEnd = chunkDataEndLong.toInt()

        if (bytes.matchesAscii(index, "ANMF") && chunkSize >= 16) {
            val durationMillis = bytes.readUnsignedInt24(chunkDataStart + 12)
            frameDurations += if (durationMillis <= 0) {
                DefaultAnimatedFrameDelayCentiseconds
            } else {
                ((durationMillis + 9) / 10).coerceAtLeast(1)
            }
        }

        index = chunkDataEnd + (chunkSize % 2L).toInt()
    }

    return frameDurations
}

private fun String.animatedRasterFormatOrNull(): AnimatedRasterFormat? {
    val cleanUrl = substringBefore('?').substringBefore('#')
    return when {
        cleanUrl.endsWith(".gif", ignoreCase = true) -> AnimatedRasterFormat.Gif
        cleanUrl.endsWith(".webp", ignoreCase = true) -> AnimatedRasterFormat.Webp
        else -> null
    }
}

private fun ContentScale.toUIViewContentMode(): UIViewContentMode = when (this) {
    ContentScale.Crop -> UIViewContentMode.UIViewContentModeScaleAspectFill
    ContentScale.Fit,
    ContentScale.Inside -> UIViewContentMode.UIViewContentModeScaleAspectFit
    ContentScale.FillBounds -> UIViewContentMode.UIViewContentModeScaleToFill
    else -> UIViewContentMode.UIViewContentModeScaleAspectFill
}

private fun ByteArray.hasGifHeader(): Boolean =
    size >= 6 &&
        this[0] == 'G'.code.toByte() &&
        this[1] == 'I'.code.toByte() &&
        this[2] == 'F'.code.toByte() &&
        this[3] == '8'.code.toByte() &&
        (this[4] == '7'.code.toByte() || this[4] == '9'.code.toByte()) &&
        this[5] == 'a'.code.toByte()

private fun ByteArray.skipGifSubBlocks(startIndex: Int): Int {
    var index = startIndex
    while (index < size) {
        val blockSize = this[index].unsignedInt()
        index += 1
        if (blockSize == 0) {
            return index
        }
        index += blockSize
    }
    return index
}

private fun ByteArray.hasWebpHeader(): Boolean =
    matchesAscii(0, "RIFF") && matchesAscii(8, "WEBP")

private fun ByteArray.matchesAscii(startIndex: Int, value: String): Boolean {
    if (startIndex < 0 || startIndex + value.length > size) return false
    return value.indices.all { offset ->
        this[startIndex + offset] == value[offset].code.toByte()
    }
}

private fun ByteArray.readUnsignedShort(startIndex: Int): Int {
    if (startIndex + 1 >= size) return 0
    return this[startIndex].unsignedInt() or (this[startIndex + 1].unsignedInt() shl 8)
}

private fun ByteArray.readUnsignedInt24(startIndex: Int): Int {
    if (startIndex + 2 >= size) return 0
    return this[startIndex].unsignedInt() or
        (this[startIndex + 1].unsignedInt() shl 8) or
        (this[startIndex + 2].unsignedInt() shl 16)
}

private fun ByteArray.readUnsignedInt32(startIndex: Int): Long {
    if (startIndex + 3 >= size) return -1
    return this[startIndex].unsignedInt().toLong() or
        (this[startIndex + 1].unsignedInt().toLong() shl 8) or
        (this[startIndex + 2].unsignedInt().toLong() shl 16) or
        (this[startIndex + 3].unsignedInt().toLong() shl 24)
}

private fun Byte.unsignedInt(): Int = toInt() and 0xFF
