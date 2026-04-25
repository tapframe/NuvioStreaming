package com.nuvio.app.features.collection

import co.touchlab.kermit.Logger
import com.nuvio.app.features.home.PosterShape
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

data class CollectionEditorUiState(
    val isNew: Boolean = true,
    val collectionId: String = "",
    val title: String = "",
    val backdropImageUrl: String = "",
    val pinToTop: Boolean = false,
    val viewMode: FolderViewMode = FolderViewMode.TABBED_GRID,
    val showAllTab: Boolean = true,
    val folders: List<CollectionFolder> = emptyList(),
    val isLoading: Boolean = true,
    val availableCatalogs: List<AvailableCatalog> = emptyList(),
    val editingFolder: CollectionFolder? = null,
    val showFolderEditor: Boolean = false,
    val showCatalogPicker: Boolean = false,
    val genrePickerSourceIndex: Int? = null,
)

object CollectionEditorRepository {
    private val log = Logger.withTag("CollectionEditorRepository")

    private val _uiState = MutableStateFlow(CollectionEditorUiState())
    val uiState: StateFlow<CollectionEditorUiState> = _uiState.asStateFlow()

    @OptIn(ExperimentalUuidApi::class)
    fun initialize(collectionId: String?) {
        val catalogs = CollectionRepository.getAvailableCatalogs()

        if (collectionId != null) {
            val existing = CollectionRepository.getCollection(collectionId)
            if (existing != null) {
                _uiState.value = CollectionEditorUiState(
                    isNew = false,
                    collectionId = existing.id,
                    title = existing.title,
                    backdropImageUrl = existing.backdropImageUrl.orEmpty(),
                    pinToTop = existing.pinToTop,
                    viewMode = existing.folderViewMode,
                    showAllTab = existing.showAllTab,
                    folders = existing.folders,
                    isLoading = false,
                    availableCatalogs = catalogs,
                )
                return
            }
        }

        _uiState.value = CollectionEditorUiState(
            isNew = true,
            collectionId = Uuid.random().toString(),
            title = "",
            backdropImageUrl = "",
            pinToTop = false,
            viewMode = FolderViewMode.TABBED_GRID,
            showAllTab = true,
            folders = emptyList(),
            isLoading = false,
            availableCatalogs = catalogs,
        )
    }

    fun clear() {
        _uiState.value = CollectionEditorUiState()
    }

    fun setTitle(title: String) {
        _uiState.value = _uiState.value.copy(title = title)
    }

    fun setBackdropImageUrl(url: String) {
        _uiState.value = _uiState.value.copy(backdropImageUrl = url)
    }

    fun setPinToTop(pinToTop: Boolean) {
        _uiState.value = _uiState.value.copy(pinToTop = pinToTop)
    }

    fun setViewMode(viewMode: FolderViewMode) {
        _uiState.value = _uiState.value.copy(viewMode = viewMode)
    }

    fun setShowAllTab(show: Boolean) {
        _uiState.value = _uiState.value.copy(showAllTab = show)
    }

    @OptIn(ExperimentalUuidApi::class)
    fun addFolder(defaultTitle: String) {
        val newFolder = CollectionFolder(
            id = Uuid.random().toString(),
            title = defaultTitle,
        )
        _uiState.value = _uiState.value.copy(
            editingFolder = newFolder,
            showFolderEditor = true,
        )
    }

