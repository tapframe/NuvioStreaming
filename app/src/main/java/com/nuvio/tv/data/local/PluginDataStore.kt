package com.nuvio.tv.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.nuvio.tv.domain.model.PluginRepository
import com.nuvio.tv.domain.model.ScraperInfo
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

private val Context.pluginDataStore: DataStore<Preferences> by preferencesDataStore(name = "plugin_settings")

@Singleton
class PluginDataStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val moshi: Moshi
) {
    private val dataStore = context.pluginDataStore
    
    private val repositoriesKey = stringPreferencesKey("repositories")
    private val scrapersKey = stringPreferencesKey("scrapers")
    private val pluginsEnabledKey = booleanPreferencesKey("plugins_enabled")
    private val scraperSettingsKey = stringPreferencesKey("scraper_settings")
    
    private val repoListType = Types.newParameterizedType(List::class.java, PluginRepository::class.java)
    private val scraperListType = Types.newParameterizedType(List::class.java, ScraperInfo::class.java)
    private val settingsMapType = Types.newParameterizedType(
        Map::class.java, 
        String::class.java, 
        Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java)
    )
    
    // Plugin code directory
    private val codeDir: File
        get() = File(context.filesDir, "plugin_code").also { it.mkdirs() }
    
    // Repositories
    val repositories: Flow<List<PluginRepository>> = dataStore.data.map { prefs ->
        prefs[repositoriesKey]?.let { json ->
            try {
                moshi.adapter<List<PluginRepository>>(repoListType).fromJson(json) ?: emptyList()
            } catch (e: Exception) {
                emptyList()
            }
        } ?: emptyList()
    }
    
    suspend fun saveRepositories(repos: List<PluginRepository>) {
        val json = moshi.adapter<List<PluginRepository>>(repoListType).toJson(repos)
        dataStore.edit { prefs ->
            prefs[repositoriesKey] = json
        }
    }
    
    suspend fun addRepository(repo: PluginRepository) {
        val current = repositories.first().toMutableList()
        current.removeAll { it.id == repo.id }
        current.add(repo)
        saveRepositories(current)
    }
    
    suspend fun removeRepository(repoId: String) {
        val current = repositories.first().toMutableList()
        current.removeAll { it.id == repoId }
        saveRepositories(current)
    }
    
    suspend fun updateRepository(repo: PluginRepository) {
        val current = repositories.first().toMutableList()
        val index = current.indexOfFirst { it.id == repo.id }
        if (index >= 0) {
            current[index] = repo
            saveRepositories(current)
        }
    }
    
    // Scrapers
    val scrapers: Flow<List<ScraperInfo>> = dataStore.data.map { prefs ->
        prefs[scrapersKey]?.let { json ->
            try {
                moshi.adapter<List<ScraperInfo>>(scraperListType).fromJson(json) ?: emptyList()
            } catch (e: Exception) {
                emptyList()
            }
        } ?: emptyList()
    }
    
    suspend fun saveScrapers(scrapers: List<ScraperInfo>) {
        val json = moshi.adapter<List<ScraperInfo>>(scraperListType).toJson(scrapers)
        dataStore.edit { prefs ->
            prefs[scrapersKey] = json
        }
    }
    
    suspend fun setScraperEnabled(scraperId: String, enabled: Boolean) {
        val current = scrapers.first().toMutableList()
        val index = current.indexOfFirst { it.id == scraperId }
        if (index >= 0) {
            val scraper = current[index]
            // Only enable if manifest allows
            if (enabled && !scraper.manifestEnabled) return
            current[index] = scraper.copy(enabled = enabled)
            saveScrapers(current)
        }
    }
    
    // Plugins enabled global toggle
    val pluginsEnabled: Flow<Boolean> = dataStore.data.map { prefs ->
        prefs[pluginsEnabledKey] ?: true
    }
    
    suspend fun setPluginsEnabled(enabled: Boolean) {
        dataStore.edit { prefs ->
            prefs[pluginsEnabledKey] = enabled
        }
    }
    
    // Scraper code storage
    fun getScraperCodeFile(scraperId: String): File {
        return File(codeDir, "$scraperId.js")
    }
    
    fun saveScraperCode(scraperId: String, code: String) {
        getScraperCodeFile(scraperId).writeText(code)
    }
    
    fun getScraperCode(scraperId: String): String? {
        val file = getScraperCodeFile(scraperId)
        return if (file.exists()) file.readText() else null
    }
    
    fun deleteScraperCode(scraperId: String) {
        getScraperCodeFile(scraperId).delete()
    }
    
    fun clearAllScraperCode() {
        codeDir.listFiles()?.forEach { it.delete() }
    }
    
    // Per-scraper settings
    suspend fun getScraperSettings(scraperId: String): Map<String, Any> {
        val prefs = dataStore.data.first()
        val allSettings = prefs[scraperSettingsKey]?.let { json ->
            try {
                @Suppress("UNCHECKED_CAST")
                moshi.adapter<Map<String, Map<String, Any>>>(settingsMapType).fromJson(json) ?: emptyMap()
            } catch (e: Exception) {
                emptyMap()
            }
        } ?: emptyMap()
        
        @Suppress("UNCHECKED_CAST")
        return allSettings[scraperId] as? Map<String, Any> ?: emptyMap()
    }
    
    suspend fun setScraperSettings(scraperId: String, settings: Map<String, Any>) {
        val prefs = dataStore.data.first()
        val allSettings = prefs[scraperSettingsKey]?.let { json ->
            try {
                @Suppress("UNCHECKED_CAST")
                moshi.adapter<Map<String, Map<String, Any>>>(settingsMapType).fromJson(json)?.toMutableMap() 
                    ?: mutableMapOf()
            } catch (e: Exception) {
                mutableMapOf()
            }
        } ?: mutableMapOf()
        
        allSettings[scraperId] = settings
        
        val json = moshi.adapter<Map<String, Map<String, Any>>>(settingsMapType).toJson(allSettings)
        dataStore.edit { p ->
            p[scraperSettingsKey] = json
        }
    }
}
