package com.nuvio.app.features.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter

internal enum class IntegrationLogo {
    Tmdb,
    Trakt,
    MdbList,
    IntroDb,
}

@Composable
internal expect fun integrationLogoPainter(logo: IntegrationLogo): Painter
