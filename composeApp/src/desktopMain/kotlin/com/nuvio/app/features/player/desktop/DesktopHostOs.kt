package com.nuvio.app.features.player.desktop

import java.util.Locale

internal enum class DesktopHostOs {
    MACOS,
    WINDOWS,
    LINUX,
    UNKNOWN;

    companion object {
        val current: DesktopHostOs by lazy {
            val osName = System.getProperty("os.name").orEmpty().lowercase(Locale.ROOT)
            when {
                osName.contains("mac") -> MACOS
                osName.contains("win") -> WINDOWS
                osName.contains("linux") -> LINUX
                else -> UNKNOWN
            }
        }
    }
}
