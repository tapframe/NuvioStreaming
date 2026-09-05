package com.nuvio.app.core.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

@Composable
internal fun rememberShimmerBrush(
    baseColor: Color,
    highlightColor: Color,
): State<Brush> {
    val transition = rememberInfiniteTransition()
    val translation = transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
    )
    return remember(baseColor, highlightColor, translation) {
        val colors = listOf(baseColor, highlightColor, baseColor)
        derivedStateOf {
            val offset = translation.value
            Brush.linearGradient(
                colors = colors,
                start = Offset(offset - 200f, 0f),
                end = Offset(offset, 0f),
            )
        }
    }
}

internal fun Modifier.shimmerBackground(brush: State<Brush>): Modifier =
    drawBehind { drawRect(brush.value) }
