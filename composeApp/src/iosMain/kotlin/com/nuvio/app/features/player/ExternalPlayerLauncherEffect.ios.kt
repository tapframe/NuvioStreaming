package com.nuvio.app.features.player

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import platform.Foundation.NSURL
import platform.UIKit.UIApplication

@Composable
actual fun rememberExternalPlayerLauncher(
    onResult: (ExternalPlaybackResult?) -> Unit,
): (ExternalPlayerIntentResult.Success) -> Boolean {
    return remember {
        { intentResult: ExternalPlayerIntentResult.Success ->
            val url = intentResult.intent
            if (url is NSURL) {
                UIApplication.sharedApplication.openURL(
                    url = url,
                    options = emptyMap<Any?, Any>(),
                    completionHandler = null,
                )
                // iOS doesn't return playback results from external players
                true
            } else {
                false
            }
        }
    }
}
