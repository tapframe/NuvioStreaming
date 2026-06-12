package com.nuvio.app.features.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.introdb_favicon
import nuvio.composeapp.generated.resources.mdblist_logo
import nuvio.composeapp.generated.resources.rating_tmdb
import nuvio.composeapp.generated.resources.trakt_tv_favicon
import org.jetbrains.compose.resources.painterResource

@Composable
internal actual fun integrationLogoPainter(logo: IntegrationLogo): Painter =
    painterResource(
        when (logo) {
            IntegrationLogo.Tmdb -> Res.drawable.rating_tmdb
            IntegrationLogo.Trakt -> Res.drawable.trakt_tv_favicon
            IntegrationLogo.MdbList -> Res.drawable.mdblist_logo
            IntegrationLogo.IntroDb -> Res.drawable.introdb_favicon
        },
    )
