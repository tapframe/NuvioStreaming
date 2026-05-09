package com.nuvio.app.features.collection

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class CollectionMobileSettingsUiState(
    val folderGifOverrides: Map<String, Boolean> = emptyMap(),
)

object CollectionMobileSettingsRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(CollectionMobileSettingsUiState())
    val uiState: StateFlow<CollectionMobileSettingsUiState> = _uiState.asStateFlow()

    private var hasLoaded = false

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
        CollectionRepository.onMobileSettingsChanged()
    }

    fun clearLocalState() {
        hasLoaded = false
        _uiState.value = CollectionMobileSettingsUiState()
    }

    fun isFolderGifEnabled(collectionId: String, folderId: String): Boolean {
        ensureLoaded()
        return _uiState.value.folderGifOverrides[folderKey(collectionId, folderId)] ?: true
    }

    fun applyToCollections(collections: List<Collection>): List<Collection> {
        ensureLoaded()
        return collections.map(::applyToCollection)
    }

    fun applyToCollection(collection: Collection): Collection {
        ensureLoaded()
        return collection.copy(
            folders = collection.folders.map { folder ->
                folder.copy(
                    mobileFocusGifEnabled = isFolderGifEnabled(
                        collectionId = collection.id,
                        folderId = folder.id,
                    ),
                )
            },
        )
    }

    fun replaceCollectionFolderGifSettings(collectionId: String, folders: List<CollectionFolder>) {
        ensureLoaded()
        val collectionPrefix = "${collectionId.trim()}$FolderKeySeparator"
        val next = _uiState.value.folderGifOverrides
            .filterKeys { key -> !key.startsWith(collectionPrefix) }
            .toMutableMap()
        folders.forEach { folder ->
            val key = folderKey(collectionId, folder.id)
            if (folder.mobileFocusGifEnabled) {
                next.remove(key)
            } else {
                next[key] = false
            }
        }
        _uiState.value = CollectionMobileSettingsUiState(folderGifOverrides = next)
        persist()
        CollectionRepository.onMobileSettingsChanged()
    }

    private fun loadFromDisk() {
        hasLoaded = true

        val payload = CollectionMobileSettingsStorage.loadPayload().orEmpty().trim()
        if (payload.isEmpty()) {
            _uiState.value = CollectionMobileSettingsUiState()
            return
        }

        val stored = runCatching {
            json.decodeFromString<StoredCollectionMobileSettingsPayload>(payload)
        }.getOrNull()

        _uiState.value = CollectionMobileSettingsUiState(
            folderGifOverrides = stored
                ?.folderGifOverrides
                .orEmpty()
                .mapNotNull { item ->
                    if (item.collectionId.isBlank() || item.folderId.isBlank()) {
                        null
                    } else {
                        folderKey(item.collectionId, item.folderId) to item.enabled
                    }
                }
                .toMap(),
        )
    }

    private fun persist() {
        if (_uiState.value.folderGifOverrides.isEmpty()) {
            CollectionMobileSettingsStorage.savePayload("")
            return
        }
        val payload = StoredCollectionMobileSettingsPayload(
            folderGifOverrides = _uiState.value.folderGifOverrides
                .mapNotNull { (key, enabled) ->
                    val parts = key.split(FolderKeySeparator, limit = 2)
                    val collectionId = parts.getOrNull(0).orEmpty()
                    val folderId = parts.getOrNull(1).orEmpty()
                    if (collectionId.isBlank() || folderId.isBlank()) {
                        null
                    } else {
                        StoredFolderGifOverride(
                            collectionId = collectionId,
                            folderId = folderId,
                            enabled = enabled,
                        )
                    }
                }
                .sortedWith(compareBy<StoredFolderGifOverride> { it.collectionId }.thenBy { it.folderId }),
        )
        CollectionMobileSettingsStorage.savePayload(json.encodeToString(payload))
    }

    private fun folderKey(collectionId: String, folderId: String): String =
        "${collectionId.trim()}$FolderKeySeparator${folderId.trim()}"
}

private const val FolderKeySeparator = "\u001F"

@Serializable
private data class StoredCollectionMobileSettingsPayload(
    @SerialName("folder_gif_overrides") val folderGifOverrides: List<StoredFolderGifOverride> = emptyList(),
)

@Serializable
private data class StoredFolderGifOverride(
    @SerialName("collection_id") val collectionId: String,
    @SerialName("folder_id") val folderId: String,
    val enabled: Boolean = true,
)
