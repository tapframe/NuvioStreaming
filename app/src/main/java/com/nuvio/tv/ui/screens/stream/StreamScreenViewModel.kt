package com.nuvio.tv.ui.screens.stream

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.domain.model.Stream
import com.nuvio.tv.domain.repository.StreamRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class StreamScreenViewModel @Inject constructor(
    private val streamRepository: StreamRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val videoId: String = savedStateHandle["videoId"] ?: ""
    private val contentType: String = savedStateHandle["contentType"] ?: ""
    private val title: String = savedStateHandle["title"] ?: ""
    private val poster: String? = savedStateHandle["poster"]
    private val backdrop: String? = savedStateHandle["backdrop"]
    private val logo: String? = savedStateHandle["logo"]
    private val season: Int? = savedStateHandle.get<String>("season")?.toIntOrNull()
    private val episode: Int? = savedStateHandle.get<String>("episode")?.toIntOrNull()
    private val episodeName: String? = savedStateHandle["episodeName"]
    private val genres: String? = savedStateHandle["genres"]
    private val year: String? = savedStateHandle["year"]
    private val contentId: String? = savedStateHandle["contentId"]
    private val contentName: String? = savedStateHandle["contentName"]

    private val _uiState = MutableStateFlow(
        StreamScreenUiState(
            videoId = videoId,
            contentType = contentType,
            title = title,
            poster = poster,
            backdrop = backdrop,
            logo = logo,
            season = season,
            episode = episode,
            episodeName = episodeName,
            genres = genres,
            year = year
        )
    )
    val uiState: StateFlow<StreamScreenUiState> = _uiState.asStateFlow()

    init {
        loadStreams()
    }

    fun onEvent(event: StreamScreenEvent) {
        when (event) {
            is StreamScreenEvent.OnAddonFilterSelected -> filterByAddon(event.addonName)
            is StreamScreenEvent.OnStreamSelected -> { /* Handle stream selection - will be handled in UI */ }
            StreamScreenEvent.OnRetry -> loadStreams()
            StreamScreenEvent.OnBackPress -> { /* Handle in screen */ }
        }
    }

    private fun loadStreams() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            streamRepository.getStreamsFromAllAddons(
                type = contentType,
                videoId = videoId,
                season = season,
                episode = episode
            ).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        val addonStreams = result.data
                        val allStreams = addonStreams.flatMap { it.streams }
                        val availableAddons = addonStreams.map { it.addonName }
                        
                        // Apply current filter if one is selected
                        val currentFilter = _uiState.value.selectedAddonFilter
                        val filteredStreams = if (currentFilter == null) {
                            allStreams
                        } else {
                            allStreams.filter { it.addonName == currentFilter }
                        }

                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                addonStreams = addonStreams,
                                allStreams = allStreams,
                                filteredStreams = filteredStreams,
                                availableAddons = availableAddons,
                                error = null
                            )
                        }
                    }
                    is NetworkResult.Error -> {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = result.message
                            )
                        }
                    }
                    NetworkResult.Loading -> {
                        _uiState.update { it.copy(isLoading = true) }
                    }
                }
            }
        }
    }

    private fun filterByAddon(addonName: String?) {
        val allStreams = _uiState.value.allStreams
        val filteredStreams = if (addonName == null) {
            allStreams
        } else {
            allStreams.filter { it.addonName == addonName }
        }

        _uiState.update {
            it.copy(
                selectedAddonFilter = addonName,
                filteredStreams = filteredStreams
            )
        }
    }

    /**
     * Gets the selected stream for playback
     */
    fun getStreamForPlayback(stream: Stream): StreamPlaybackInfo {
        return StreamPlaybackInfo(
            url = stream.getStreamUrl(),
            title = _uiState.value.title,
            isExternal = stream.isExternal(),
            isTorrent = stream.isTorrent(),
            infoHash = stream.infoHash,
            ytId = stream.ytId,
            headers = stream.behaviorHints?.proxyHeaders?.request,
            contentId = contentId ?: videoId.substringBefore(":"),  // Use explicit contentId or extract from videoId
            contentType = contentType,
            contentName = contentName ?: title,
            poster = poster,
            backdrop = backdrop,
            logo = logo,
            videoId = videoId,
            season = season,
            episode = episode,
            episodeTitle = episodeName
        )
    }
}

data class StreamPlaybackInfo(
    val url: String?,
    val title: String,
    val isExternal: Boolean,
    val isTorrent: Boolean,
    val infoHash: String?,
    val ytId: String?,
    val headers: Map<String, String>?,
    // Watch progress metadata
    val contentId: String?,
    val contentType: String?,
    val contentName: String?,
    val poster: String?,
    val backdrop: String?,
    val logo: String?,
    val videoId: String?,
    val season: Int?,
    val episode: Int?,
    val episodeTitle: String?
)
