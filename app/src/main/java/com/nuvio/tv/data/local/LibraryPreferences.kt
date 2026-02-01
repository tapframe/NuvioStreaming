package com.nuvio.tv.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import com.nuvio.tv.domain.model.SavedLibraryItem
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.libraryDataStore: DataStore<Preferences> by preferencesDataStore(name = "library_preferences")

@Singleton
class LibraryPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val gson = Gson()
    private val libraryItemsKey = stringSetPreferencesKey("library_items")

    val libraryItems: Flow<List<SavedLibraryItem>> = context.libraryDataStore.data
        .map { preferences ->
            val raw = preferences[libraryItemsKey] ?: emptySet()
            raw.mapNotNull { json ->
                runCatching { gson.fromJson(json, SavedLibraryItem::class.java) }.getOrNull()
            }
        }

    fun isInLibrary(itemId: String, itemType: String): Flow<Boolean> {
        return libraryItems.map { items ->
            items.any { it.id == itemId && it.type.equals(itemType, ignoreCase = true) }
        }
    }

    suspend fun addItem(item: SavedLibraryItem) {
        context.libraryDataStore.edit { preferences ->
            val current = preferences[libraryItemsKey] ?: emptySet()
            val filtered = current.filterNot { json ->
                runCatching {
                    gson.fromJson(json, SavedLibraryItem::class.java)
                }.getOrNull()?.let { saved ->
                    saved.id == item.id && saved.type.equals(item.type, ignoreCase = true)
                } ?: false
            }
            preferences[libraryItemsKey] = filtered.toSet() + gson.toJson(item)
        }
    }

    suspend fun removeItem(itemId: String, itemType: String) {
        context.libraryDataStore.edit { preferences ->
            val current = preferences[libraryItemsKey] ?: emptySet()
            val filtered = current.filterNot { json ->
                runCatching {
                    gson.fromJson(json, SavedLibraryItem::class.java)
                }.getOrNull()?.let { saved ->
                    saved.id == itemId && saved.type.equals(itemType, ignoreCase = true)
                } ?: false
            }
            preferences[libraryItemsKey] = filtered.toSet()
        }
    }
}
