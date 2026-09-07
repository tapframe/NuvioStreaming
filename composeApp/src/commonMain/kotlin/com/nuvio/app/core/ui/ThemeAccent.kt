package com.nuvio.app.core.ui

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.Modifier

fun ThemeColorPalette.accentBrush(): Brush =
    if (accentGradient.size >= 2) Brush.linearGradient(accentGradient)
    else SolidColor(accentGradient.firstOrNull() ?: secondary)

fun Modifier.gradientMask(brush: Brush): Modifier =
    graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
        .drawWithCache {
            onDrawWithContent {
                drawContent()
                drawRect(brush = brush, blendMode = BlendMode.SrcIn)
            }
        }
