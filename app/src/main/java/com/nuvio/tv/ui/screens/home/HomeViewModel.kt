package com.nuvio.tv.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.domain.model.Addon
import com.nuvio.tv.domain.model.CatalogDescriptor
import com.nuvio.tv.domain.model.CatalogRow
import com.nuvio.tv.domain.model.WatchProgress
import com.nuvio.tv.domain.repository.AddonRepository
import com.nuvio.tv.domain.repository.CatalogRepository
import com.nuvio.tv.domain.repository.WatchProgressRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val addonRepository: AddonRepository,
    private val catalogRepository: CatalogRepository,
    private val watchProgressRepository: WatchProgressRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _focusState = MutableStateFlow(HomeScreenFocusState())
    val focusState: StateFlow<HomeScreenFocusState> = _focusState.asStateFlow()

    private val catalogsMap = linkedMapOf<String, CatalogRow>()
    private val catalogOrder = mutableListOf<String>()

    init {
        loadContinueWatching()
        loadAllCatalogs()
    }

    fun onEvent(event: HomeEvent) {
        when (event) {
            is HomeEvent.OnItemClick -> navigateToDetail(event.itemId, event.itemType)
            is HomeEvent.OnLoadMoreCatalog -> loadMoreCatalogItems(event.catalogId, event.addonId, event.type)
            HomeEvent.OnRetry -> loadAllCatalogs()
        }
    }

    private fun loadContinueWatching() {
        viewModelScope.launch {
            watchProgressRepository.continueWatching.collectLatest { items ->
                _uiState.update { it.copy(continueWatchingItems = items) }
            }
        }
    }

    private fun loadAllCatalogs() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            catalogOrder.clear()
            catalogsMap.clear()

            try {
                val addons = addonRepository.getInstalledAddons().first()

                if (addons.isEmpty()) {
                    _uiState.update { it.copy(isLoading = false, error = "No addons installed") }
                    return@launch
                }

                // Build catalog order based on addon manifest order
                addons.forEach { addon ->
                    addon.catalogs
                        .filterNot { it.isSearchOnlyCatalog() }
                        .forEach { catalog ->
                        val key = catalogKey(
                            addonId = addon.id,
                            type = catalog.type.toApiString(),
                            catalogId = catalog.id
                        )
                        if (key !in catalogOrder) {
                            catalogOrder.add(key)
                        }
                        }
                }

                // Load catalogs
                addons.forEach { addon ->
                    addon.catalogs
                        .filterNot { it.isSearchOnlyCatalog() }
                        .forEach { catalog ->
                            loadCatalog(addon, catalog)
                        }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    private fun loadCatalog(addon: Addon, catalog: CatalogDescriptor) {
        viewModelScope.launch {
            catalogRepository.getCatalog(
                addonBaseUrl = addon.baseUrl,
                addonId = addon.id,
                addonName = addon.name,
                catalogId = catalog.id,
                catalogName = catalog.name,
                type = catalog.type.toApiString(),
                skip = 0
            ).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        val key = catalogKey(
                            addonId = addon.id,
                            type = catalog.type.toApiString(),
                            catalogId = catalog.id
                        )
                        catalogsMap[key] = result.data
                        updateCatalogRows()
                    }
                    is NetworkResult.Error -> {
                        // Log error but don't fail entire screen
                    }
                    NetworkResult.Loading -> { /* Handled by individual row */ }
                }
            }
        }
    }

    private fun loadMoreCatalogItems(catalogId: String, addonId: String, type: String) {
        val key = catalogKey(addonId = addonId, type = type, catalogId = catalogId)
        val currentRow = catalogsMap[key] ?: return

        if (currentRow.isLoading || !currentRow.hasMore) return

        catalogsMap[key] = currentRow.copy(isLoading = true)
        updateCatalogRows()

        viewModelScope.launch {
            val addons = addonRepository.getInstalledAddons().first()
            val addon = addons.find { it.id == addonId } ?: return@launch

            val nextSkip = (currentRow.currentPage + 1) * 100
            catalogRepository.getCatalog(
                addonBaseUrl = addon.baseUrl,
                addonId = addon.id,
                addonName = addon.name,
                catalogId = catalogId,
                catalogName = currentRow.catalogName,
                type = currentRow.type.toApiString(),
                skip = nextSkip
            ).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        val mergedItems = currentRow.items + result.data.items
                        catalogsMap[key] = result.data.copy(items = mergedItems)
                        updateCatalogRows()
                    }
                    is NetworkResult.Error -> {
                        catalogsMap[key] = currentRow.copy(isLoading = false)
                        updateCatalogRows()
                    }
                    NetworkResult.Loading -> { }
                }
            }
        }
    }

    private fun updateCatalogRows() {
        _uiState.update { state ->
            // Preserve addon manifest order
            val orderedRows = catalogOrder.mapNotNull { key -> catalogsMap[key] }
            state.copy(
                catalogRows = orderedRows,
                isLoading = false
            )
        }
    }

    private fun navigateToDetail(itemId: String, itemType: String) {
        _uiState.update { it.copy(selectedItemId = itemId) }
    }

    private fun catalogKey(addonId: String, type: String, catalogId: String): String {
        return "${addonId}_${type}_${catalogId}"
    }

    private fun CatalogDescriptor.isSearchOnlyCatalog(): Boolean {
        return extra.any { extra -> extra.name == "search" && extra.isRequired }
    }

    /**
     * Saves the current focus and scroll state for restoration when returning to this screen.
     */
    fun saveFocusState(
        verticalScrollIndex: Int,
        verticalScrollOffset: Int,
        focusedRowIndex: Int,
        focusedItemIndex: Int,
        catalogRowScrollStates: Map<String, Int>
    ) {
        _focusState.value = HomeScreenFocusState(
            verticalScrollIndex = verticalScrollIndex,
            verticalScrollOffset = verticalScrollOffset,
            focusedRowIndex = focusedRowIndex,
            focusedItemIndex = focusedItemIndex,
            catalogRowScrollStates = catalogRowScrollStates
        )
    }

    /**
     * Clears the saved focus state.
     */
    fun clearFocusState() {
        _focusState.value = HomeScreenFocusState()
    }
}
