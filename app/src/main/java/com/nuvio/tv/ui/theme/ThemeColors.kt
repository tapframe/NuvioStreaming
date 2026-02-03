package com.nuvio.tv.ui.theme

import androidx.compose.ui.graphics.Color
import com.nuvio.tv.domain.model.AppTheme

/**
 * Color palette for each theme.
 * Includes both accent colors and background tints for full theme customization.
 */
data class ThemeColorPalette(
    val secondary: Color,
    val secondaryVariant: Color,
    val focusRing: Color,
    val focusBackground: Color,
    // Background colors with subtle theme tinting
    val background: Color = Color(0xFF0D0D0D),
    val backgroundElevated: Color = Color(0xFF1A1A1A),
    val backgroundCard: Color = Color(0xFF242424)
)

object ThemeColors {

    val Crimson = ThemeColorPalette(
        secondary = Color(0xFFE53935),
        secondaryVariant = Color(0xFFC62828),
        focusRing = Color(0xFFFF5252),
        focusBackground = Color(0xFF3D1A1A),
        background = Color(0xFF0D0D0D),
        backgroundElevated = Color(0xFF1A1A1A),
        backgroundCard = Color(0xFF241A1A)  // Warm red tint
    )

    val Ocean = ThemeColorPalette(
        secondary = Color(0xFF1E88E5),
        secondaryVariant = Color(0xFF1565C0),
        focusRing = Color(0xFF42A5F5),
        focusBackground = Color(0xFF1A2D3D),
        background = Color(0xFF0D0D0F),      // Cool blue tint
        backgroundElevated = Color(0xFF1A1A1E),
        backgroundCard = Color(0xFF1A1F24)
    )

    val Violet = ThemeColorPalette(
        secondary = Color(0xFF8E24AA),
        secondaryVariant = Color(0xFF6A1B9A),
        focusRing = Color(0xFFAB47BC),
        focusBackground = Color(0xFF2D1A3D),
        background = Color(0xFF0D0D0F),      // Purple tint
        backgroundElevated = Color(0xFF1A1A1E),
        backgroundCard = Color(0xFF1F1A24)
    )

    val Emerald = ThemeColorPalette(
        secondary = Color(0xFF43A047),
        secondaryVariant = Color(0xFF2E7D32),
        focusRing = Color(0xFF66BB6A),
        focusBackground = Color(0xFF1A3D1E),
        background = Color(0xFF0D0D0D),
        backgroundElevated = Color(0xFF1A1A1A),
        backgroundCard = Color(0xFF1A241A)  // Green tint
    )

    val Amber = ThemeColorPalette(
        secondary = Color(0xFFFB8C00),
        secondaryVariant = Color(0xFFEF6C00),
        focusRing = Color(0xFFFFA726),
        focusBackground = Color(0xFF3D2D1A),
        background = Color(0xFF0F0D0D),      // Warm amber tint
        backgroundElevated = Color(0xFF1E1A1A),
        backgroundCard = Color(0xFF24201A)
    )

    val Rose = ThemeColorPalette(
        secondary = Color(0xFFD81B60),
        secondaryVariant = Color(0xFFC2185B),
        focusRing = Color(0xFFEC407A),
        focusBackground = Color(0xFF3D1A2D),
        background = Color(0xFF0D0D0D),
        backgroundElevated = Color(0xFF1A1A1A),
        backgroundCard = Color(0xFF241A1F)  // Pink tint
    )

    fun getColorPalette(theme: AppTheme): ThemeColorPalette {
        return when (theme) {
            AppTheme.CRIMSON -> Crimson
            AppTheme.OCEAN -> Ocean
            AppTheme.VIOLET -> Violet
            AppTheme.EMERALD -> Emerald
            AppTheme.AMBER -> Amber
            AppTheme.ROSE -> Rose
        }
    }
}
