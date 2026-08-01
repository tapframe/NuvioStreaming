package com.nuvio.app.features.simkl

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import com.nuvio.app.R

@Composable
actual fun simklBrandPainter(asset: SimklBrandAsset): Painter =
    painterResource(
        id = when (asset) {
            SimklBrandAsset.Glyph -> R.drawable.simkl_logo_glyph
            SimklBrandAsset.Wordmark -> R.drawable.simkl_logo_wordmark
        },
    )
