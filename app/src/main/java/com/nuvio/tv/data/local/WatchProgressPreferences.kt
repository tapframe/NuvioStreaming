package com.nuvio.tv.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.nuvio.tv.domain.model.WatchProgress
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.watchProgressDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "watch_progress_preferences"
)

@Singleton
class WatchProgressPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val gson = Gson()
    private val watchProgressKey = stringPreferencesKey("watch_progress_map")

    // Maximum items to keep in continue watching
    private val maxItems = 50

    /**
     * Get all watch progress items, sorted by last watched (most recent first)
     * For series, only returns the series-level entry (not individual episode entries)
     * to avoid duplicates in continue watching.
     */
    val allProgress: Flow<List<WatchProgress>> = context.watchProgressDataStore.data
        .map { preferences ->
            val json = preferences[watchProgressKey] ?: "{}"
            val allItems = parseProgressMap(json)
            
            // Filter to keep only series-level entries (key = contentId) or movie entries
            // This avoids duplicate entries where both episode-specific and series-level exist
            allItems.entries
                .filter { (key, progress) ->
                    // Keep movies (no season/episode) OR series-level entries (key matches contentId exactly)
                    progress.contentType == "movie" || key == progress.contentId
                }
                .map { it.value }
                .sortedByDescending { it.lastWatched }
                .toList()
        }

    /**
     * Get items that are in progress (not completed)
     */
    val continueWatching: Flow<List<WatchProgress>> = allProgress.map { list ->
        list.filter { it.isInProgress() }
    }

    /**
     * Get watch progress for a specific content item
     */
    fun getProgress(contentId: String): Flow<WatchProgress?> {
        return context.watchProgressDataStore.data.map { preferences ->
            val json = preferences[watchProgressKey] ?: "{}"
            val map = parseProgressMap(json)
            map[contentId]
        }
    }

    /**
     * Get watch progress for a specific episode
     */
    fun getEpisodeProgress(contentId: String, season: Int, episode: Int): Flow<WatchProgress?> {
        return context.watchProgressDataStore.data.map { preferences ->
            val json = preferences[watchProgressKey] ?: "{}"
            val map = parseProgressMap(json)
            map.values.find { 
                it.contentId == contentId && it.season == season && it.episode == episode 
            }
        }
    }

    /**
     * Get all episode progress for a series
     */
    fun getAllEpisodeProgress(contentId: String): Flow<Map<Pair<Int, Int>, WatchProgress>> {
        return context.watchProgressDataStore.data.map { preferences ->
            val json = preferences[watchProgressKey] ?: "{}"
            val map = parseProgressMap(json)
            map.values
                .filter { it.contentId == contentId && it.season != null && it.episode != null }
                .associateBy { (it.season!! to it.episode!!) }
        }
    }

    /**
     * Save or update watch progress
     */
    suspend fun saveProgress(progress: WatchProgress) {
        context.watchProgressDataStore.edit { preferences ->
            val json = preferences[watchProgressKey] ?: "{}"
            val map = parseProgressMap(json).toMutableMap()
            
            // Use a composite key for series episodes to track each episode separately
            val key = createKey(progress)
            map[key] = progress

            // Also update the series-level entry to track the latest episode
            if (progress.contentType == "series" && progress.season != null && progress.episode != null) {
                val seriesKey = progress.contentId
                val existingSeriesProgress = map[seriesKey]
                
                // Update series-level progress if this is a more recent watch
                if (existingSeriesProgress == null || progress.lastWatched > existingSeriesProgress.lastWatched) {
                    map[seriesKey] = progress.copy(videoId = progress.videoId)
                }
            }

            // Prune old items if exceeds max
            val pruned = pruneOldItems(map)
            preferences[watchProgressKey] = gson.toJson(pruned)
        }
    }

    /**
     * Remove watch progress for a specific item
     */
    suspend fun removeProgress(contentId: String, season: Int? = null, episode: Int? = null) {
        context.watchProgressDataStore.edit { preferences ->
            val json = preferences[watchProgressKey] ?: "{}"
            val map = parseProgressMap(json).toMutableMap()
            
            if (season != null && episode != null) {
                // Remove specific episode progress
                val key = "${contentId}_s${season}e${episode}"
                map.remove(key)
            } else {
                // Remove all progress for this content
                val keysToRemove = map.keys.filter { it.startsWith(contentId) }
                keysToRemove.forEach { map.remove(it) }
            }
            
            preferences[watchProgressKey] = gson.toJson(map)
        }
    }

    /**
     * Mark content as completed
     */
    suspend fun markAsCompleted(progress: WatchProgress) {
        val completedProgress = progress.copy(
            position = progress.duration,
            lastWatched = System.currentTimeMillis()
        )
        saveProgress(completedProgress)
    }

    /**
     * Clear all watch progress
     */
    suspend fun clearAll() {
        context.watchProgressDataStore.edit { preferences ->
            preferences.remove(watchProgressKey)
        }
    }

    private fun createKey(progress: WatchProgress): String {
        return if (progress.season != null && progress.episode != null) {
            "${progress.contentId}_s${progress.season}e${progress.episode}"
        } else {
            progress.contentId
        }
    }

    private fun parseProgressMap(json: String): Map<String, WatchProgress> {
        return try {
            val type = object : TypeToken<Map<String, WatchProgress>>() {}.type
            gson.fromJson(json, type) ?: emptyMap()
        } catch (e: Exception) {
            emptyMap()
        }
    }

    private fun pruneOldItems(map: MutableMap<String, WatchProgress>): Map<String, WatchProgress> {
        if (map.size <= maxItems) return map
        
        // Keep the most recently watched items
        return map.entries
            .sortedByDescending { it.value.lastWatched }
            .take(maxItems)
            .associate { it.key to it.value }
    }
}
