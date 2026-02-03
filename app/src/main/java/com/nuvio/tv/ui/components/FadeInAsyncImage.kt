package com.nuvio.tv.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter

/**
 * AsyncImage wrapper that always plays a fade-in animation on load,
 * even when the image is served from Coil's memory/disk cache.
 */
@Composable
fun FadeInAsyncImage(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Fit,
    alignment: Alignment = Alignment.Center,
    fadeDurationMs: Int = 400
) {
    var loaded by remember(model) { mutableStateOf(false) }
    val alpha by animateFloatAsState(
        targetValue = if (loaded) 1f else 0f,
        animationSpec = tween(durationMillis = fadeDurationMs),
        label = "imageFadeIn"
    )

    AsyncImage(
        model = model,
        contentDescription = contentDescription,
        modifier = modifier.graphicsLayer { this.alpha = alpha },
        contentScale = contentScale,
        alignment = alignment,
        onState = { state ->
            if (state is AsyncImagePainter.State.Success) {
                loaded = true
            }
        }
    )
}
