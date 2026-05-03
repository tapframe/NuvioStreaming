package com.nuvio.app.features.collection

import co.touchlab.kermit.Logger
import com.nuvio.app.features.home.PosterShape
import com.nuvio.app.features.trakt.TraktPublicListSearchResult
import com.nuvio.app.features.trakt.TraktPublicListSourceResolver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
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
    val showTmdbSourcePicker: Boolean = false,
    val showTraktSourcePicker: Boolean = false,
    val editingTraktSourceIndex: Int? = null,
    val genrePickerSourceIndex: Int? = null,
    val tmdbBuilderMode: TmdbBuilderMode = TmdbBuilderMode.PRESETS,
    val tmdbInput: String = "",
    val tmdbTitleInput: String = "",
    val tmdbMediaType: TmdbCollectionMediaType = TmdbCollectionMediaType.MOVIE,
    val tmdbMediaBoth: Boolean = false,
    val tmdbSortBy: String = TmdbCollectionSort.POPULAR_DESC.value,
    val tmdbFilters: TmdbCollectionFilters = TmdbCollectionFilters(),
    val tmdbCompanyResults: List<TmdbCompanySearchResult> = emptyList(),
    val tmdbCollectionResults: List<TmdbCollectionSearchResult> = emptyList(),
    val tmdbSearchError: String? = null,
    val traktInput: String = "",
    val traktTitleInput: String = "",
    val traktMediaType: TmdbCollectionMediaType = TmdbCollectionMediaType.MOVIE,
    val traktMediaBoth: Boolean = true,
    val traktSortBy: String = TraktListSort.RANK.value,
    val traktSortHow: String = TraktSortHow.ASC.value,
    val traktSearchResults: List<TraktPublicListSearchResult> = emptyList(),
    val traktTrendingResults: List<TraktPublicListSearchResult> = emptyList(),
    val traktPopularResults: List<TraktPublicListSearchResult> = emptyList(),
    val traktSearchError: String? = null,
)

enum class TmdbBuilderMode {
    PRESETS,
    LIST,
    PRODUCTION,
    NETWORK,
    COLLECTION,
    PERSON,
    DIRECTOR,
    DISCOVER,
}

