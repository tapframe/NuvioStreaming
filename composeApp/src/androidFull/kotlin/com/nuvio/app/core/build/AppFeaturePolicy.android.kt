package com.nuvio.app.core.build

import com.nuvio.app.BuildConfig

actual object AppFeaturePolicy {
    actual val pluginsEnabled: Boolean = true
    actual val p2pEnabled: Boolean = true
    actual val trailerPlaybackMode: TrailerPlaybackMode = TrailerPlaybackMode.IN_APP
    actual val inAppUpdaterEnabled: Boolean = !BuildConfig.DEBUG
}