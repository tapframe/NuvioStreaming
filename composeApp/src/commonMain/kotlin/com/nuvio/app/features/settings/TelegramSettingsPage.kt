package com.nuvio.app.features.settings

import androidx.compose.runtime.Composable

@Composable
internal expect fun TelegramSettingsPage(
    isTablet: Boolean,
    onBack: () -> Unit,
)
