package com.nuvio.tv.ui.screens.plugin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.core.plugin.PluginManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class PluginViewModel @Inject constructor(
    private val pluginManager: PluginManager
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(PluginUiState())
    val uiState: StateFlow<PluginUiState> = _uiState.asStateFlow()
    
    init {
        observePluginData()
    }
    
    private fun observePluginData() {
        viewModelScope.launch {
            pluginManager.pluginsEnabled.collect { enabled ->
                _uiState.update { it.copy(pluginsEnabled = enabled) }
            }
        }
        
        viewModelScope.launch {
            pluginManager.repositories.collect { repos ->
                _uiState.update { it.copy(repositories = repos) }
            }
        }
        
        viewModelScope.launch {
            pluginManager.scrapers.collect { scraperList ->
                _uiState.update { it.copy(scrapers = scraperList) }
            }
        }
    }
    
    fun onEvent(event: PluginUiEvent) {
        when (event) {
            is PluginUiEvent.AddRepository -> addRepository(event.url)
            is PluginUiEvent.RemoveRepository -> removeRepository(event.repoId)
            is PluginUiEvent.RefreshRepository -> refreshRepository(event.repoId)
            is PluginUiEvent.ToggleScraper -> toggleScraper(event.scraperId, event.enabled)
            is PluginUiEvent.TestScraper -> testScraper(event.scraperId)
            is PluginUiEvent.SetPluginsEnabled -> setPluginsEnabled(event.enabled)
            PluginUiEvent.ClearTestResults -> _uiState.update { it.copy(testResults = null, testScraperId = null) }
            PluginUiEvent.ClearError -> _uiState.update { it.copy(errorMessage = null) }
            PluginUiEvent.ClearSuccess -> _uiState.update { it.copy(successMessage = null) }
        }
    }
    
    private fun addRepository(url: String) {
        if (url.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Please enter a valid URL") }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(isAddingRepo = true, errorMessage = null) }
            
            val result = pluginManager.addRepository(url)
            
            result.fold(
                onSuccess = { repo ->
                    _uiState.update { 
                        it.copy(
                            isAddingRepo = false, 
                            successMessage = "Added ${repo.name} with ${repo.scraperCount} providers"
                        ) 
                    }
                },
                onFailure = { e ->
                    _uiState.update { 
                        it.copy(
                            isAddingRepo = false, 
                            errorMessage = "Failed to add repository: ${e.message}"
                        ) 
                    }
                }
            )
        }
    }
    
    private fun removeRepository(repoId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            pluginManager.removeRepository(repoId)
            _uiState.update { it.copy(isLoading = false, successMessage = "Repository removed") }
        }
    }
    
    private fun refreshRepository(repoId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            val result = pluginManager.refreshRepository(repoId)
            
            result.fold(
                onSuccess = {
                    _uiState.update { it.copy(isLoading = false, successMessage = "Repository refreshed") }
                },
                onFailure = { e ->
                    _uiState.update { 
                        it.copy(
                            isLoading = false, 
                            errorMessage = "Failed to refresh: ${e.message}"
                        ) 
                    }
                }
            )
        }
    }
    
    private fun toggleScraper(scraperId: String, enabled: Boolean) {
        viewModelScope.launch {
            pluginManager.toggleScraper(scraperId, enabled)
        }
    }
    
    private fun setPluginsEnabled(enabled: Boolean) {
        viewModelScope.launch {
            pluginManager.setPluginsEnabled(enabled)
        }
    }
    
    private fun testScraper(scraperId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isTesting = true, testScraperId = scraperId, testResults = null) }
            
            val result = pluginManager.testScraper(scraperId)
            
            result.fold(
                onSuccess = { results ->
                    _uiState.update { 
                        it.copy(
                            isTesting = false, 
                            testResults = results,
                            successMessage = if (results.isEmpty()) "No results found" else "Found ${results.size} streams"
                        ) 
                    }
                },
                onFailure = { e ->
                    _uiState.update { 
                        it.copy(
                            isTesting = false, 
                            testResults = emptyList(),
                            errorMessage = "Test failed: ${e.message}"
                        ) 
                    }
                }
            )
        }
    }
}