    fun editFolder(folderId: String) {
        val folder = _uiState.value.folders.find { it.id == folderId } ?: return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder,
            showFolderEditor = true,
        )
    }

    fun removeFolder(folderId: String) {
        _uiState.value = _uiState.value.copy(
            folders = _uiState.value.folders.filter { it.id != folderId },
        )
    }

    fun moveFolderUp(index: Int) {
        moveFolderByIndex(index, index - 1)
    }

    fun moveFolderDown(index: Int) {
        moveFolderByIndex(index, index + 1)
    }

    fun moveFolderByIndex(fromIndex: Int, toIndex: Int) {
        if (fromIndex == toIndex) return
        val list = _uiState.value.folders.toMutableList()
        if (fromIndex !in list.indices || toIndex !in list.indices) return
        val item = list.removeAt(fromIndex)
        list.add(toIndex, item)
        _uiState.value = _uiState.value.copy(folders = list)
    }

    fun updateFolderTitle(title: String) {
        val folder = _uiState.value.editingFolder ?: return
        _uiState.value = _uiState.value.copy(editingFolder = folder.copy(title = title))
    }

    fun updateFolderCoverImage(url: String) {
        val folder = _uiState.value.editingFolder ?: return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(coverImageUrl = url, coverEmoji = null),
        )
    }

    fun updateFolderFocusGifUrl(url: String) {
        val folder = _uiState.value.editingFolder ?: return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(focusGifUrl = url.ifBlank { null }),
        )
    }

    fun updateFolderFocusGifEnabled(enabled: Boolean) {
        val folder = _uiState.value.editingFolder ?: return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(focusGifEnabled = enabled),
        )
    }

    fun updateFolderCoverEmoji(emoji: String) {
        val folder = _uiState.value.editingFolder ?: return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(coverEmoji = emoji, coverImageUrl = null),
        )
    }

    fun clearFolderCover() {
        val folder = _uiState.value.editingFolder ?: return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(coverImageUrl = null, coverEmoji = null),
        )
    }

    fun updateFolderTileShape(shape: PosterShape) {
        val folder = _uiState.value.editingFolder ?: return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(tileShape = shape.name.lowercase()),
        )
    }

    fun updateFolderHideTitle(hide: Boolean) {
        val folder = _uiState.value.editingFolder ?: return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(hideTitle = hide),
        )
    }

    fun addCatalogSource(catalog: AvailableCatalog) {
        val folder = _uiState.value.editingFolder ?: return
        val defaultGenre = if (catalog.genreRequired) catalog.genreOptions.firstOrNull() else null
        val source = CollectionCatalogSource(
            addonId = catalog.addonId,
            type = catalog.type,
            catalogId = catalog.catalogId,
            genre = defaultGenre,
        )
        if (folder.catalogSources.any {
                it.addonId == source.addonId && it.type == source.type && it.catalogId == source.catalogId
            }) return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(catalogSources = folder.catalogSources + source),
        )
    }

    fun removeCatalogSource(index: Int) {
        val folder = _uiState.value.editingFolder ?: return
        if (index !in folder.catalogSources.indices) return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(
                catalogSources = folder.catalogSources.toMutableList().apply { removeAt(index) },
            ),
            genrePickerSourceIndex = null,
        )
    }

    fun updateCatalogSourceGenre(index: Int, genre: String?) {
        val folder = _uiState.value.editingFolder ?: return
        if (index !in folder.catalogSources.indices) return
        val updated = folder.catalogSources.toMutableList()
        updated[index] = updated[index].copy(genre = genre)
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.copy(catalogSources = updated),
        )
    }

    fun toggleCatalogSource(catalog: AvailableCatalog) {
        val folder = _uiState.value.editingFolder ?: return
        val existingIndex = folder.catalogSources.indexOfFirst {
            it.addonId == catalog.addonId && it.type == catalog.type && it.catalogId == catalog.catalogId
        }
        if (existingIndex >= 0) {
            removeCatalogSource(existingIndex)
        } else {
            addCatalogSource(catalog)
        }
    }

    fun showCatalogPicker() {
        _uiState.value = _uiState.value.copy(
            showCatalogPicker = true,
            genrePickerSourceIndex = null,
        )
    }

    fun hideCatalogPicker() {
        _uiState.value = _uiState.value.copy(showCatalogPicker = false)
    }

    fun showGenrePicker(index: Int) {
        val folder = _uiState.value.editingFolder ?: return
        if (index !in folder.catalogSources.indices) return
        _uiState.value = _uiState.value.copy(
            genrePickerSourceIndex = index,
            showCatalogPicker = false,
        )
    }

    fun hideGenrePicker() {
        _uiState.value = _uiState.value.copy(genrePickerSourceIndex = null)
    }

    fun saveFolderEdit() {
        val folder = _uiState.value.editingFolder ?: return
        val existing = _uiState.value.folders
        val updated = if (existing.any { it.id == folder.id }) {
            existing.map { if (it.id == folder.id) folder else it }
        } else {
            existing + folder
        }
        _uiState.value = _uiState.value.copy(
            folders = updated,
            editingFolder = null,
            showFolderEditor = false,
            showCatalogPicker = false,
            genrePickerSourceIndex = null,
        )
    }

    fun cancelFolderEdit() {
        _uiState.value = _uiState.value.copy(
            editingFolder = null,
            showFolderEditor = false,
            showCatalogPicker = false,
            genrePickerSourceIndex = null,
        )
    }

    fun save(): Boolean {
        val state = _uiState.value
        if (state.title.isBlank()) return false

        val collection = Collection(
            id = state.collectionId,
            title = state.title.trim(),
            backdropImageUrl = state.backdropImageUrl.ifBlank { null },
            pinToTop = state.pinToTop,
            viewMode = state.viewMode.name,
            showAllTab = state.showAllTab,
            folders = state.folders,
        )

        if (state.isNew) {
            CollectionRepository.addCollection(collection)
        } else {
            CollectionRepository.updateCollection(collection)
        }
        return true
    }
}
