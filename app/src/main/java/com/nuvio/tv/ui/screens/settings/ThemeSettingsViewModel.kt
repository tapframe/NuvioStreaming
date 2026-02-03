package com.nuvio.tv.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.data.local.ThemeDataStore
import com.nuvio.tv.domain.model.AppTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ThemeSettingsUiState(
    val selectedTheme: AppTheme = AppTheme.CRIMSON,
    val availableThemes: List<AppTheme> = AppTheme.entries
)

sealed class ThemeSettingsEvent {
    data class SelectTheme(val theme: AppTheme) : ThemeSettingsEvent()
}

@HiltViewModel
class ThemeSettingsViewModel @Inject constructor(
    private val themeDataStore: ThemeDataStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(ThemeSettingsUiState())
    val uiState: StateFlow<ThemeSettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            themeDataStore.selectedTheme.collectLatest { theme ->
                _uiState.update { it.copy(selectedTheme = theme) }
            }
        }
    }

    fun onEvent(event: ThemeSettingsEvent) {
        when (event) {
            is ThemeSettingsEvent.SelectTheme -> selectTheme(event.theme)
        }
    }

    private fun selectTheme(theme: AppTheme) {
        viewModelScope.launch {
            themeDataStore.setTheme(theme)
        }
    }
}
