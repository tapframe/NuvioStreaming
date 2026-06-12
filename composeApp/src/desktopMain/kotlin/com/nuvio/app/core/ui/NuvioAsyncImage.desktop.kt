package com.nuvio.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.DefaultAlpha
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asComposeImageBitmap
import androidx.compose.ui.graphics.asSkiaBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import coil3.BitmapImage
import coil3.Image
import coil3.PlatformContext
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.NullRequestDataException
import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.FilterMipmap
import org.jetbrains.skia.FilterMode
import org.jetbrains.skia.Image as SkiaImage
import org.jetbrains.skia.MipmapMode
import kotlin.math.max
import kotlin.math.roundToInt

private const val MinCustomDownscaleRatio = 1.08f
private const val MaxDesktopSourceSizePx = 1536
private const val MaxScaledBitmapPixels = 1_250_000L

private val IsWindowsDesktop: Boolean =
    System.getProperty("os.name")
        ?.startsWith("Windows", ignoreCase = true)
        ?: false

@Composable
internal actual fun NuvioAsyncImage(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier,
    placeholder: Painter?,
    error: Painter?,
    fallback: Painter?,
    onLoading: ((AsyncImagePainter.State.Loading) -> Unit)?,
    onSuccess: ((AsyncImagePainter.State.Success) -> Unit)?,
    onError: ((AsyncImagePainter.State.Error) -> Unit)?,
    alignment: Alignment,
    contentScale: ContentScale,
    alpha: Float,
    colorFilter: ColorFilter?,
    filterQuality: FilterQuality?,
    clipToBounds: Boolean,
    desktopImageScaling: NuvioDesktopImageScaling,
) {
    val context = LocalPlatformContext.current
    val effectiveDesktopImageScaling = remember(desktopImageScaling) {
        if (IsWindowsDesktop) desktopImageScaling else NuvioDesktopImageScaling.Disabled
    }
    val requestModel = remember(context, model, effectiveDesktopImageScaling) {
        if (effectiveDesktopImageScaling == NuvioDesktopImageScaling.Disabled) {
            model
        } else {
            model.withDesktopHighQualitySize(context)
        }
    }
    val transform: (AsyncImagePainter.State) -> AsyncImagePainter.State = remember(
        placeholder,
        error,
        fallback,
        effectiveDesktopImageScaling,
    ) {
        { state ->
            when (state) {
                is AsyncImagePainter.State.Loading -> {
                    placeholder?.let { state.copy(painter = it) } ?: state
                }
                is AsyncImagePainter.State.Success -> {
                    state.result.image.toScaledBitmapPainter(effectiveDesktopImageScaling)
                        ?.let { state.copy(painter = it) }
                        ?: state
                }
                is AsyncImagePainter.State.Error -> {
                    val fallbackPainter = if (state.result.throwable is NullRequestDataException) {
                        fallback ?: error
                    } else {
                        error
                    }
                    fallbackPainter?.let { state.copy(painter = it) } ?: state
                }
                AsyncImagePainter.State.Empty -> state
            }
        }
    }
    val onState: ((AsyncImagePainter.State) -> Unit)? = remember(onLoading, onSuccess, onError) {
        if (onLoading == null && onSuccess == null && onError == null) {
            null
        } else {
            { state ->
                when (state) {
                    is AsyncImagePainter.State.Loading -> onLoading?.invoke(state)
                    is AsyncImagePainter.State.Success -> onSuccess?.invoke(state)
                    is AsyncImagePainter.State.Error -> onError?.invoke(state)
                    AsyncImagePainter.State.Empty -> Unit
                }
            }
        }
    }

    AsyncImage(
        model = requestModel,
        contentDescription = contentDescription,
        modifier = modifier,
        transform = transform,
        onState = onState,
        alignment = alignment,
        contentScale = contentScale,
        alpha = alpha,
        colorFilter = colorFilter,
        filterQuality = filterQuality ?: FilterQuality.High,
        clipToBounds = clipToBounds,
    )
}

private fun Any?.withDesktopHighQualitySize(context: PlatformContext): Any? {
    if (this == null) return null

    return if (this is ImageRequest) {
        newBuilder()
            .size(MaxDesktopSourceSizePx)
            .build()
    } else {
        ImageRequest.Builder(context)
            .data(this)
            .size(MaxDesktopSourceSizePx)
            .build()
    }
}

