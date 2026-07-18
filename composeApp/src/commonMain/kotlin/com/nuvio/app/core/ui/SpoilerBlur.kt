package com.nuvio.app.core.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeInputScale
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

private val SpoilerBlurFallbackTint = HazeTint(Color.Black.copy(alpha = 0.85f))
private val SpoilerBlurClearTint = HazeTint(Color.Transparent)

/**
 * Blurs spoiler-sensitive artwork on every platform supported by Haze. If blur cannot be
 * initialized, the fallback tint keeps the spoiler content obscured. The effect node remains
 * attached while watched state changes so Haze can update its legacy Android rendering path.
 */
internal fun Modifier.spoilerBlur(
    active: Boolean,
    blurred: Boolean,
    radius: Dp = 18.dp,
): Modifier = if (active) {
    hazeEffect {
        blurRadius = radius
        blurEnabled = blurred
        inputScale = if (blurred) HazeInputScale.Auto else HazeInputScale.None
        noiseFactor = 0f
        fallbackTint = if (blurred) SpoilerBlurFallbackTint else SpoilerBlurClearTint
    }
} else {
    this
}
