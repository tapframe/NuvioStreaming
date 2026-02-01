package com.nuvio.tv.ui.screens.stream

import com.nuvio.tv.domain.model.AddonStreams
import com.nuvio.tv.domain.model.Stream

data class StreamScreenUiState(
    val isLoading: Boolean = true,
    val videoId: String = "",
    val contentType: String = "",
    val title: String = "",
    val poster: String? = null,
    val backdrop: String? = null,
    val logo: String? = null,
    // Episode-specific fields
    val season: Int? = null,
    val episode: Int? = null,
    val episodeName: String? = null,
    // Movie-specific fields
    val genres: String? = null,
    val year: String? = null,
    val addonStreams: List<AddonStreams> = emptyList(),
    val allStreams: List<Stream> = emptyList(),
    val selectedAddonFilter: String? = null, // null means "All"
    val filteredStreams: List<Stream> = emptyList(),
    val availableAddons: List<String> = emptyList(),
    val error: String? = null
) {
    val isEpisode: Boolean get() = season != null && episode != null
}

sealed class StreamScreenEvent {
    data class OnAddonFilterSelected(val addonName: String?) : StreamScreenEvent()
    data class OnStreamSelected(val stream: Stream) : StreamScreenEvent()
    data object OnRetry : StreamScreenEvent()
    data object OnBackPress : StreamScreenEvent()
}
