package com.nuvio.app.core.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal actual val nuvioPlatformExtraTopPadding: Dp = 0.dp
internal actual val nuvioPlatformExtraBottomPadding: Dp = 0.dp
internal actual val nuvioBottomNavigationExtraVerticalPadding: Dp = 0.dp

@Composable
internal actual fun nuvioBottomNavigationBarInsets(): WindowInsets =
	WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)
