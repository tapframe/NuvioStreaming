package com.nuvio.app.core.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage

@Composable
internal actual fun NuvioAsyncImage(
    imageUrl: String,
    contentDescription: String,
    modifier: Modifier,
    contentScale: ContentScale,
    animateIfPossible: Boolean,
) {
    if (!animateIfPossible || !imageUrl.looksAnimated()) {
        AsyncImage(
            model = imageUrl,
            contentDescription = contentDescription,
            modifier = modifier,
            contentScale = contentScale,
        )
        return
    }

    BoxWithConstraints(modifier = modifier) {
        val targetWidth = constraints.maxWidth
            .takeIf { it in 1..MaxAnimationTargetEdgePx }
            ?: DefaultAnimationTargetEdgePx
        val targetHeight = constraints.maxHeight
            .takeIf { it in 1..MaxAnimationTargetEdgePx }
            ?: DefaultAnimationTargetEdgePx

        val frame = rememberAnimatedFrame(imageUrl, targetWidth, targetHeight)

        if (frame == null) {
            AsyncImage(
                model = imageUrl,
                contentDescription = contentDescription,
                modifier = Modifier.matchParentSize(),
                contentScale = contentScale,
            )
        } else {
            Image(
                bitmap = frame,
                contentDescription = contentDescription,
                modifier = Modifier.matchParentSize(),
                contentScale = contentScale,
            )
        }
    }
}

private fun String.looksAnimated(): Boolean {
    val cleanUrl = substringBefore('?').substringBefore('#')
    return cleanUrl.endsWith(".gif", ignoreCase = true) ||
        cleanUrl.endsWith(".webp", ignoreCase = true)
}
