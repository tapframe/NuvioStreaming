package com.nuvio.tv.ui.screens.addon

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.domain.repository.AddonRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AddonManagerViewModel @Inject constructor(
    private val addonRepository: AddonRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AddonManagerUiState())
    val uiState: StateFlow<AddonManagerUiState> = _uiState.asStateFlow()

    init {
        observeInstalledAddons()
    }

    fun onInstallUrlChange(url: String) {
        _uiState.update { it.copy(installUrl = url, error = null) }
    }

    fun installAddon() {
        val rawUrl = uiState.value.installUrl.trim()
        if (rawUrl.isBlank()) {
            _uiState.update { it.copy(error = "Enter a valid addon URL") }
            return
        }

        val normalizedUrl = normalizeAddonUrl(rawUrl)
        if (normalizedUrl == null) {
            _uiState.update { it.copy(error = "Addon URL must start with http or https") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isInstalling = true, error = null) }

            when (val result = addonRepository.fetchAddon(normalizedUrl)) {
                is NetworkResult.Success -> {
                    addonRepository.addAddon(normalizedUrl)
                    _uiState.update { it.copy(isInstalling = false, installUrl = "") }
                }
                is NetworkResult.Error -> {
                    _uiState.update {
                        it.copy(
                            isInstalling = false,
                            error = result.message ?: "Unable to install addon"
                        )
                    }
                }
                NetworkResult.Loading -> {
                    _uiState.update { it.copy(isInstalling = true) }
                }
            }
        }
    }

    private fun normalizeAddonUrl(input: String): String? {
        val trimmed = input.trim()
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            return null
        }

        val withoutManifest = if (trimmed.endsWith("/manifest.json")) {
            trimmed.removeSuffix("/manifest.json")
        } else {
            trimmed
        }

        return withoutManifest.trimEnd('/')
    }

    fun removeAddon(baseUrl: String) {
        viewModelScope.launch {
            addonRepository.removeAddon(baseUrl)
        }
    }

    private fun observeInstalledAddons() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            addonRepository.getInstalledAddons()
                .catch { error ->
                    _uiState.update { it.copy(isLoading = false, error = error.message) }
                }
                .collect { addons ->
                    _uiState.update { state ->
                        state.copy(
                            installedAddons = addons,
                            isLoading = false,
                            error = null
                        )
                    }
                }
        }
    }
}
