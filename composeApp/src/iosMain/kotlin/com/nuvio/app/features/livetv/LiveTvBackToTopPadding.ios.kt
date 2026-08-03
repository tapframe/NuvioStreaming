package com.nuvio.app.features.livetv

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// The native iOS Liquid Glass tab bar is layered above Compose, so the floating
// Live TV action has to be kept above that native hit-test area.
internal actual val liveTvBackToTopBottomPadding: Dp = 24.dp
