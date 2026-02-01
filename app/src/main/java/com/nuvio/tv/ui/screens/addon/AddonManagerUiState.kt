package com.nuvio.tv.ui.screens.addon

import com.nuvio.tv.domain.model.Addon

data class AddonManagerUiState(
    val isLoading: Boolean = false,
    val isInstalling: Boolean = false,
    val installUrl: String = "",
    val installedAddons: List<Addon> = emptyList(),
    val error: String? = null
)
