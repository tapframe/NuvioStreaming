package com.nuvio.app.features.plugins

import com.nuvio.app.core.storage.DesktopStorage
import java.util.Locale

internal object PluginStorage {
    private const val pluginsStateKey = "plugins_state"
    private val store = DesktopStorage.store("nuvio_plugins")

    fun loadState(profileId: Int): String? =
        store.getString("${pluginsStateKey}_$profileId")

    fun saveState(profileId: Int, payload: String) {
        store.putString("${pluginsStateKey}_$profileId", payload)
    }
}

internal fun currentPluginPlatform(): String = "desktop"

internal fun currentPluginPlatformTags(): Set<String> {
    val osName = System.getProperty("os.name").orEmpty().lowercase(Locale.ROOT)
    val osTag = when {
        osName.contains("mac") || osName.contains("darwin") -> "macos"
        osName.contains("win") -> "windows"
        osName.contains("linux") -> "linux"
        else -> null
    }
    return buildSet {
        add(currentPluginPlatform())
        add("jvm")
        osTag?.let(::add)
    }
}

internal fun currentEpochMillis(): Long = System.currentTimeMillis()
