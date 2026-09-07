package com.nuvio.app.core.sync

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

internal actual object AppForegroundMonitor {
    actual fun events(): Flow<AppVisibility> = callbackFlow {
        val lifecycle = ProcessLifecycleOwner.get().lifecycle
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> trySend(AppVisibility.Foreground)
                Lifecycle.Event.ON_STOP -> trySend(AppVisibility.Background)
                else -> Unit
            }
        }
        trySend(
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                AppVisibility.Foreground
            } else {
                AppVisibility.Background
            },
        )
        lifecycle.addObserver(observer)
        awaitClose {
            lifecycle.removeObserver(observer)
        }
    }.distinctUntilChanged()
}
