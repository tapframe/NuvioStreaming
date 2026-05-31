package com.nuvio.app.features.player

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvioTypeScale

private val ThumbnailWidth  = 220.dp
private val ThumbnailHeight = 124.dp
private val ThumbnailCorner = 8.dp

@Composable
internal fun SeekPreviewThumbnailOverlay(
    scrubFraction: Float,
    positionMs: Long,
    frame: SeekPreviewFrame?,
    isVisible: Boolean,
    horizontalPadding: Dp,
    modifier: Modifier = Modifier,
) {
    // Yavaş fade — 400ms giriş, 300ms çıkış
    val alpha by animateFloatAsState(
        targetValue = if (isVisible) 1f else 0f,
        animationSpec = tween(durationMillis = if (isVisible) 400 else 300),
        label = "seekPreviewAlpha",
    )

    if (alpha <= 0.01f) return

    // highRes gelince blur animasyonla kaldırılır
    val hasHighRes = frame?.highRes != null
    val blurRadius by animateFloatAsState(
        targetValue = if (hasHighRes) 0f else 12f,
        animationSpec = tween(durationMillis = 350),
        label = "seekPreviewBlur",
    )

    // highRes yoksa lowRes'i göster (blurlu), varsa highRes
    val displayBitmap: ImageBitmap? = frame?.highRes ?: frame?.lowRes

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .alpha(alpha),
    ) {
        val trackWidth = maxWidth - horizontalPadding * 2
        val rawStart = horizontalPadding + trackWidth * scrubFraction - ThumbnailWidth / 2
        val clampedStart = rawStart.coerceIn(0.dp, maxWidth - ThumbnailWidth)

        Box(
            modifier = Modifier
                .padding(start = clampedStart)
                .width(ThumbnailWidth)
                .shadow(12.dp, RoundedCornerShape(ThumbnailCorner))
                .clip(RoundedCornerShape(ThumbnailCorner))
                .background(Color.Black)
                .border(1.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(ThumbnailCorner)),
        ) {
            if (displayBitmap != null) {
                Image(
                    bitmap = displayBitmap,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(ThumbnailHeight)
                        // Blur sadece lowRes gösterilirken aktif, highRes gelince kaybolur
                        .then(
                            if (blurRadius > 0.5f)
                                Modifier.blur(blurRadius.dp)
                            else
                                Modifier
                        ),
                )
            } else {
                // Hiç frame yok — koyu placeholder
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(ThumbnailHeight)
                        .background(Color(0xFF1C1C1C)),
                )
            }

            // Zaman etiketi
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Color.Black.copy(alpha = 0.7f))
                    .padding(horizontal = 8.dp, vertical = 5.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = formatPlaybackTime(positionMs),
                    style = MaterialTheme.nuvioTypeScale.labelSm.copy(
                        fontWeight = FontWeight.Bold,
                    ),
                    color = Color.White,
                )
            }
        }
    }
}
