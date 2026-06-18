package com.nuvio.app.core.ui

import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.theme_amber
import nuvio.composeapp.generated.resources.theme_crimson
import nuvio.composeapp.generated.resources.theme_emerald
import nuvio.composeapp.generated.resources.theme_ocean
import nuvio.composeapp.generated.resources.theme_rose
import nuvio.composeapp.generated.resources.theme_violet
import nuvio.composeapp.generated.resources.theme_white
// Importiamo i tre ID esatti che hai aggiunto nell'XML
import nuvio.composeapp.generated.resources.theme_neon
import nuvio.composeapp.generated.resources.theme_anthracite
import nuvio.composeapp.generated.resources.theme_pink
import org.jetbrains.compose.resources.StringResource

enum class AppTheme {
    CRIMSON,
    OCEAN,
    VIOLET,
    EMERALD,
    AMBER,
    ROSE,
    WHITE,
    NEON_YELLOW,
    ANTHRACITE_GREY,
    PASTEL_PINK
}

val AppTheme.labelRes: StringResource
    get() = when (this) {
        AppTheme.CRIMSON -> Res.string.theme_crimson
        AppTheme.OCEAN -> Res.string.theme_ocean
        AppTheme.VIOLET -> Res.string.theme_violet
        AppTheme.EMERALD -> Res.string.theme_emerald
        AppTheme.AMBER -> Res.string.theme_amber
        AppTheme.ROSE -> Res.string.theme_rose
        AppTheme.WHITE -> Res.string.theme_white
        AppTheme.NEON_YELLOW -> Res.string.theme_neon
        AppTheme.ANTHRACITE_GREY -> Res.string.theme_anthracite
        AppTheme.PASTEL_PINK -> Res.string.theme_pink
    }