package com.nuvio.tv.ui.screens.search

sealed interface SearchEvent {
    data class QueryChanged(val query: String) : SearchEvent

    data class LoadMoreCatalog(
        val catalogId: String,
        val addonId: String,
        val type: String
    ) : SearchEvent

    data object Retry : SearchEvent
}
