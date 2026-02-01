package com.nuvio.tv.ui.screens.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.core.tmdb.TmdbMetadataService
import com.nuvio.tv.core.tmdb.TmdbService
import com.nuvio.tv.data.local.LibraryPreferences
import com.nuvio.tv.data.local.TmdbSettingsDataStore
import com.nuvio.tv.domain.model.Meta
import com.nuvio.tv.domain.model.NextToWatch
import com.nuvio.tv.domain.model.SavedLibraryItem
import com.nuvio.tv.domain.model.Video
import com.nuvio.tv.domain.model.WatchProgress
import com.nuvio.tv.domain.repository.MetaRepository
import com.nuvio.tv.domain.repository.WatchProgressRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MetaDetailsViewModel @Inject constructor(
    private val metaRepository: MetaRepository,
    private val tmdbSettingsDataStore: TmdbSettingsDataStore,
    private val tmdbService: TmdbService,
    private val tmdbMetadataService: TmdbMetadataService,
    private val libraryPreferences: LibraryPreferences,
    private val watchProgressRepository: WatchProgressRepository,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val itemId: String = savedStateHandle["itemId"] ?: ""
    private val itemType: String = savedStateHandle["itemType"] ?: ""
    private val preferredAddonBaseUrl: String? = savedStateHandle["addonBaseUrl"]

    private val _uiState = MutableStateFlow(MetaDetailsUiState())
    val uiState: StateFlow<MetaDetailsUiState> = _uiState.asStateFlow()

    init {
        observeLibraryState()
        observeWatchProgress()
        loadMeta()
    }

    fun onEvent(event: MetaDetailsEvent) {
        when (event) {
            is MetaDetailsEvent.OnSeasonSelected -> selectSeason(event.season)
            is MetaDetailsEvent.OnEpisodeClick -> { /* Navigate to stream */ }
            MetaDetailsEvent.OnPlayClick -> { /* Start playback */ }
            MetaDetailsEvent.OnToggleLibrary -> toggleLibrary()
            MetaDetailsEvent.OnRetry -> loadMeta()
            MetaDetailsEvent.OnBackPress -> { /* Handle in screen */ }
        }
    }

    private fun observeLibraryState() {
        viewModelScope.launch {
            libraryPreferences.isInLibrary(itemId = itemId, itemType = itemType)
                .collectLatest { inLibrary ->
                    _uiState.update { it.copy(isInLibrary = inLibrary) }
                }
        }
    }

    private fun observeWatchProgress() {
        viewModelScope.launch {
            watchProgressRepository.getAllEpisodeProgress(itemId).collectLatest { progressMap ->
                _uiState.update { it.copy(episodeProgressMap = progressMap) }
                // Recalculate next to watch when progress changes
                calculateNextToWatch()
            }
        }
    }

    private fun loadMeta() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            // 1) Prefer meta from the originating addon (same catalog source)
            val preferred = preferredAddonBaseUrl?.takeIf { it.isNotBlank() }
            val preferredMeta: Meta? = preferred?.let { baseUrl ->
                when (val result = metaRepository.getMeta(addonBaseUrl = baseUrl, type = itemType, id = itemId)
                    .first { it !is NetworkResult.Loading }) {
                    is NetworkResult.Success -> result.data
                    is NetworkResult.Error -> null
                    NetworkResult.Loading -> null
                }
            }

            if (preferredMeta != null) {
                applyMetaWithEnrichment(preferredMeta)
                return@launch
            }

            // 2) Fallback: first addon that can provide meta (often Cinemeta)
            metaRepository.getMetaFromAllAddons(type = itemType, id = itemId).collect { result ->
                when (result) {
                    is NetworkResult.Success -> applyMetaWithEnrichment(result.data)
                    is NetworkResult.Error -> {
                        _uiState.update { it.copy(isLoading = false, error = result.message) }
                    }
                    NetworkResult.Loading -> {
                        _uiState.update { it.copy(isLoading = true) }
                    }
                }
            }
        }
    }

    private fun applyMeta(meta: Meta) {
        val seasons = meta.videos
            .mapNotNull { it.season }
            .distinct()
            .sorted()

        // Prefer first regular season (> 0), fallback to season 0 (specials)
        val selectedSeason = seasons.firstOrNull { it > 0 } ?: seasons.firstOrNull() ?: 1
        val episodesForSeason = getEpisodesForSeason(meta.videos, selectedSeason)

        _uiState.update {
            it.copy(
                isLoading = false,
                meta = meta,
                seasons = seasons,
                selectedSeason = selectedSeason,
                episodesForSeason = episodesForSeason,
                error = null
            )
        }
        
        // Calculate next to watch after meta is loaded
        calculateNextToWatch()
    }

    private suspend fun applyMetaWithEnrichment(meta: Meta) {
        val enriched = enrichMeta(meta)
        applyMeta(enriched)
    }

    private suspend fun enrichMeta(meta: Meta): Meta {
        val settings = tmdbSettingsDataStore.settings.first()
        if (!settings.enabled) return meta

        val tmdbId = tmdbService.ensureTmdbId(meta.id, meta.type.toApiString())
            ?: tmdbService.ensureTmdbId(itemId, itemType)
            ?: return meta

        val enrichment = tmdbMetadataService.fetchEnrichment(tmdbId, meta.type)

        var updated = meta

        // Group: Artwork (logo, backdrop)
        if (enrichment != null && settings.useArtwork) {
            updated = updated.copy(
                background = enrichment.backdrop ?: updated.background,
                logo = enrichment.logo ?: updated.logo
            )
        }

        // Group: Basic Info (description, genres, rating)
        if (enrichment != null && settings.useBasicInfo) {
            updated = updated.copy(description = enrichment.description ?: updated.description)
            if (enrichment.genres.isNotEmpty()) {
                updated = updated.copy(genres = enrichment.genres)
            }
            updated = updated.copy(imdbRating = enrichment.rating?.toFloat() ?: updated.imdbRating)
        }

        // Group: Details (runtime, release info, country, language)
        if (enrichment != null && settings.useDetails) {
            updated = updated.copy(
                runtime = enrichment.runtimeMinutes?.toString() ?: updated.runtime,
                releaseInfo = enrichment.releaseInfo ?: updated.releaseInfo,
                country = enrichment.countries?.joinToString(", ") ?: updated.country,
                language = enrichment.language ?: updated.language
            )
        }

        // Group: Credits (cast with photos, director, writer)
        if (enrichment != null && settings.useCredits) {
            if (enrichment.castMembers.isNotEmpty()) {
                updated = updated.copy(
                    castMembers = enrichment.castMembers,
                    cast = enrichment.castMembers.map { it.name }
                )
            }
            updated = updated.copy(
                director = if (enrichment.director.isNotEmpty()) enrichment.director else updated.director,
                writer = if (enrichment.writer.isNotEmpty()) enrichment.writer else updated.writer
            )
        }

        // Group: Productions
        if (enrichment != null && settings.useProductions && enrichment.productionCompanies.isNotEmpty()) {
            updated = updated.copy(productionCompanies = enrichment.productionCompanies)
        }

        // Group: Networks
        if (enrichment != null && settings.useNetworks && enrichment.networks.isNotEmpty()) {
            updated = updated.copy(networks = enrichment.networks)
        }

        // Group: Episodes (titles, overviews, thumbnails, runtime)
        if (settings.useEpisodes && meta.type.toApiString() in listOf("series", "tv")) {
            val seasonNumbers = meta.videos.mapNotNull { it.season }.distinct()
            val episodeMap = tmdbMetadataService.fetchEpisodeEnrichment(tmdbId, seasonNumbers)
            if (episodeMap.isNotEmpty()) {
                updated = updated.copy(
                    videos = meta.videos.map { video ->
                        val season = video.season
                        val episode = video.episode
                        val key = if (season != null && episode != null) season to episode else null
                        val ep = key?.let { episodeMap[it] }

                        video.copy(
                            title = ep?.title ?: video.title,
                            overview = ep?.overview ?: video.overview,
                            released = ep?.airDate ?: video.released,
                            thumbnail = ep?.thumbnail ?: video.thumbnail,
                            runtime = ep?.runtimeMinutes
                        )
                    }
                )
            }
        }

        return updated
    }

    private fun selectSeason(season: Int) {
        val episodes = _uiState.value.meta?.videos?.let { getEpisodesForSeason(it, season) } ?: emptyList()
        _uiState.update {
            it.copy(
                selectedSeason = season,
                episodesForSeason = episodes
            )
        }
    }

    private fun getEpisodesForSeason(videos: List<Video>, season: Int): List<Video> {
        return videos
            .filter { it.season == season }
            .sortedBy { it.episode }
    }

    private fun calculateNextToWatch() {
        val meta = _uiState.value.meta ?: return
        val progressMap = _uiState.value.episodeProgressMap
        val isSeries = meta.type.toApiString() in listOf("series", "tv")

        if (!isSeries) {
            // For movies, check if there's an in-progress watch
            viewModelScope.launch {
                val progress = watchProgressRepository.getProgress(itemId).first()
                val nextToWatch = if (progress != null && progress.isInProgress()) {
                    NextToWatch(
                        watchProgress = progress,
                        isResume = true,
                        nextVideoId = meta.id,
                        nextSeason = null,
                        nextEpisode = null,
                        displayText = "Resume"
                    )
                } else {
                    NextToWatch(
                        watchProgress = null,
                        isResume = false,
                        nextVideoId = meta.id,
                        nextSeason = null,
                        nextEpisode = null,
                        displayText = "Play"
                    )
                }
                _uiState.update { it.copy(nextToWatch = nextToWatch) }
            }
            return
        }

        // For series, find the next episode to watch
        val allEpisodes = meta.videos
            .filter { it.season != null && it.episode != null }
            .sortedWith(compareBy({ it.season }, { it.episode }))

        if (allEpisodes.isEmpty()) {
            _uiState.update { 
                it.copy(nextToWatch = NextToWatch(
                    watchProgress = null,
                    isResume = false,
                    nextVideoId = meta.id,
                    nextSeason = null,
                    nextEpisode = null,
                    displayText = "Play"
                ))
            }
            return
        }

        // Find the last watched episode that's in progress or find the next unwatched
        var resumeEpisode: Video? = null
        var resumeProgress: WatchProgress? = null
        var nextUnwatchedEpisode: Video? = null

        for (episode in allEpisodes) {
            val season = episode.season ?: continue
            val ep = episode.episode ?: continue
            val progress = progressMap[season to ep]

            if (progress != null) {
                if (progress.isInProgress()) {
                    // Found an episode in progress - this is the one to resume
                    resumeEpisode = episode
                    resumeProgress = progress
                    break
                } else if (progress.isCompleted()) {
                    // This episode is completed, look for the next one
                    continue
                }
            } else {
                // No progress for this episode - it's the next unwatched
                if (nextUnwatchedEpisode == null) {
                    nextUnwatchedEpisode = episode
                }
                // If we haven't found a resume episode yet and this is first unwatched
                if (resumeEpisode == null) {
                    break
                }
            }
        }

        val nextToWatch = when {
            resumeEpisode != null && resumeProgress != null -> {
                // Resume the in-progress episode
                NextToWatch(
                    watchProgress = resumeProgress,
                    isResume = true,
                    nextVideoId = resumeEpisode.id,
                    nextSeason = resumeEpisode.season,
                    nextEpisode = resumeEpisode.episode,
                    displayText = "Resume S${resumeEpisode.season}E${resumeEpisode.episode}"
                )
            }
            nextUnwatchedEpisode != null -> {
                // Play the next unwatched episode
                val hasWatchedSomething = progressMap.isNotEmpty()
                val displayPrefix = if (hasWatchedSomething) "Next" else "Play"
                NextToWatch(
                    watchProgress = null,
                    isResume = false,
                    nextVideoId = nextUnwatchedEpisode.id,
                    nextSeason = nextUnwatchedEpisode.season,
                    nextEpisode = nextUnwatchedEpisode.episode,
                    displayText = "$displayPrefix S${nextUnwatchedEpisode.season}E${nextUnwatchedEpisode.episode}"
                )
            }
            else -> {
                // All episodes watched or start from beginning
                val firstEpisode = allEpisodes.firstOrNull()
                NextToWatch(
                    watchProgress = null,
                    isResume = false,
                    nextVideoId = firstEpisode?.id ?: meta.id,
                    nextSeason = firstEpisode?.season,
                    nextEpisode = firstEpisode?.episode,
                    displayText = if (firstEpisode != null) {
                        "Play S${firstEpisode.season}E${firstEpisode.episode}"
                    } else {
                        "Play"
                    }
                )
            }
        }

        _uiState.update { it.copy(nextToWatch = nextToWatch) }
    }

    private fun toggleLibrary() {
        val meta = _uiState.value.meta ?: return
        viewModelScope.launch {
            if (_uiState.value.isInLibrary) {
                libraryPreferences.removeItem(itemId = meta.id, itemType = meta.type.toApiString())
            } else {
                libraryPreferences.addItem(meta.toSavedLibraryItem(preferredAddonBaseUrl))
            }
        }
    }

    private fun Meta.toSavedLibraryItem(addonBaseUrl: String?): SavedLibraryItem {
        return SavedLibraryItem(
            id = id,
            type = type.toApiString(),
            name = name,
            poster = poster,
            posterShape = posterShape,
            background = background,
            description = description,
            releaseInfo = releaseInfo,
            imdbRating = imdbRating,
            genres = genres,
            addonBaseUrl = addonBaseUrl
        )
    }

    fun getNextEpisodeInfo(): String? {
        val nextToWatch = _uiState.value.nextToWatch
        return nextToWatch?.displayText
    }
}
