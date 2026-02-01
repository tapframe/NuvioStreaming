package com.nuvio.tv.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.data.local.TmdbSettingsDataStore
import com.nuvio.tv.domain.model.TmdbSettings
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class TmdbSettingsViewModel @Inject constructor(
    private val dataStore: TmdbSettingsDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(TmdbSettingsUiState())
    val uiState: StateFlow<TmdbSettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            dataStore.settings.collectLatest { settings ->
                _uiState.update { it.fromSettings(settings) }
            }
        }
    }

    fun onEvent(event: TmdbSettingsEvent) {
        when (event) {
            is TmdbSettingsEvent.ToggleEnabled -> update { dataStore.setEnabled(event.enabled) }
            is TmdbSettingsEvent.ToggleArtwork -> update { dataStore.setUseArtwork(event.enabled) }
            is TmdbSettingsEvent.ToggleBasicInfo -> update { dataStore.setUseBasicInfo(event.enabled) }
            is TmdbSettingsEvent.ToggleDetails -> update { dataStore.setUseDetails(event.enabled) }
            is TmdbSettingsEvent.ToggleCredits -> update { dataStore.setUseCredits(event.enabled) }
            is TmdbSettingsEvent.ToggleProductions -> update { dataStore.setUseProductions(event.enabled) }
            is TmdbSettingsEvent.ToggleNetworks -> update { dataStore.setUseNetworks(event.enabled) }
            is TmdbSettingsEvent.ToggleEpisodes -> update { dataStore.setUseEpisodes(event.enabled) }
        }
    }

    private fun update(action: suspend () -> Unit) {
        viewModelScope.launch { action() }
    }
}

data class TmdbSettingsUiState(
    val enabled: Boolean = true,
    val useArtwork: Boolean = true,
    val useBasicInfo: Boolean = true,
    val useDetails: Boolean = true,
    val useCredits: Boolean = true,
    val useProductions: Boolean = true,
    val useNetworks: Boolean = true,
    val useEpisodes: Boolean = true
) {
    fun fromSettings(settings: TmdbSettings): TmdbSettingsUiState = copy(
        enabled = settings.enabled,
        useArtwork = settings.useArtwork,
        useBasicInfo = settings.useBasicInfo,
        useDetails = settings.useDetails,
        useCredits = settings.useCredits,
        useProductions = settings.useProductions,
        useNetworks = settings.useNetworks,
        useEpisodes = settings.useEpisodes
    )
}

sealed class TmdbSettingsEvent {
    data class ToggleEnabled(val enabled: Boolean) : TmdbSettingsEvent()
    data class ToggleArtwork(val enabled: Boolean) : TmdbSettingsEvent()
    data class ToggleBasicInfo(val enabled: Boolean) : TmdbSettingsEvent()
    data class ToggleDetails(val enabled: Boolean) : TmdbSettingsEvent()
    data class ToggleCredits(val enabled: Boolean) : TmdbSettingsEvent()
    data class ToggleProductions(val enabled: Boolean) : TmdbSettingsEvent()
    data class ToggleNetworks(val enabled: Boolean) : TmdbSettingsEvent()
    data class ToggleEpisodes(val enabled: Boolean) : TmdbSettingsEvent()
}
