package com.nuvio.app.navigation

import androidx.compose.runtime.staticCompositionLocalOf

/** True when SwiftUI owns the current iOS tab and navigation stack. */
val LocalUseNativeNavigation = staticCompositionLocalOf { false }

/** True for immersive routes that intentionally keep their Compose-owned exit controls. */
val LocalNativeNavigationBarHidden = staticCompositionLocalOf { false }