object CollectionEditorRepository {
    private val log = Logger.withTag("CollectionEditorRepository")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

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
        if (folder.resolvedCatalogSources.any {
                it.addonId == source.addonId && it.type == source.type && it.catalogId == source.catalogId
            }) return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.withSources(folder.resolvedSources + source.toCollectionSource()),
        )
    }

    fun removeCatalogSource(index: Int) {
        val folder = _uiState.value.editingFolder ?: return
        val sources = folder.resolvedSources
        if (index !in sources.indices) return
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.withSources(sources.toMutableList().apply { removeAt(index) }),
            genrePickerSourceIndex = null,
        )
    }

    fun updateCatalogSourceGenre(index: Int, genre: String?) {
        val folder = _uiState.value.editingFolder ?: return
        val sources = folder.resolvedSources
        if (index !in sources.indices || sources[index].addonCatalogSource() == null) return
        val updated = sources.toMutableList()
        updated[index] = updated[index].copy(genre = genre)
        _uiState.value = _uiState.value.copy(
            editingFolder = folder.withSources(updated),
        )
    }

    fun toggleCatalogSource(catalog: AvailableCatalog) {
        val folder = _uiState.value.editingFolder ?: return
        val sources = folder.resolvedSources
        val existingIndex = sources.indexOfFirst {
            !it.isTmdb &&
                !it.isTrakt &&
                it.addonId == catalog.addonId &&
                it.type == catalog.type &&
                it.catalogId == catalog.catalogId
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
            showTmdbSourcePicker = false,
            showTraktSourcePicker = false,
            editingTraktSourceIndex = null,
            genrePickerSourceIndex = null,
        )
    }

    fun hideCatalogPicker() {
        _uiState.value = _uiState.value.copy(showCatalogPicker = false)
    }

    fun showTmdbSourcePicker() {
        _uiState.value = _uiState.value.copy(
            showTmdbSourcePicker = true,
            showCatalogPicker = false,
            showTraktSourcePicker = false,
            editingTraktSourceIndex = null,
            genrePickerSourceIndex = null,
            tmdbSearchError = null,
        )
    }

    fun hideTmdbSourcePicker() {
        _uiState.value = _uiState.value.copy(showTmdbSourcePicker = false, tmdbSearchError = null)
    }

    fun showTraktSourcePicker() {
        _uiState.value = _uiState.value.copy(
            showTraktSourcePicker = true,
            showCatalogPicker = false,
            showTmdbSourcePicker = false,
            editingTraktSourceIndex = null,
            genrePickerSourceIndex = null,
            traktInput = "",
            traktTitleInput = "",
            traktMediaType = TmdbCollectionMediaType.MOVIE,
            traktMediaBoth = true,
            traktSortBy = TraktListSort.RANK.value,
            traktSortHow = TraktSortHow.ASC.value,
            traktSearchResults = emptyList(),
            traktSearchError = null,
        )
        loadTraktFeaturedLists()
    }

    fun hideTraktSourcePicker() {
        _uiState.value = _uiState.value.copy(
            showTraktSourcePicker = false,
            editingTraktSourceIndex = null,
            traktSearchError = null,
        )
    }

    fun editTraktSource(index: Int) {
        val folder = _uiState.value.editingFolder ?: return
        val source = folder.resolvedSources.getOrNull(index) ?: return
        if (!source.isTrakt) return
        _uiState.value = _uiState.value.copy(
            showTraktSourcePicker = true,
            showCatalogPicker = false,
            showTmdbSourcePicker = false,
            editingTraktSourceIndex = index,
            genrePickerSourceIndex = null,
            traktInput = source.traktListId?.toString().orEmpty(),
            traktTitleInput = source.title.orEmpty(),
            traktMediaType = TmdbCollectionMediaType.fromString(source.mediaType),
            traktMediaBoth = false,
            traktSortBy = TraktListSort.normalize(source.sortBy),
            traktSortHow = TraktSortHow.normalize(source.sortHow),
            traktSearchResults = emptyList(),
            traktSearchError = null,
        )
        loadTraktFeaturedLists()
    }

    fun setTraktInput(value: String) {
        _uiState.value = _uiState.value.copy(traktInput = value, traktSearchError = null)
    }

    fun setTraktTitleInput(value: String) {
        _uiState.value = _uiState.value.copy(traktTitleInput = value)
    }

    fun setTraktMediaType(value: TmdbCollectionMediaType) {
        _uiState.value = _uiState.value.copy(traktMediaType = value, traktMediaBoth = false)
    }

    fun setTraktMediaBoth(value: Boolean) {
        _uiState.value = _uiState.value.copy(
            traktMediaBoth = value,
            traktMediaType = if (value) TmdbCollectionMediaType.MOVIE else _uiState.value.traktMediaType,
        )
    }

    fun setTraktSortBy(value: String) {
        _uiState.value = _uiState.value.copy(traktSortBy = TraktListSort.normalize(value))
    }

    fun setTraktSortHow(value: String) {
        _uiState.value = _uiState.value.copy(traktSortHow = TraktSortHow.normalize(value))
    }

    fun searchTraktLists() {
        val state = _uiState.value
        val query = state.traktInput.trim()
        if (query.isBlank()) {
            _uiState.value = state.copy(traktSearchError = "Enter a Trakt list name, URL, or ID")
            return
        }

        scope.launch {
            val results = if (query.isTraktListIdentifierInput()) {
                runCatching {
                    val metadata = TraktPublicListSourceResolver.listImportMetadata(query)
                    val id = metadata.traktListId ?: error("Could not load Trakt list")
                    listOf(
                        TraktPublicListSearchResult(
                            traktListId = id,
                            title = metadata.title ?: "Trakt List $id",
                            subtitle = "Resolved Trakt list",
                            coverImageUrl = metadata.coverImageUrl,
                        ),
                    )
                }
            } else {
                runCatching { TraktPublicListSourceResolver.searchPublicLists(query) }
            }
            val mapped = results.getOrDefault(emptyList())
            _uiState.value = _uiState.value.copy(
                traktSearchResults = mapped,
                traktSearchError = results.exceptionOrNull()?.message
                    ?: if (mapped.isEmpty()) "No Trakt lists found" else null,
            )
        }
    }

    private fun loadTraktFeaturedLists() {
        scope.launch {
            val trending = runCatching { TraktPublicListSourceResolver.trendingPublicLists() }
            val popular = runCatching { TraktPublicListSourceResolver.popularPublicLists() }
            _uiState.value = _uiState.value.copy(
                traktTrendingResults = trending.getOrDefault(_uiState.value.traktTrendingResults),
                traktPopularResults = popular.getOrDefault(_uiState.value.traktPopularResults),
                traktSearchError = _uiState.value.traktSearchError
                    ?: trending.exceptionOrNull()?.message
                    ?: popular.exceptionOrNull()?.message,
            )
        }
    }

    fun showGenrePicker(index: Int) {
        val folder = _uiState.value.editingFolder ?: return
        val sources = folder.resolvedSources
        if (index !in sources.indices || sources[index].addonCatalogSource() == null) return
        _uiState.value = _uiState.value.copy(
            genrePickerSourceIndex = index,
            showCatalogPicker = false,
            showTmdbSourcePicker = false,
            showTraktSourcePicker = false,
        )
    }

    fun hideGenrePicker() {
        _uiState.value = _uiState.value.copy(genrePickerSourceIndex = null)
    }

    fun saveFolderEdit() {
        val folder = _uiState.value.editingFolder ?: return
        val normalizedFolder = folder.withSources(folder.resolvedSources)
        val existing = _uiState.value.folders
        val updated = if (existing.any { it.id == normalizedFolder.id }) {
            existing.map { if (it.id == normalizedFolder.id) normalizedFolder else it }
        } else {
            existing + normalizedFolder
        }
        _uiState.value = _uiState.value.copy(
            folders = updated,
            editingFolder = null,
            showFolderEditor = false,
            showCatalogPicker = false,
            showTmdbSourcePicker = false,
            showTraktSourcePicker = false,
            editingTraktSourceIndex = null,
            genrePickerSourceIndex = null,
        )
    }

    fun cancelFolderEdit() {
        _uiState.value = _uiState.value.copy(
            editingFolder = null,
            showFolderEditor = false,
            showCatalogPicker = false,
            showTmdbSourcePicker = false,
            showTraktSourcePicker = false,
            editingTraktSourceIndex = null,
            genrePickerSourceIndex = null,
        )
    }

    fun setTmdbBuilderMode(mode: TmdbBuilderMode) {
        val mediaType = if (mode == TmdbBuilderMode.NETWORK) {
            TmdbCollectionMediaType.TV
        } else {
            _uiState.value.tmdbMediaType
        }
        val sortBy = when (mode) {
            TmdbBuilderMode.LIST,
            TmdbBuilderMode.COLLECTION -> TmdbCollectionSort.ORIGINAL.value
            else -> TmdbCollectionSort.POPULAR_DESC.value
        }
        _uiState.value = _uiState.value.copy(
            tmdbBuilderMode = mode,
            tmdbMediaType = mediaType,
            tmdbSortBy = sortBy,
            tmdbMediaBoth = if (
                mode == TmdbBuilderMode.NETWORK ||
                mode == TmdbBuilderMode.LIST ||
                mode == TmdbBuilderMode.COLLECTION
            ) {
                false
            } else {
                _uiState.value.tmdbMediaBoth
            },
            tmdbCompanyResults = emptyList(),
            tmdbCollectionResults = emptyList(),
            tmdbSearchError = null,
        )
    }

    fun setTmdbInput(value: String) {
        _uiState.value = _uiState.value.copy(tmdbInput = value, tmdbSearchError = null)
    }

    fun setTmdbTitleInput(value: String) {
        _uiState.value = _uiState.value.copy(tmdbTitleInput = value)
    }

    fun setTmdbMediaType(value: TmdbCollectionMediaType) {
        _uiState.value = _uiState.value.copy(tmdbMediaType = value, tmdbMediaBoth = false)
    }

    fun setTmdbMediaBoth(value: Boolean) {
        _uiState.value = _uiState.value.copy(
            tmdbMediaBoth = value,
            tmdbMediaType = if (value) TmdbCollectionMediaType.MOVIE else _uiState.value.tmdbMediaType,
        )
    }

    fun setTmdbSortBy(value: String) {
        _uiState.value = _uiState.value.copy(tmdbSortBy = value)
    }

    fun updateTmdbFilters(transform: (TmdbCollectionFilters) -> TmdbCollectionFilters) {
        _uiState.value = _uiState.value.copy(tmdbFilters = transform(_uiState.value.tmdbFilters))
    }

    fun addTmdbPreset(source: CollectionSource) {
        addTmdbSource(source)
    }

    fun searchTmdbCompanies() {
        val query = _uiState.value.tmdbInput.trim()
        if (query.isBlank()) return
        scope.launch {
            val results = runCatching { TmdbCollectionSourceResolver.searchCompanies(query) }
            _uiState.value = _uiState.value.copy(
                tmdbCompanyResults = results.getOrDefault(emptyList()),
                tmdbSearchError = results.exceptionOrNull()?.message,
            )
        }
    }

    fun searchTmdbCollections() {
        val query = _uiState.value.tmdbInput.trim()
        if (query.isBlank()) return
        scope.launch {
            val results = runCatching { TmdbCollectionSourceResolver.searchCollections(query) }
            _uiState.value = _uiState.value.copy(
                tmdbCollectionResults = results.getOrDefault(emptyList()),
                tmdbSearchError = results.exceptionOrNull()?.message,
            )
        }
    }

    fun addTmdbSource(source: CollectionSource) {
        val sourceType = source.tmdbType()
        if (source.tmdbId != null && sourceType in coverMetadataSourceTypes) {
            scope.launch {
                val metadata = runCatching { TmdbCollectionSourceResolver.importMetadata(sourceType, source.tmdbId) }
                val resolved = metadata.getOrNull()
                addTmdbSources(
                    sources = listOf(
                        if (source.title.isNullOrBlank()) {
                            source.copy(title = resolved?.title)
                        } else {
                            source
                        },
                    ),
                    coverImageUrl = resolved?.coverImageUrl,
                )
            }
            return
        }
        addTmdbSources(listOf(source))
    }

    fun addTmdbSourcesFromPicker(sources: List<CollectionSource>) {
        val metadataSource = sources.firstOrNull {
            it.tmdbId != null && it.tmdbType() in coverMetadataSourceTypes
        }
        if (metadataSource != null) {
            scope.launch {
                val sourceType = metadataSource.tmdbType()
                val metadata = runCatching { TmdbCollectionSourceResolver.importMetadata(sourceType, metadataSource.tmdbId!!) }
                addTmdbSources(sources, metadata.getOrNull()?.coverImageUrl)
            }
            return
        }
        addTmdbSources(sources)
    }

    fun addTmdbSourceFromInput() {
        val state = _uiState.value
        val mode = state.tmdbBuilderMode
        val sourceType = when (mode) {
            TmdbBuilderMode.PRESETS -> TmdbCollectionSourceType.DISCOVER
            TmdbBuilderMode.LIST -> TmdbCollectionSourceType.LIST
            TmdbBuilderMode.COLLECTION -> TmdbCollectionSourceType.COLLECTION
            TmdbBuilderMode.PRODUCTION -> TmdbCollectionSourceType.COMPANY
            TmdbBuilderMode.NETWORK -> TmdbCollectionSourceType.NETWORK
            TmdbBuilderMode.PERSON -> TmdbCollectionSourceType.PERSON
            TmdbBuilderMode.DIRECTOR -> TmdbCollectionSourceType.DIRECTOR
            TmdbBuilderMode.DISCOVER -> TmdbCollectionSourceType.DISCOVER
        }
        val id = TmdbCollectionSourceResolver.parseTmdbId(state.tmdbInput)
        if (sourceType != TmdbCollectionSourceType.DISCOVER && id == null) {
            _uiState.value = state.copy(tmdbSearchError = "Enter a valid TMDB ID or URL.")
            return
        }
        val mediaTypes = selectedMediaTypes(state, sourceType)
        val baseTitle = state.tmdbTitleInput.ifBlank {
            when (sourceType) {
                TmdbCollectionSourceType.LIST -> "TMDB List ${id ?: ""}".trim()
                TmdbCollectionSourceType.COLLECTION -> "TMDB Collection ${id ?: ""}".trim()
                TmdbCollectionSourceType.COMPANY -> "TMDB Production ${id ?: ""}".trim()
                TmdbCollectionSourceType.NETWORK -> "TMDB Network ${id ?: ""}".trim()
                TmdbCollectionSourceType.PERSON -> "TMDB Person ${id ?: ""}".trim()
                TmdbCollectionSourceType.DIRECTOR -> "TMDB Director ${id ?: ""}".trim()
                TmdbCollectionSourceType.DISCOVER -> "TMDB Discover"
            }
        }
        val sources = mediaTypes.map { mediaType ->
            CollectionSource(
                provider = "tmdb",
                tmdbSourceType = sourceType.name,
                title = titleForMedia(baseTitle, mediaType, mediaTypes.size > 1),
                tmdbId = id,
                mediaType = mediaType.name,
                sortBy = state.tmdbSortBy,
                filters = state.tmdbFilters,
            )
        }
        if (sourceType == TmdbCollectionSourceType.LIST || sourceType == TmdbCollectionSourceType.COLLECTION) {
            scope.launch {
                val metadata = runCatching { TmdbCollectionSourceResolver.importMetadata(sourceType, id!!) }
                val resolved = metadata.getOrNull()
                if (metadata.isFailure) {
                    _uiState.value = _uiState.value.copy(
                        tmdbSearchError = metadata.exceptionOrNull()?.message ?: "Could not load TMDB source",
                    )
                    return@launch
                }
                addTmdbSources(
                    sources.map { source ->
                        source.copy(title = state.tmdbTitleInput.ifBlank { resolved?.title ?: baseTitle })
                    },
                    coverImageUrl = resolved?.coverImageUrl,
                )
            }
            return
        }
        addTmdbSourcesFromPicker(sources)
    }

    private fun addTmdbSources(sources: List<CollectionSource>, coverImageUrl: String? = null) {
        val folder = _uiState.value.editingFolder ?: return
        val existingKeys = folder.resolvedSources.mapTo(mutableSetOf(), ::collectionSourceKey)
        val newSources = sources.filter { existingKeys.add(collectionSourceKey(it)) }
        if (newSources.isEmpty()) return
        val shouldApplyCover = newSources.any { it.tmdbType() in coverMetadataSourceTypes } &&
            !coverImageUrl.isNullOrBlank() &&
            folder.coverImageUrl.isNullOrBlank()
        val updatedFolder = if (shouldApplyCover) {
            folder.withSources(folder.resolvedSources + newSources)
                .copy(coverImageUrl = coverImageUrl, coverEmoji = null)
        } else {
            folder.withSources(folder.resolvedSources + newSources)
        }
        _uiState.value = _uiState.value.copy(
            editingFolder = updatedFolder,
            showTmdbSourcePicker = false,
            tmdbInput = "",
            tmdbTitleInput = "",
            tmdbCompanyResults = emptyList(),
            tmdbCollectionResults = emptyList(),
            tmdbSearchError = null,
        )
    }

    fun addTraktSourceFromInput() {
        val state = _uiState.value
        val input = state.traktInput.trim()
        if (input.isBlank()) {
            _uiState.value = state.copy(traktSearchError = "Enter a Trakt list ID or URL")
            return
        }

        scope.launch {
            val metadata = runCatching { TraktPublicListSourceResolver.listImportMetadata(input) }
            val resolved = metadata.getOrNull()
            val listId = resolved?.traktListId
            if (metadata.isFailure || listId == null) {
                _uiState.value = _uiState.value.copy(
                    traktSearchError = metadata.exceptionOrNull()?.message ?: "Could not load Trakt list",
                )
                return@launch
            }

            val title = state.traktTitleInput.ifBlank { resolved.title ?: "Trakt List $listId" }
            addTraktSourcesToFolder(
                sources = selectedTraktMediaTypes(state).map { mediaType ->
                    CollectionSource(
                        provider = "trakt",
                        title = titleForMedia(title, mediaType, state.traktMediaBoth),
                        traktListId = listId,
                        mediaType = mediaType.name,
                        sortBy = TraktListSort.normalize(state.traktSortBy),
                        sortHow = TraktSortHow.normalize(state.traktSortHow),
                    )
                },
                coverImageUrl = resolved.coverImageUrl,
            )
        }
    }

    fun addTraktSourceFromResult(result: TraktPublicListSearchResult) {
        val state = _uiState.value
        val title = state.traktTitleInput.ifBlank { result.title }
        addTraktSourcesToFolder(
            sources = selectedTraktMediaTypes(state).map { mediaType ->
                CollectionSource(
                    provider = "trakt",
                    title = titleForMedia(title, mediaType, state.traktMediaBoth),
                    traktListId = result.traktListId,
                    mediaType = mediaType.name,
                    sortBy = TraktListSort.normalize(state.traktSortBy),
                    sortHow = TraktSortHow.normalize(state.traktSortHow),
                )
            },
            coverImageUrl = result.coverImageUrl,
        )
    }

    private fun addTraktSourcesToFolder(sources: List<CollectionSource>, coverImageUrl: String? = null) {
        val state = _uiState.value
        val folder = state.editingFolder ?: return
        val editingIndex = state.editingTraktSourceIndex
        val existingKeys = folder.resolvedSources
            .mapIndexedNotNull { index, source ->
                collectionSourceKey(source).takeUnless { index == editingIndex }
            }
            .toMutableSet()
        val newSources = sources.filter { existingKeys.add(collectionSourceKey(it)) }
        if (newSources.isEmpty()) return

        val updatedSources = if (
            editingIndex != null &&
            editingIndex in folder.resolvedSources.indices &&
            folder.resolvedSources[editingIndex].isTrakt
        ) {
            folder.resolvedSources.toMutableList().also {
                it.removeAt(editingIndex)
                it.addAll(editingIndex, newSources)
            }
        } else {
            folder.resolvedSources + newSources
        }
        val shouldApplyCover = !coverImageUrl.isNullOrBlank() && folder.coverImageUrl.isNullOrBlank()
        val updatedFolder = if (shouldApplyCover) {
            folder.withSources(updatedSources)
                .copy(coverImageUrl = coverImageUrl, coverEmoji = null)
        } else {
            folder.withSources(updatedSources)
        }

        _uiState.value = state.copy(
            editingFolder = updatedFolder,
            showTraktSourcePicker = false,
            editingTraktSourceIndex = null,
            traktInput = "",
            traktTitleInput = "",
            traktSearchResults = emptyList(),
            traktSearchError = null,
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

private val coverMetadataSourceTypes = setOf(
    TmdbCollectionSourceType.COLLECTION,
    TmdbCollectionSourceType.COMPANY,
    TmdbCollectionSourceType.NETWORK,
    TmdbCollectionSourceType.PERSON,
    TmdbCollectionSourceType.DIRECTOR,
)

private fun CollectionCatalogSource.toCollectionSource(): CollectionSource =
    CollectionSource(
        provider = "addon",
        addonId = addonId,
        type = type,
        catalogId = catalogId,
        genre = genre,
    )

private fun CollectionFolder.withSources(nextSources: List<CollectionSource>): CollectionFolder =
    copy(
        sources = nextSources,
        catalogSources = nextSources.mapNotNull { it.addonCatalogSource() },
    )

private fun collectionSourceKey(source: CollectionSource): String =
    when {
        source.isTmdb -> {
            "tmdb_${source.tmdbSourceType}_${source.tmdbId}_${source.mediaType}_${source.sortBy}_${source.filters.hashCode()}"
        }

        source.isTrakt -> {
            "trakt_${source.traktListId}_${source.mediaType}_${TraktListSort.normalize(source.sortBy)}_${TraktSortHow.normalize(source.sortHow)}"
        }

        else -> {
            "addon_${source.addonId}_${source.type}_${source.catalogId}_${source.genre.orEmpty()}"
        }
    }

private fun selectedMediaTypes(
    state: CollectionEditorUiState,
    sourceType: TmdbCollectionSourceType,
): List<TmdbCollectionMediaType> =
    when (sourceType) {
        TmdbCollectionSourceType.COMPANY,
        TmdbCollectionSourceType.PERSON,
        TmdbCollectionSourceType.DIRECTOR,
        TmdbCollectionSourceType.DISCOVER -> if (state.tmdbMediaBoth) {
            listOf(TmdbCollectionMediaType.MOVIE, TmdbCollectionMediaType.TV)
        } else {
            listOf(state.tmdbMediaType)
        }
        TmdbCollectionSourceType.NETWORK -> listOf(TmdbCollectionMediaType.TV)
        TmdbCollectionSourceType.COLLECTION,
        TmdbCollectionSourceType.LIST -> listOf(TmdbCollectionMediaType.MOVIE)
    }

private fun titleForMedia(
    title: String,
    mediaType: TmdbCollectionMediaType,
    addSuffix: Boolean,
): String {
    if (!addSuffix) return title
    val suffix = when (mediaType) {
        TmdbCollectionMediaType.MOVIE -> "Movies"
        TmdbCollectionMediaType.TV -> "Series"
    }
    return "$title $suffix"
}

private fun selectedTraktMediaTypes(state: CollectionEditorUiState): List<TmdbCollectionMediaType> =
    if (state.traktMediaBoth) {
        listOf(TmdbCollectionMediaType.MOVIE, TmdbCollectionMediaType.TV)
    } else {
        listOf(state.traktMediaType)
    }

private fun CollectionSource.tmdbType(): TmdbCollectionSourceType =
    tmdbSourceType
        ?.let { raw -> runCatching { TmdbCollectionSourceType.valueOf(raw.uppercase()) }.getOrNull() }
        ?: TmdbCollectionSourceType.DISCOVER

private fun String.isTraktListIdentifierInput(): Boolean {
    val trimmed = trim()
    if (trimmed.isBlank()) return false
    if (trimmed.toLongOrNull() != null) return true
    if (trimmed.contains("trakt.tv/", ignoreCase = true)) return true
    return Regex("""[?&]id=([^&#/]+)""").containsMatchIn(trimmed)
}
