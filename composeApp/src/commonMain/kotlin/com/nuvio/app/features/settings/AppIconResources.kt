package com.nuvio.app.features.settings

import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.StringResource

internal val AppIconOption.labelResource: StringResource
    get() = when (this) {
        AppIconOption.ORIGINAL -> Res.string.settings_appearance_app_icon_original
        AppIconOption.ARCTIC_BLUE -> Res.string.settings_appearance_app_icon_arctic_blue
        AppIconOption.EMERALD -> Res.string.settings_appearance_app_icon_emerald
        AppIconOption.ROSE_GOLD -> Res.string.settings_appearance_app_icon_rose_gold
        AppIconOption.COPPER -> Res.string.settings_appearance_app_icon_copper
        AppIconOption.GRAPHITE -> Res.string.settings_appearance_app_icon_graphite
    }

internal val AppIconOption.previewResource: DrawableResource
    get() = when (this) {
        AppIconOption.ORIGINAL -> Res.drawable.app_icon_original
        AppIconOption.ARCTIC_BLUE -> Res.drawable.app_icon_arctic_blue
        AppIconOption.EMERALD -> Res.drawable.app_icon_emerald
        AppIconOption.ROSE_GOLD -> Res.drawable.app_icon_rose_gold
        AppIconOption.COPPER -> Res.drawable.app_icon_copper
        AppIconOption.GRAPHITE -> Res.drawable.app_icon_graphite
    }

internal val AppIconOption.wordmarkResource: DrawableResource
    get() = when (this) {
        AppIconOption.ORIGINAL -> Res.drawable.app_logo_wordmark_original
        AppIconOption.ARCTIC_BLUE -> Res.drawable.app_logo_wordmark_arctic_blue
        AppIconOption.EMERALD -> Res.drawable.app_logo_wordmark_emerald
        AppIconOption.ROSE_GOLD -> Res.drawable.app_logo_wordmark_rose_gold
        AppIconOption.COPPER -> Res.drawable.app_logo_wordmark_copper
        AppIconOption.GRAPHITE -> Res.drawable.app_logo_wordmark_graphite
    }
