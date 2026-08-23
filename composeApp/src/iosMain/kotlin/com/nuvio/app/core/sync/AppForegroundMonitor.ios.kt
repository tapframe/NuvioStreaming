package com.nuvio.app.core.sync

import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import platform.Foundation.NSNotificationCenter
import platform.UIKit.UIApplication
import platform.UIKit.UIApplicationDidBecomeActiveNotification
import platform.UIKit.UIApplicationState
import platform.UIKit.UIApplicationWillResignActiveNotification

internal actual object AppForegroundMonitor {
    actual fun events(): Flow<AppVisibility> = callbackFlow {
        trySend(
            if (UIApplication.sharedApplication.applicationState == UIApplicationState.UIApplicationStateActive) {
                AppVisibility.Foreground
            } else {
                AppVisibility.Background
            },
        )
        val foregroundObserver = NSNotificationCenter.defaultCenter.addObserverForName(
            name = UIApplicationDidBecomeActiveNotification,
            `object` = null,
            queue = null,
        ) { _ ->
            trySend(AppVisibility.Foreground)
        }
        val backgroundObserver = NSNotificationCenter.defaultCenter.addObserverForName(
            name = UIApplicationWillResignActiveNotification,
            `object` = null,
            queue = null,
        ) { _ ->
            trySend(AppVisibility.Background)
        }

        awaitClose {
            NSNotificationCenter.defaultCenter.removeObserver(foregroundObserver)
            NSNotificationCenter.defaultCenter.removeObserver(backgroundObserver)
        }
    }.distinctUntilChanged()
}
