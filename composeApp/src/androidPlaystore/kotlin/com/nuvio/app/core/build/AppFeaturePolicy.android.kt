package com.nuvio.app.core.build

actual object AppFeaturePolicy {
    actual val pluginsEnabled: Boolean = false
    actual val supportersContributorsPageEnabled: Boolean = true
    actual val accountDeletionEnabled: Boolean = false
    actual val personalMediaAddonCopyEnabled: Boolean = false
    actual val p2pEnabled: Boolean = true
    actual val trailerPlaybackMode: TrailerPlaybackMode = TrailerPlaybackMode.EXTERNAL
    actual val heroTrailerPlaybackSupported: Boolean = false
    actual val inAppUpdaterEnabled: Boolean = false
    actual val imdbRatingLogoEnabled: Boolean = false
    actual val debugBackendSwitcherEnabled: Boolean = AppBuildConfig.IS_DEBUG_BUILD
}
