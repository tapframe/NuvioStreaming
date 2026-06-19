package com.nuvio.app.features.plugins

import android.content.Context
import android.content.SharedPreferences

internal object PluginStorage {
    private const val preferencesName = "nuvio_plugins"
    private const val pluginsStateKey = "plugins_state"

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
}

internal fun currentPluginPlatform(): String = "android"

internal fun currentEpochMillis(): Long = System.currentTimeMillis()
