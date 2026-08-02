package com.nuvio.app.core.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import com.kmpalette.extensions.painter.rememberPainterDominantColorState
import com.kmpalette.rememberDominantColorState
import com.nuvio.app.features.details.components.loadedBackdropImageBitmap
import com.nuvio.app.features.settings.ThemeSettingsRepository
import kotlin.math.max

/**
 * Ambient flag telling descendants that a dynamic colour wash is being painted behind them.
 *
 * Screens that normally fade their hero gradients into the opaque theme background must soften
 * those gradients when this is true, otherwise they paint over the wash and the feature becomes
 * invisible. Use [dynamicScrimAlpha] for that.
 */
val LocalDynamicArtworkBackgroundActive = staticCompositionLocalOf { false }

/**
 * Artwork is fetched at a tiny resolution purely to sample its palette — it is never displayed, so
 * this costs almost nothing even on low-end devices.
 */
private const val PALETTE_SAMPLE_PX = 96

/** How far the theme background is pulled towards the artwork's dominant colour. */
private const val DOMINANT_BLEND_FRACTION = 0.55f

/** Alpha of the two radial colour blobs. */
private const val PRIMARY_BLOB_ALPHA = 0.85f
private const val SECONDARY_BLOB_ALPHA = 0.5f

/** Softens the blob edges into each other. Gradients degrade gracefully where blur is a no-op. */
private val WASH_BLUR_RADIUS = 72.dp

/** Opacity of the base fade that keeps list content readable towards the bottom of the screen. */
private const val BOTTOM_FADE_ALPHA = 0.55f

private const val COLOR_TRANSITION_MS = 900

/** Multiplier applied to hero scrim gradients while the wash is visible. */
private const val DYNAMIC_SCRIM_SOFTENING = 0.38f

@Composable
fun rememberDynamicArtworkBackgroundEnabled(): Boolean {
    val enabled by ThemeSettingsRepository.dynamicArtworkBackgroundEnabled.collectAsState()
    return enabled
}

/**
 * Softens a scrim alpha when the dynamic background is active so the colour wash stays visible
 * behind hero gradients. Returns [base] unchanged when the feature is off.
 */
@Composable
fun dynamicScrimAlpha(base: Float): Float =
    if (LocalDynamicArtworkBackgroundActive.current) base * DYNAMIC_SCRIM_SOFTENING else base

/**
 * Tints the screen behind [content] with a soft, blurred gradient built from the dominant colour of
 * [artworkUrl].
 *
 * Unlike a blurred copy of the artwork this never shows recognisable image detail — it samples a
 * 96px thumbnail, extracts one colour, and paints two overlapping radial gradients that are blurred
 * into each other. That keeps the cost flat regardless of artwork resolution.
 *
 * When the user has the setting disabled this is a pass-through: no extra layers, no image request,
 * and [LocalDynamicArtworkBackgroundActive] stays false so the screen keeps its current look.
 */
@Composable
fun DynamicArtworkBackground(
    artworkUrl: String?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val active = rememberDynamicArtworkBackgroundEnabled()
    if (!active) {
        CompositionLocalProvider(LocalDynamicArtworkBackgroundActive provides false) {
            content()
        }
        return
    }

    val colorScheme = MaterialTheme.colorScheme
    val baseColor = colorScheme.background
    val platformContext = LocalPlatformContext.current
    val normalizedUrl = artworkUrl?.takeIf { it.isNotBlank() }

    var samplePainter by remember(normalizedUrl) { mutableStateOf<Painter?>(null) }
    var sampleImageBitmap by remember(normalizedUrl) { mutableStateOf<ImageBitmap?>(null) }

    val imageBitmapColorState = rememberDominantColorState(
        defaultColor = baseColor,
        defaultOnColor = colorScheme.onBackground,
    )
    val painterColorState = rememberPainterDominantColorState(
        defaultColor = baseColor,
        defaultOnColor = colorScheme.onBackground,
    )

    LaunchedEffect(sampleImageBitmap, samplePainter) {
        val bitmap = sampleImageBitmap
        val painter = samplePainter
        when {
            // Android hands us a real bitmap; iOS returns null and we fall back to the painter.
            bitmap != null -> runCatching { imageBitmapColorState.updateFrom(bitmap) }
            painter != null -> runCatching { painterColorState.updateFrom(painter) }
        }
    }

    val extractedColor = if (sampleImageBitmap != null) {
        imageBitmapColorState.color
    } else {
        painterColorState.color
    }

    val targetColor = if (normalizedUrl != null) {
        baseColor.blendTowards(extractedColor, DOMINANT_BLEND_FRACTION)
    } else {
        baseColor
    }

    val washColor by animateColorAsState(
        targetValue = targetColor,
        animationSpec = tween(durationMillis = COLOR_TRANSITION_MS, easing = LinearOutSlowInEasing),
        label = "dynamic_artwork_wash_color",
    )
    val accentColor = washColor.blendTowards(Color.White, fraction = 0.22f)

    Box(modifier = modifier.fillMaxSize().background(baseColor)) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .blur(WASH_BLUR_RADIUS)
                .drawBehind {
                    val spread = max(size.width, size.height)

                    drawRect(
                        brush = Brush.radialGradient(
                            // Fading to a transparent copy of the same colour rather than to
                            // Color.Transparent avoids a grey/black fringe where the blob ends.
                            colors = listOf(
                                washColor.copy(alpha = PRIMARY_BLOB_ALPHA),
                                washColor.copy(alpha = 0f),
                            ),
                            center = Offset(x = size.width * 0.18f, y = size.height * 0.04f),
                            radius = spread * 0.95f,
                        ),
                    )

                    drawRect(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                accentColor.copy(alpha = SECONDARY_BLOB_ALPHA),
                                accentColor.copy(alpha = 0f),
                            ),
                            center = Offset(x = size.width * 0.92f, y = size.height * 0.34f),
                            radius = spread * 0.7f,
                        ),
                    )

                    drawRect(
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                baseColor.copy(alpha = 0f),
                                baseColor.copy(alpha = BOTTOM_FADE_ALPHA),
                            ),
                            startY = size.height * 0.35f,
                            endY = size.height,
                        ),
                    )
                },
        )

        // Never drawn: this only exists so Coil decodes a thumbnail we can sample the palette from.
        if (normalizedUrl != null) {
            val paletteRequest = remember(platformContext, normalizedUrl) {
                ImageRequest.Builder(platformContext)
                    .data(normalizedUrl)
                    .size(PALETTE_SAMPLE_PX, PALETTE_SAMPLE_PX)
                    .build()
            }
            AsyncImage(
                model = paletteRequest,
                contentDescription = null,
                modifier = Modifier
                    .size(1.dp)
                    .graphicsLayer { alpha = 0f },
                onSuccess = { state ->
                    samplePainter = state.painter
                    sampleImageBitmap = loadedBackdropImageBitmap(state.result)
                },
            )
        }

        CompositionLocalProvider(LocalDynamicArtworkBackgroundActive provides true) {
            content()
        }
    }
}

private fun Color.blendTowards(target: Color, fraction: Float): Color {
    val clamped = fraction.coerceIn(0f, 1f)
    return Color(
        red = red + (target.red - red) * clamped,
        green = green + (target.green - green) * clamped,
        blue = blue + (target.blue - blue) * clamped,
        alpha = alpha + (target.alpha - alpha) * clamped,
    )
}
