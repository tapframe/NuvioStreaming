package com.nuvio.app.core.sync

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

internal actual object AppForegroundMonitor {
    actual fun events(): Flow<Unit> = emptyFlow()
}
