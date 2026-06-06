package com.nuvio.app.features.player

import platform.UIKit.UIDevice

actual fun defaultPluginPlaybackUserAgent(): String {
    val device = UIDevice.currentDevice
    val model = device.model
    val systemVersion = device.systemVersion
    val systemVersionForUa = systemVersion.replace(".", "_")

    val platformToken = when {
        model.contains("iPad", ignoreCase = true) ->
            "iPad; CPU OS $systemVersionForUa like Mac OS X"

        model.contains("iPhone", ignoreCase = true) ->
            "iPhone; CPU iPhone OS $systemVersionForUa like Mac OS X"

        else ->
            "iPhone; CPU iPhone OS $systemVersionForUa like Mac OS X"
    }

    return "Mozilla/5.0 ($platformToken) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
        "Version/$systemVersion Mobile/15E148 Safari/604.1"
}

