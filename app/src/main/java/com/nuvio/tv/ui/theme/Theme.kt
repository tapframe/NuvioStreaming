package com.nuvio.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

data class NuvioExtendedColors(
    val backgroundElevated: Color,
    val backgroundCard: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val focusRing: Color,
    val focusBackground: Color,
    val rating: Color
)

val LocalNuvioColors = staticCompositionLocalOf {
    NuvioExtendedColors(
        backgroundElevated = NuvioColors.BackgroundElevated,
        backgroundCard = NuvioColors.BackgroundCard,
        textSecondary = NuvioColors.TextSecondary,
        textTertiary = NuvioColors.TextTertiary,
        focusRing = NuvioColors.FocusRing,
        focusBackground = NuvioColors.FocusBackground,
        rating = NuvioColors.Rating
    )
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun NuvioTheme(
    content: @Composable () -> Unit
) {
    val colorScheme = darkColorScheme(
        primary = NuvioColors.Primary,
        onPrimary = NuvioColors.OnPrimary,
        secondary = NuvioColors.Secondary,
        background = NuvioColors.Background,
        surface = NuvioColors.Surface,
        surfaceVariant = NuvioColors.SurfaceVariant,
        onBackground = NuvioColors.TextPrimary,
        onSurface = NuvioColors.TextPrimary,
        onSurfaceVariant = NuvioColors.TextSecondary,
        error = NuvioColors.Error
    )

    val extendedColors = NuvioExtendedColors(
        backgroundElevated = NuvioColors.BackgroundElevated,
        backgroundCard = NuvioColors.BackgroundCard,
        textSecondary = NuvioColors.TextSecondary,
        textTertiary = NuvioColors.TextTertiary,
        focusRing = NuvioColors.FocusRing,
        focusBackground = NuvioColors.FocusBackground,
        rating = NuvioColors.Rating
    )

    CompositionLocalProvider(LocalNuvioColors provides extendedColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = NuvioTypography,
            content = content
        )
    }
}

object NuvioTheme {
    val extendedColors: NuvioExtendedColors
        @Composable
        get() = LocalNuvioColors.current
}
