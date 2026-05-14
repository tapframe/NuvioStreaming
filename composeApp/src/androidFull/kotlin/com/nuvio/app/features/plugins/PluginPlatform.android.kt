package com.nuvio.app.features.plugins

import android.content.Context
import android.content.SharedPreferences
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal object PluginStorage {
    private const val preferencesName = "nuvio_plugins"
    private const val pluginsStateKey = "plugins_state"
    private const val pluginConfigKey = "plugin_config"

    private val json = Json { ignoreUnknownKeys = true }
    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    fun loadState(profileId: Int): String? =
        preferences?.getString("${pluginsStateKey}_$profileId", null)

    fun saveState(profileId: Int, payload: String) {
        preferences
            ?.edit()
            ?.putString("${pluginsStateKey}_$profileId", payload)
            ?.apply()
    }

    fun loadConfig(manifestUrl: String): Map<String, String> {
        val key = "${pluginConfigKey}_${manifestUrl.hashCode()}"
        val raw = preferences?.getString(key, null)?.trim().orEmpty()
        if (raw.isBlank()) return emptyMap()
        return runCatching {
            json.decodeFromString<Map<String, String>>(raw)
        }.getOrDefault(emptyMap())
    }

    fun saveConfig(manifestUrl: String, values: Map<String, String>) {
        val key = "${pluginConfigKey}_${manifestUrl.hashCode()}"
        preferences
            ?.edit()
            ?.putString(key, json.encodeToString(values))
            ?.apply()
    }
}

internal fun currentPluginPlatform(): String = "android"

internal fun currentEpochMillis(): Long = System.currentTimeMillis()