package com.nuvio.app.features.simkl

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter

enum class SimklBrandAsset {
    Glyph,
    Wordmark,
}

@Composable
expect fun simklBrandPainter(asset: SimklBrandAsset): Painter
