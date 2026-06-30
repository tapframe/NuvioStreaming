package com.nuvio.app.core.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal expect val nuvioPlatformExtraTopPadding: Dp
internal expect val nuvioPlatformExtraBottomPadding: Dp
internal expect val nuvioBottomNavigationExtraVerticalPadding: Dp
@Composable
internal expect fun nuvioBottomNavigationBarInsets(): WindowInsets

internal val LocalNuvioBottomNavigationOverlayPadding = staticCompositionLocalOf { 0.dp }

// Content height of NuvioNavigationBar's Row (icon + its own padding), excluding the
// hairline divider and any system inset padding, which are added on top of this.
private val NuvioNavigationBarContentHeight: Dp = NuvioTokens.Icon.xl + (NuvioTokens.Space.s10 * 2)

@Composable
internal fun nuvioSafeBottomPadding(extra: Dp = 0.dp): Dp {
    val navigationBarBottom = nuvioBottomNavigationBarInsets()
        .asPaddingValues()
        .calculateBottomPadding()
    return navigationBarBottom.coerceAtLeast(nuvioPlatformExtraBottomPadding) +
            LocalNuvioBottomNavigationOverlayPadding.current +
            extra
}

// Full rendered height of the standard (non-native-tabs) floating bottom NuvioNavigationBar,
// including the hairline divider, the row's own vertical padding, and the system navigation
// bar inset it draws underneath itself. Used by screens that render content behind the bar
// (edge-to-edge) and need to reserve real clearance above it, since that bar is not placed
// via Scaffold's innerPadding consumption in every layout path.
@Composable
internal fun nuvioStandardBottomNavigationBarHeight(): Dp {
    val systemInsetBottom = nuvioBottomNavigationBarInsets()
        .asPaddingValues()
        .calculateBottomPadding()
    return NuvioTokens.Border.hairline +
            NuvioNavigationBarContentHeight +
            (nuvioBottomNavigationExtraVerticalPadding * 2) +
            systemInsetBottom
}
