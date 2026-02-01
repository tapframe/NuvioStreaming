package com.nuvio.tv.ui.screens.plugin

import com.nuvio.tv.domain.model.LocalScraperResult
import com.nuvio.tv.domain.model.PluginRepository
import com.nuvio.tv.domain.model.ScraperInfo

data class PluginUiState(
    val pluginsEnabled: Boolean = true,
    val repositories: List<PluginRepository> = emptyList(),
    val scrapers: List<ScraperInfo> = emptyList(),
    val isLoading: Boolean = false,
    val isAddingRepo: Boolean = false,
    val isTesting: Boolean = false,
    val testResults: List<LocalScraperResult>? = null,
    val testScraperId: String? = null,
    val errorMessage: String? = null,
    val successMessage: String? = null
)

sealed interface PluginUiEvent {
    data class AddRepository(val url: String) : PluginUiEvent
    data class RemoveRepository(val repoId: String) : PluginUiEvent
    data class RefreshRepository(val repoId: String) : PluginUiEvent
    data class ToggleScraper(val scraperId: String, val enabled: Boolean) : PluginUiEvent
    data class TestScraper(val scraperId: String) : PluginUiEvent
    data class SetPluginsEnabled(val enabled: Boolean) : PluginUiEvent
    object ClearTestResults : PluginUiEvent
    object ClearError : PluginUiEvent
    object ClearSuccess : PluginUiEvent
}
