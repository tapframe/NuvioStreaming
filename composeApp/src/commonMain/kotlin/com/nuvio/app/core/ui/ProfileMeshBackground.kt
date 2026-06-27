package com.nuvio.app.core.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

@Composable
fun ProfileMeshBackground(
    profileColor: Color,
    modifier: Modifier = Modifier,
) {
    val animatedProfileColor by animateColorAsState(
        targetValue = profileColor,
        animationSpec = tween(durationMillis = 520),
        label = "profileMeshBackgroundColor",
    )
    val baseColor = Color.Black
    val primaryMeshColor = lerp(baseColor, animatedProfileColor, 0.58f)
    val secondaryMeshColor = lerp(animatedProfileColor, MaterialTheme.colorScheme.secondary, 0.32f)
    val tertiaryMeshColor = lerp(animatedProfileColor, MaterialTheme.colorScheme.tertiary, 0.28f)

    Box(
        modifier = modifier
            .fillMaxSize()
            .drawBehind {
                val maxDimension = maxOf(size.width, size.height)

                drawRect(color = baseColor, size = size)
                drawRect(
                    brush = Brush.radialGradient(
                        colorStops = arrayOf(
                            0f to primaryMeshColor.copy(alpha = 0.46f),
                            0.38f to primaryMeshColor.copy(alpha = 0.2f),
                            0.72f to primaryMeshColor.copy(alpha = 0.05f),
                            1f to Color.Transparent,
                        ),
                        center = Offset(size.width * -0.08f, size.height * -0.02f),
                        radius = maxDimension * 0.7f,
                    ),
                    size = size,
                )
                drawRect(
                    brush = Brush.radialGradient(
                        colorStops = arrayOf(
                            0f to animatedProfileColor.copy(alpha = 0.24f),
                            0.44f to animatedProfileColor.copy(alpha = 0.09f),
                            0.78f to animatedProfileColor.copy(alpha = 0.02f),
                            1f to Color.Transparent,
                        ),
                        center = Offset(size.width * 0.16f, size.height * 0.18f),
                        radius = maxDimension * 0.46f,
                    ),
                    size = size,
                )
                drawRect(
                    brush = Brush.radialGradient(
                        colorStops = arrayOf(
                            0f to secondaryMeshColor.copy(alpha = 0.16f),
                            0.5f to secondaryMeshColor.copy(alpha = 0.05f),
                            1f to Color.Transparent,
                        ),
                        center = Offset(size.width * 0.9f, size.height * 0.12f),
                        radius = maxDimension * 0.36f,
                    ),
                    size = size,
                )
                drawRect(
                    brush = Brush.radialGradient(
                        colorStops = arrayOf(
                            0f to tertiaryMeshColor.copy(alpha = 0.08f),
                            0.52f to tertiaryMeshColor.copy(alpha = 0.03f),
                            1f to Color.Transparent,
                        ),
                        center = Offset(size.width * 0.28f, size.height * 0.4f),
                        radius = maxDimension * 0.28f,
                    ),
                    size = size,
                )
            },
    )
}
