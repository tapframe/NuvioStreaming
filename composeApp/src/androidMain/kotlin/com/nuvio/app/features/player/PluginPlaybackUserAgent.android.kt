package com.nuvio.app.features.player

import android.os.Build

actual fun defaultPluginPlaybackUserAgent(): String {
    val androidVersion = Build.VERSION.RELEASE ?: "13"
    val deviceModel = Build.MODEL?.takeIf { it.isNotBlank() } ?: "Android"

    return "Mozilla/5.0 (Linux; Android $androidVersion; $deviceModel) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Mobile Safari/537.36"
}
