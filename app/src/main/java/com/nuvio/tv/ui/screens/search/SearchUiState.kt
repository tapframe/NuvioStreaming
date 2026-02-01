package com.nuvio.tv.ui.screens.search

import com.nuvio.tv.domain.model.Addon
import com.nuvio.tv.domain.model.CatalogRow

data class SearchUiState(
    val query: String = "",
    val isSearching: Boolean = false,
    val error: String? = null,
    val catalogRows: List<CatalogRow> = emptyList(),
    val installedAddons: List<Addon> = emptyList()
)
