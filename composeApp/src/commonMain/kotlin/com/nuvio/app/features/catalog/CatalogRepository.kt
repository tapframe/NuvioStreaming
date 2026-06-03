package com.nuvio.app.features.catalog

import com.nuvio.app.features.library.LibraryRepository
import com.nuvio.app.features.library.toMetaPreview
import com.nuvio.app.features.home.HomeCatalogSettingsRepository
import com.nuvio.app.features.home.filterReleasedItems
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString

const val INTERNAL_LIBRARY_MANIFEST_URL = "nuvio://library"

object CatalogRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _uiState = MutableStateFlow(CatalogUiState())
    val uiState: StateFlow<CatalogUiState> = _uiState.asStateFlow()

    private var activeJob: Job? = null
    private var activeRequest: CatalogRequest? = null
    private val scrollPositions = linkedMapOf<CatalogRequest, CatalogScrollPosition>()

    fun load(
        manifestUrl: String,
        type: String,
        catalogId: String,
        genre: String? = null,
        supportsPagination: Boolean = false,
        force: Boolean = false,
    ) {
        val request = catalogRequest(
            manifestUrl = manifestUrl,
            type = type,
            catalogId = catalogId,
            genre = genre,
            supportsPagination = supportsPagination,
        )
        if (!force && activeRequest == request && (_uiState.value.items.isNotEmpty() || _uiState.value.isLoading)) {
            return
        }
        activeRequest = request
        if (manifestUrl == INTERNAL_LIBRARY_MANIFEST_URL) {
            fetchInternalLibrary(request)
            return
        }
        fetchPage(request = request, reset = true)
    }

    fun loadMore() {
        val request = activeRequest ?: return
        val current = _uiState.value
        if (current.isLoading || current.nextSkip == null) return
        fetchPage(request = request, reset = false)
    }

    fun clear() {
        activeJob?.cancel()
        activeRequest = null
        scrollPositions.clear()
        _uiState.value = CatalogUiState()
    }

    fun scrollPosition(
        manifestUrl: String,
        type: String,
        catalogId: String,
        genre: String? = null,
        supportsPagination: Boolean = false,
    ): CatalogScrollPosition =
        scrollPositions[catalogRequest(manifestUrl, type, catalogId, genre, supportsPagination)]
            ?: CatalogScrollPosition()

    fun saveScrollPosition(
        manifestUrl: String,
        type: String,
        catalogId: String,
        genre: String? = null,
        supportsPagination: Boolean = false,
        firstVisibleItemIndex: Int,
        firstVisibleItemScrollOffset: Int,
    ) {
        val request = catalogRequest(manifestUrl, type, catalogId, genre, supportsPagination)
        scrollPositions[request] = CatalogScrollPosition(
            firstVisibleItemIndex = firstVisibleItemIndex,
            firstVisibleItemScrollOffset = firstVisibleItemScrollOffset,
        )
    }

    private fun fetchInternalLibrary(request: CatalogRequest) {
        activeJob?.cancel()
        _uiState.value = _uiState.value.copy(
            isLoading = true,
            errorMessage = null,
        )

        activeJob = scope.launch {
            runCatching {
                LibraryRepository.ensureLoaded()
                LibraryRepository.uiState.value.sections
                    .firstOrNull { it.type == request.catalogId }
                    ?.items
                    .orEmpty()
                    .map { it.toMetaPreview() }
                    .let(::dedupeCatalogItems)
            }.fold(
                onSuccess = { items ->
                    if (activeRequest != request) return@fold
                    _uiState.value = CatalogUiState(
                        items = items,
                        isLoading = false,
                        nextSkip = null,
                        errorMessage = null,
                    )
                },
                onFailure = { error ->
                    if (activeRequest != request) return@fold
                    _uiState.value = CatalogUiState(
                        items = emptyList(),
                        isLoading = false,
                        nextSkip = null,
                        errorMessage = error.message ?: getString(Res.string.catalog_load_failed),
                    )
                },
            )
        }
    }

    private fun fetchPage(
        request: CatalogRequest,
        reset: Boolean,
    ) {
        activeJob?.cancel()
        val current = _uiState.value
        val requestedSkip = if (reset) 0 else current.nextSkip ?: return

        _uiState.value = current.copy(
            items = if (reset) emptyList() else current.items,
            isLoading = true,
            nextSkip = if (reset) null else current.nextSkip,
            errorMessage = null,
        )

        activeJob = scope.launch {
            runCatching {
                fetchCatalogPage(
                    manifestUrl = request.manifestUrl,
                    type = request.type,
                    catalogId = request.catalogId,
                    genre = request.genre,
                    skip = requestedSkip.takeIf { it > 0 },
                ).withUnreleasedFilter(request.hideUnreleasedContent)
            }.fold(
                onSuccess = { page ->
                    if (activeRequest != request) return@fold

                    val mergedItems = if (reset) {
                        dedupeCatalogItems(page.items)
                    } else {
                        mergeCatalogItems(_uiState.value.items, page.items)
                    }
                    val supportsPagination = request.supportsPagination || page.rawItemCount >= CATALOG_PAGE_SIZE
                    val loadedNewItems = reset || mergedItems.size > current.items.size
                    _uiState.value = CatalogUiState(
                        items = mergedItems,
                        isLoading = false,
                        nextSkip = if (supportsPagination && loadedNewItems) page.nextSkip else null,
                        errorMessage = null,
                    )
                },
                onFailure = { error ->
                    if (activeRequest != request) return@fold

                    _uiState.value = current.copy(
                        items = if (reset) emptyList() else current.items,
                        isLoading = false,
                        nextSkip = null,
                        errorMessage = error.message ?: getString(Res.string.catalog_load_failed),
                    )
                },
            )
        }
    }

    private fun catalogRequest(
        manifestUrl: String,
        type: String,
        catalogId: String,
        genre: String? = null,
        supportsPagination: Boolean = false,
    ): CatalogRequest =
        CatalogRequest(
            manifestUrl = manifestUrl,
            type = type,
            catalogId = catalogId,
            genre = genre,
            supportsPagination = supportsPagination,
            hideUnreleasedContent = HomeCatalogSettingsRepository.snapshot().hideUnreleasedContent,
        )
}

private fun CatalogPage.withUnreleasedFilter(hideUnreleasedContent: Boolean): CatalogPage {
    if (!hideUnreleasedContent) return this
    val filteredItems = items.filterReleasedItems(CurrentDateProvider.todayIsoDate())
    return if (filteredItems.size == items.size) this else copy(items = filteredItems)
}

private data class CatalogRequest(
    val manifestUrl: String,
    val type: String,
    val catalogId: String,
    val genre: String?,
    val supportsPagination: Boolean,
    val hideUnreleasedContent: Boolean,
)
