package com.nuvio.tv.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.domain.model.Addon
import com.nuvio.tv.domain.model.CatalogDescriptor
import com.nuvio.tv.domain.model.CatalogRow
import com.nuvio.tv.domain.repository.AddonRepository
import com.nuvio.tv.domain.repository.CatalogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val addonRepository: AddonRepository,
    private val catalogRepository: CatalogRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private val catalogsMap = linkedMapOf<String, CatalogRow>()
    private val catalogOrder = mutableListOf<String>()

    private var debounceJob: Job? = null
    private var activeSearchJobs: List<Job> = emptyList()

    fun onEvent(event: SearchEvent) {
        when (event) {
            is SearchEvent.QueryChanged -> onQueryChanged(event.query)
            is SearchEvent.LoadMoreCatalog -> loadMoreCatalogItems(
                catalogId = event.catalogId,
                addonId = event.addonId,
                type = event.type
            )
            SearchEvent.Retry -> performSearch(uiState.value.query)
        }
    }

    private fun onQueryChanged(query: String) {
        _uiState.update { it.copy(query = query, error = null) }

        debounceJob?.cancel()
        debounceJob = viewModelScope.launch {
            delay(350)
            performSearch(query)
        }
    }

    private fun performSearch(rawQuery: String) {
        val query = rawQuery.trim()

        // Cancel any in-flight work from the previous query.
        activeSearchJobs.forEach { it.cancel() }
        activeSearchJobs = emptyList()

        catalogsMap.clear()
        catalogOrder.clear()

        if (query.length < 2) {
            _uiState.update {
                it.copy(
                    isSearching = false,
                    error = null,
                    catalogRows = emptyList()
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSearching = true, error = null, catalogRows = emptyList()) }

            val addons = try {
                addonRepository.getInstalledAddons().first()
            } catch (e: Exception) {
                _uiState.update { it.copy(isSearching = false, error = e.message ?: "Failed to load addons") }
                return@launch
            }

            _uiState.update { it.copy(installedAddons = addons) }

            val searchTargets = buildSearchTargets(addons)

            if (searchTargets.isEmpty()) {
                _uiState.update {
                    it.copy(
                        isSearching = false,
                        error = "No searchable catalogs found in installed addons",
                        catalogRows = emptyList()
                    )
                }
                return@launch
            }

            // Preserve addon manifest order.
            searchTargets.forEach { (addon, catalog) ->
                val key = catalogKey(addonId = addon.id, type = catalog.type.toApiString(), catalogId = catalog.id)
                if (key !in catalogOrder) {
                    catalogOrder.add(key)
                }
            }

            val jobs = searchTargets.map { (addon, catalog) ->
                viewModelScope.launch {
                    loadCatalog(addon, catalog, query)
                }
            }
            activeSearchJobs = jobs

            // Wait for all jobs to complete so we can stop showing the global loading state.
            viewModelScope.launch {
                try {
                    jobs.joinAll()
                } catch (_: Exception) {
                    // Cancellations are expected when query changes.
                } finally {
                    if (uiState.value.query.trim() == query) {
                        _uiState.update { it.copy(isSearching = false) }
                    }
                }
            }
        }
    }

    private suspend fun loadCatalog(addon: Addon, catalog: CatalogDescriptor, query: String) {
        catalogRepository.getCatalog(
            addonBaseUrl = addon.baseUrl,
            addonId = addon.id,
            addonName = addon.name,
            catalogId = catalog.id,
            catalogName = catalog.name,
            type = catalog.type.toApiString(),
            skip = 0,
            extraArgs = mapOf("search" to query)
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
                    // Ignore per-catalog errors unless we have nothing to show.
                    if (catalogsMap.isEmpty()) {
                        _uiState.update { it.copy(error = result.message ?: "Search failed") }
                    }
                }
                NetworkResult.Loading -> {
                    // No-op; screen shows global loading when empty.
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

        val query = uiState.value.query.trim()
        if (query.isBlank()) return

        viewModelScope.launch {
            val addon = uiState.value.installedAddons.find { it.id == addonId } ?: run {
                catalogsMap[key] = currentRow.copy(isLoading = false)
                updateCatalogRows()
                return@launch
            }

            val nextSkip = (currentRow.currentPage + 1) * 100
            catalogRepository.getCatalog(
                addonBaseUrl = addon.baseUrl,
                addonId = addon.id,
                addonName = addon.name,
                catalogId = catalogId,
                catalogName = currentRow.catalogName,
                type = currentRow.type.toApiString(),
                skip = nextSkip,
                extraArgs = mapOf("search" to query)
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
                    NetworkResult.Loading -> Unit
                }
            }
        }
    }

    private fun updateCatalogRows() {
        _uiState.update { state ->
            val orderedRows = catalogOrder.mapNotNull { key -> catalogsMap[key] }
            state.copy(
                catalogRows = orderedRows
            )
        }
    }

    private fun buildSearchTargets(addons: List<Addon>): List<Pair<Addon, CatalogDescriptor>> {
        return addons.flatMap { addon ->
            addon.catalogs
                .filter { catalog ->
                    catalog.extra.any { it.name == "search" }
                }
                .map { catalog -> addon to catalog }
        }
    }

    private fun catalogKey(addonId: String, type: String, catalogId: String): String {
        return "${addonId}_${type}_${catalogId}"
    }
}
