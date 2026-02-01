package com.nuvio.tv.ui.screens.home

import com.nuvio.tv.domain.model.CatalogRow
import com.nuvio.tv.domain.model.WatchProgress

data class HomeUiState(
    val catalogRows: List<CatalogRow> = emptyList(),
    val continueWatchingItems: List<WatchProgress> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val selectedItemId: String? = null
)

sealed class HomeEvent {
    data class OnItemClick(val itemId: String, val itemType: String) : HomeEvent()
    data class OnLoadMoreCatalog(val catalogId: String, val addonId: String, val type: String) : HomeEvent()
    data object OnRetry : HomeEvent()
}
