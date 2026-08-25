package com.nuvio.app.core.sync

import kotlinx.coroutines.flow.Flow

internal enum class AppVisibility {
    Foreground,
    Background,
}

internal expect object AppForegroundMonitor {
    fun events(): Flow<AppVisibility>
}
