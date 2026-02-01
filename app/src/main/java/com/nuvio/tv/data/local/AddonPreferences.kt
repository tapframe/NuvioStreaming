package com.nuvio.tv.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "addon_preferences")

@Singleton
class AddonPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val addonUrlsKey = stringSetPreferencesKey("installed_addon_urls")

    val installedAddonUrls: Flow<Set<String>> = context.dataStore.data
        .map { preferences ->
            preferences[addonUrlsKey] ?: getDefaultAddons()
        }

    suspend fun addAddon(url: String) {
        context.dataStore.edit { preferences ->
            val currentUrls = preferences[addonUrlsKey] ?: getDefaultAddons()
            preferences[addonUrlsKey] = currentUrls + url
        }
    }

    suspend fun removeAddon(url: String) {
        context.dataStore.edit { preferences ->
            val currentUrls = preferences[addonUrlsKey] ?: emptySet()
            preferences[addonUrlsKey] = currentUrls - url
        }
    }

    private fun getDefaultAddons(): Set<String> = setOf(
        "https://v3-cinemeta.strem.io"
    )
}
