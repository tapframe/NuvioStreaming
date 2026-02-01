package com.nuvio.tv.ui.screens.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.data.local.LibraryPreferences
import com.nuvio.tv.domain.model.SavedLibraryItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class LibraryViewModel @Inject constructor(
    libraryPreferences: LibraryPreferences
) : ViewModel() {

    val uiState: StateFlow<LibraryUiState> = libraryPreferences.libraryItems
        .map { items -> LibraryUiState(items = items) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            LibraryUiState()
        )
}

data class LibraryUiState(
    val items: List<SavedLibraryItem> = emptyList()
)
