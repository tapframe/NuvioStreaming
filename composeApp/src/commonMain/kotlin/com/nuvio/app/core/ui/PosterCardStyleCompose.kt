package com.nuvio.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember

@Composable
internal fun rememberPosterCardStyleUiState(): PosterCardStyleUiState {
    val uiStateFlow = remember {
        PosterCardStyleRepository.ensureLoaded()
        PosterCardStyleRepository.uiState
    }
    val uiState by uiStateFlow.collectAsState()
    return uiState
}
