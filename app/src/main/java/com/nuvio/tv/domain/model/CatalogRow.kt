package com.nuvio.tv.domain.model

data class CatalogRow(
    val addonId: String,
    val addonName: String,
    val addonBaseUrl: String,
    val catalogId: String,
    val catalogName: String,
    val type: ContentType,
    val items: List<MetaPreview>,
    val isLoading: Boolean = false,
    val hasMore: Boolean = true,
    val currentPage: Int = 0
)
