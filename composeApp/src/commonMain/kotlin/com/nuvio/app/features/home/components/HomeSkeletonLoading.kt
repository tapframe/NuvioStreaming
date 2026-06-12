package com.nuvio.app.features.home.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.isDesktop
import com.nuvio.app.core.ui.landscapePosterHeightForWidth
import com.nuvio.app.core.ui.landscapePosterWidth
import com.nuvio.app.core.ui.rememberPosterCardStyleUiState

@Composable
private fun rememberHomeSkeletonBrush(): Brush {
    val shimmerColors = listOf(
        MaterialTheme.colorScheme.surface,
        MaterialTheme.colorScheme.surface.copy(alpha = 0.5f),
        MaterialTheme.colorScheme.surface,
    )
    val transition = rememberInfiniteTransition()
    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
    )
    val brush = Brush.linearGradient(
        colors = shimmerColors,
        start = Offset(translateAnim - 200f, 0f),
        end = Offset(translateAnim, 0f),
    )
    return brush
}

@Composable
fun HomeSkeletonHero(
    modifier: Modifier = Modifier,
    viewportHeight: Dp? = null,
    mobileBelowSectionHeightHint: Dp? = null,
    sectionPadding: Dp? = null,
) {
    val brush = rememberHomeSkeletonBrush()

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp)),
    ) {
        val layout = homeHeroLayout(
            maxWidthDp = maxWidth.value,
            viewportHeightDp = viewportHeight?.value,
            mobileBelowSectionHeightHintDp = mobileBelowSectionHeightHint?.value,
            preferDesktopLayout = isDesktop,
        )
        val containerWidth = maxWidth
        val contentHorizontalPadding = sectionPadding ?: layout.contentHorizontalPadding

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(layout.heroHeight)
                .background(brush),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.background.copy(alpha = 0.02f),
                                MaterialTheme.colorScheme.background.copy(alpha = 0.12f),
                                MaterialTheme.colorScheme.background.copy(alpha = 0.34f),
                                MaterialTheme.colorScheme.background.copy(alpha = 0.78f),
                            ),
                        ),
                    ),
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(layout.bottomFadeHeight)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.background.copy(alpha = 0f),
                                MaterialTheme.colorScheme.background,
                            ),
                        ),
                    ),
            )

            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(
                        horizontal = contentHorizontalPadding,
                        vertical = layout.contentVerticalPadding,
                    ),
                horizontalAlignment = if (layout.isTablet) Alignment.Start else Alignment.CenterHorizontally,
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth(layout.contentWidthFraction)
                        .widthIn(max = layout.contentMaxWidth),
                    horizontalAlignment = if (layout.isTablet) Alignment.Start else Alignment.CenterHorizontally,
                ) {
                    val logoWidth = containerWidth
                        .times(layout.contentWidthFraction * layout.logoWidthFraction)
                        .coerceAtMost(layout.contentMaxWidth * layout.logoWidthFraction)

                    SkeletonBlock(
                        brush = brush,
                        width = logoWidth,
                        height = logoWidth / 2.6f,
                        cornerRadius = 12.dp,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SkeletonBlock(brush = brush, width = 52.dp, height = 14.dp, cornerRadius = 999.dp)
                        SkeletonDot(brush = brush)
                        SkeletonBlock(brush = brush, width = 72.dp, height = 14.dp, cornerRadius = 999.dp)
                        SkeletonDot(brush = brush)
                        SkeletonBlock(brush = brush, width = 40.dp, height = 14.dp, cornerRadius = 999.dp)
                    }
                }
                if (!layout.isTablet) {
                    Spacer(modifier = Modifier.height(14.dp))
                    SkeletonBlock(
                        brush = brush,
                        width = 160.dp,
                        height = 48.dp,
                        cornerRadius = 40.dp,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                } else {
                    Spacer(modifier = Modifier.height(14.dp))
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SkeletonBlock(brush = brush, width = 32.dp, height = 8.dp, cornerRadius = 999.dp)
                    SkeletonBlock(brush = brush, width = 8.dp, height = 8.dp, cornerRadius = 999.dp)
                    SkeletonBlock(brush = brush, width = 8.dp, height = 8.dp, cornerRadius = 999.dp)
                    SkeletonBlock(brush = brush, width = 8.dp, height = 8.dp, cornerRadius = 999.dp)
                }
            }
        }
    }
}

@Composable
fun HomeSkeletonRow(
    modifier: Modifier = Modifier,
    showHeaderAccent: Boolean = true,
) {
    val brush = rememberHomeSkeletonBrush()
    val posterCardStyle = rememberPosterCardStyleUiState()
    val skeletonWidth = if (posterCardStyle.catalogLandscapeModeEnabled) {
        landscapePosterWidth(posterCardStyle.widthDp)
    } else {
        posterCardStyle.widthDp.dp
    }
    val skeletonHeight = if (posterCardStyle.catalogLandscapeModeEnabled) {
        landscapePosterHeightForWidth(skeletonWidth)
    } else {
        posterCardStyle.heightDp.dp
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Title placeholder
        Box(
            modifier = Modifier
                .width(140.dp)
                .height(18.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(brush),
        )
        if (showHeaderAccent) {
            // Accent bar
            Box(
                modifier = Modifier
                    .width(60.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(brush),
            )
            Spacer(modifier = Modifier.height(2.dp))
        }
        // Poster row
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            repeat(4) {
                Box(
                    modifier = Modifier
                        .width(skeletonWidth)
                        .height(skeletonHeight)
                        .clip(RoundedCornerShape(posterCardStyle.cornerRadiusDp.dp))
                        .background(brush),
                )
            }
        }
    }
}

@Composable
private fun SkeletonBlock(
    brush: Brush,
    width: Dp,
    height: Dp,
    cornerRadius: Dp,
) {
    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .clip(RoundedCornerShape(cornerRadius))
            .background(brush),
    )
}

@Composable
private fun SkeletonDot(brush: Brush) {
    Box(
        modifier = Modifier
            .size(4.dp)
            .clip(CircleShape)
            .background(brush),
    )
}