private fun Image.toScaledBitmapPainter(desktopImageScaling: NuvioDesktopImageScaling): Painter? {
    if (desktopImageScaling == NuvioDesktopImageScaling.Disabled) return null

    return (this as? BitmapImage)
        ?.bitmap
        ?.asComposeImageBitmap()
        ?.let { imageBitmap -> ScaledBitmapPainter(imageBitmap) }
}

private class ScaledBitmapPainter(
    private val image: ImageBitmap,
) : Painter() {
    private var cachedSize: IntSize? = null
    private var cachedBitmap: ImageBitmap? = null
    private var alpha: Float = DefaultAlpha
    private var colorFilter: ColorFilter? = null

    override val intrinsicSize: Size =
        Size(image.width.toFloat(), image.height.toFloat())

    override fun DrawScope.onDraw() {
        val drawSize = IntSize(
            width = size.width.roundToInt().coerceAtLeast(1),
            height = size.height.roundToInt().coerceAtLeast(1),
        )
        if (!shouldUseScaledBitmap(drawSize)) {
            drawSource(drawSize)
            return
        }

        val cacheSize = drawSize.cacheSize()
        if (cacheSize.pixelCount() > MaxScaledBitmapPixels) {
            drawSource(drawSize)
            return
        }

        val bitmap = scaledBitmap(cacheSize)

        drawImage(
            image = bitmap,
            srcOffset = IntOffset.Zero,
            srcSize = cacheSize,
            dstOffset = IntOffset.Zero,
            dstSize = drawSize,
            alpha = alpha,
            colorFilter = colorFilter,
            filterQuality = if (cacheSize == drawSize) FilterQuality.None else FilterQuality.Medium,
        )
    }

    override fun applyAlpha(alpha: Float): Boolean {
        this.alpha = alpha
        return true
    }

    override fun applyColorFilter(colorFilter: ColorFilter?): Boolean {
        this.colorFilter = colorFilter
        return true
    }

    private fun scaledBitmap(size: IntSize): ImageBitmap {
        cachedBitmap?.let { bitmap ->
            if (cachedSize == size) return bitmap
        }
        return image.scale(size.width, size.height).also { bitmap ->
            cachedSize = size
            cachedBitmap = bitmap
        }
    }

    private fun DrawScope.drawSource(drawSize: IntSize) {
        drawImage(
            image = image,
            srcOffset = IntOffset.Zero,
            srcSize = IntSize(image.width, image.height),
            dstOffset = IntOffset.Zero,
            dstSize = drawSize,
            alpha = alpha,
            colorFilter = colorFilter,
            filterQuality = FilterQuality.High,
        )
    }

    private fun shouldUseScaledBitmap(drawSize: IntSize): Boolean {
        if (drawSize.pixelCount() > MaxScaledBitmapPixels) return false

        val widthScale = image.width.toFloat() / drawSize.width.toFloat()
        val heightScale = image.height.toFloat() / drawSize.height.toFloat()
        return max(widthScale, heightScale) >= MinCustomDownscaleRatio
    }

    private fun IntSize.cacheSize(): IntSize {
        val quantum = cacheQuantum()
        return IntSize(
            width = width.roundUpTo(quantum),
            height = height.roundUpTo(quantum),
        )
    }

    private fun IntSize.cacheQuantum(): Int {
        val longestSide = max(width, height)
        return when {
            longestSide >= 1200 -> 16
            longestSide >= 600 -> 8
            longestSide >= 200 -> 4
            else -> 2
        }
    }

    private fun Int.roundUpTo(quantum: Int): Int =
        ((this + quantum - 1) / quantum) * quantum

    private fun IntSize.pixelCount(): Long =
        width.toLong() * height.toLong()

    private fun ImageBitmap.scale(width: Int, height: Int): ImageBitmap {
        val image = SkiaImage.makeFromBitmap(asSkiaBitmap())
        return try {
            image.scale(width, height)
        } finally {
            image.close()
        }
    }

    private fun SkiaImage.scale(width: Int, height: Int): ImageBitmap {
        val bitmap = Bitmap()
        bitmap.allocN32Pixels(width, height)
        scalePixels(
            bitmap.peekPixels()!!,
            FilterMipmap(FilterMode.LINEAR, MipmapMode.LINEAR),
            false,
        )
        return bitmap.asComposeImageBitmap()
    }
}
