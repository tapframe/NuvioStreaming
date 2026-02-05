package com.nuvio.tv.ui.screens.player

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.common.MimeTypes
import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.data.local.LibassRenderType
import com.nuvio.tv.data.local.PlayerSettingsDataStore
import com.nuvio.tv.domain.model.Stream
import com.nuvio.tv.domain.model.Video
import com.nuvio.tv.domain.model.WatchProgress
import com.nuvio.tv.data.repository.ParentalGuideRepository
import com.nuvio.tv.data.repository.SkipIntroRepository
import com.nuvio.tv.data.repository.SkipInterval
import com.nuvio.tv.domain.repository.MetaRepository
import com.nuvio.tv.domain.repository.StreamRepository
import com.nuvio.tv.domain.repository.WatchProgressRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.peerless2012.ass.media.kt.buildWithAssSupport
import io.github.peerless2012.ass.media.type.AssRenderType
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.net.URLDecoder
import javax.inject.Inject

@HiltViewModel
class PlayerViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val watchProgressRepository: WatchProgressRepository,
    private val metaRepository: MetaRepository,
    private val streamRepository: StreamRepository,
    private val parentalGuideRepository: ParentalGuideRepository,
    private val skipIntroRepository: SkipIntroRepository,
    private val playerSettingsDataStore: PlayerSettingsDataStore,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val initialStreamUrl: String = savedStateHandle.get<String>("streamUrl")?.let {
        URLDecoder.decode(it, "UTF-8")
    } ?: ""
    private val title: String = savedStateHandle.get<String>("title")?.let {
        URLDecoder.decode(it, "UTF-8")
    } ?: ""
    private val streamName: String? = savedStateHandle.get<String>("streamName")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val year: String? = savedStateHandle.get<String>("year")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val headersJson: String? = savedStateHandle.get<String>("headers")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }

    // Watch progress metadata
    private val contentId: String? = savedStateHandle.get<String>("contentId")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val contentType: String? = savedStateHandle.get<String>("contentType")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val contentName: String? = savedStateHandle.get<String>("contentName")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val poster: String? = savedStateHandle.get<String>("poster")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val backdrop: String? = savedStateHandle.get<String>("backdrop")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val logo: String? = savedStateHandle.get<String>("logo")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val videoId: String? = savedStateHandle.get<String>("videoId")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }
    private val initialSeason: Int? = savedStateHandle.get<String>("season")?.toIntOrNull()
    private val initialEpisode: Int? = savedStateHandle.get<String>("episode")?.toIntOrNull()
    private val initialEpisodeTitle: String? = savedStateHandle.get<String>("episodeTitle")?.let {
        if (it.isNotEmpty()) URLDecoder.decode(it, "UTF-8") else null
    }

    private var currentStreamUrl: String = initialStreamUrl
    private var currentHeaders: Map<String, String> = parseHeaders(headersJson)
    private var currentVideoId: String? = videoId
    private var currentSeason: Int? = initialSeason
    private var currentEpisode: Int? = initialEpisode
    private var currentEpisodeTitle: String? = initialEpisodeTitle

    private val _uiState = MutableStateFlow(
        PlayerUiState(
            title = title,
            contentName = contentName,
            currentStreamName = streamName,
            releaseYear = year,
            currentSeason = currentSeason,
            currentEpisode = currentEpisode,
            currentEpisodeTitle = currentEpisodeTitle
        )
    )
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    private var _exoPlayer: ExoPlayer? = null
    val exoPlayer: ExoPlayer?
        get() = _exoPlayer

    private var progressJob: Job? = null
    private var hideControlsJob: Job? = null
    private var watchProgressSaveJob: Job? = null
    
    // Track last saved position to avoid redundant saves
    private var lastSavedPosition: Long = 0L
    private val saveThresholdMs = 5000L // Save every 5 seconds of playback change

    // Track whether playback has started (for parental guide trigger)
    private var playbackStartedForParentalGuide = false

    // Skip intro
    private var skipIntervals: List<SkipInterval> = emptyList()
    private var lastActiveSkipType: String? = null
    private var autoSubtitleSelected: Boolean = false

    init {
        initializePlayer(currentStreamUrl, currentHeaders)
        loadSavedProgressFor(currentSeason, currentEpisode)
        fetchParentalGuide(contentId, contentType, currentSeason, currentEpisode)
        fetchSkipIntervals(contentId, currentSeason, currentEpisode)
        observeSubtitleSettings()
    }
    
    private fun observeSubtitleSettings() {
        viewModelScope.launch {
            playerSettingsDataStore.playerSettings.collect { settings ->
                _uiState.update { it.copy(subtitleStyle = settings.subtitleStyle) }
                applySubtitlePreferences(
                    settings.subtitleStyle.preferredLanguage,
                    settings.subtitleStyle.secondaryPreferredLanguage
                )
            }
        }
    }

    private fun loadSavedProgressFor(season: Int?, episode: Int?) {
        if (contentId == null) return
        
        viewModelScope.launch {
            val progress = if (season != null && episode != null) {
                watchProgressRepository.getEpisodeProgress(contentId, season, episode).firstOrNull()
            } else {
                watchProgressRepository.getProgress(contentId).firstOrNull()
            }
            
            progress?.let { saved ->
                // Only seek if we have a meaningful position (more than 2% but less than 90%)
                if (saved.isInProgress()) {
                    _exoPlayer?.let { player ->
                        // Wait for player to be ready before seeking
                        if (player.playbackState == Player.STATE_READY) {
                            player.seekTo(saved.position)
                        } else {
                            // Set a flag to seek when ready
                            _uiState.update { it.copy(pendingSeekPosition = saved.position) }
                        }
                    }
                }
            }
        }
    }

    private fun fetchSkipIntervals(id: String?, season: Int?, episode: Int?) {
        if (id.isNullOrBlank()) return
        val imdbId = id.split(":").firstOrNull()?.takeIf { it.startsWith("tt") } ?: return
        if (season == null || episode == null) return

        viewModelScope.launch {
            val intervals = skipIntroRepository.getSkipIntervals(imdbId, season, episode)
            skipIntervals = intervals
        }
    }

    private fun updateActiveSkipInterval(positionMs: Long) {
        if (skipIntervals.isEmpty()) {
            if (_uiState.value.activeSkipInterval != null) {
                _uiState.update { it.copy(activeSkipInterval = null) }
            }
            return
        }

        val positionSec = positionMs / 1000.0
        val active = skipIntervals.find { interval ->
            positionSec >= interval.startTime && positionSec < (interval.endTime - 0.5)
        }

        val currentActive = _uiState.value.activeSkipInterval

        if (active != null) {
            // New interval or different interval
            if (currentActive == null || active.type != currentActive.type || active.startTime != currentActive.startTime) {
                lastActiveSkipType = active.type
                _uiState.update { it.copy(activeSkipInterval = active, skipIntervalDismissed = false) }
            }
        } else if (currentActive != null) {
            // Exited interval
            _uiState.update { it.copy(activeSkipInterval = null, skipIntervalDismissed = false) }
        }
    }

    private fun tryShowParentalGuide() {
        val state = _uiState.value
        if (!state.parentalGuideHasShown && state.parentalWarnings.isNotEmpty() && !playbackStartedForParentalGuide) {
            playbackStartedForParentalGuide = true
            _uiState.update { it.copy(showParentalGuide = true, parentalGuideHasShown = true) }
        }
    }

    private fun fetchParentalGuide(id: String?, type: String?, season: Int?, episode: Int?) {
        if (id.isNullOrBlank()) return
        // Extract base IMDB ID (contentId may be like "tt1234567:1:2")
        val imdbId = id.split(":").firstOrNull()?.takeIf { it.startsWith("tt") } ?: return

        viewModelScope.launch {
            val response = if (type in listOf("series", "tv") && season != null && episode != null) {
                parentalGuideRepository.getTVGuide(imdbId, season, episode)
            } else {
                parentalGuideRepository.getMovieGuide(imdbId)
            }

            if (response?.parentalGuide != null) {
                val guide = response.parentalGuide
                val labels = mapOf(
                    "nudity" to "Nudity",
                    "violence" to "Violence",
                    "profanity" to "Profanity",
                    "alcohol" to "Alcohol/Drugs",
                    "frightening" to "Frightening"
                )
                val severityOrder = mapOf(
                    "severe" to 0, "moderate" to 1, "mild" to 2
                )

                val entries = listOfNotNull(
                    guide.nudity?.let { "nudity" to it },
                    guide.violence?.let { "violence" to it },
                    guide.profanity?.let { "profanity" to it },
                    guide.alcohol?.let { "alcohol" to it },
                    guide.frightening?.let { "frightening" to it }
                )

                val warnings = entries
                    .filter { it.second.lowercase() != "none" }
                    .map { ParentalWarning(label = labels[it.first] ?: it.first, severity = it.second) }
                    .sortedBy { severityOrder[it.severity.lowercase()] ?: 3 }
                    .take(5)

                _uiState.update {
                    it.copy(
                        parentalWarnings = warnings,
                        showParentalGuide = false,
                        parentalGuideHasShown = false
                    )
                }

                // If playback already started, show now
                if (_uiState.value.isPlaying) {
                    tryShowParentalGuide()
                }
            }
        }
    }

    @OptIn(UnstableApi::class)
    private fun initializePlayer(url: String, headers: Map<String, String>) {
        if (url.isEmpty()) {
            _uiState.update { it.copy(error = "No stream URL provided") }
            return
        }

        viewModelScope.launch {
            try {
                autoSubtitleSelected = false
                val playerSettings = playerSettingsDataStore.playerSettings.first()
                val useLibass = playerSettings.useLibass
                val libassRenderType = playerSettings.libassRenderType.toAssRenderType()

                val renderersFactory = DefaultRenderersFactory(context)
                    .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)

                _exoPlayer = if (useLibass) {
                    // Build ExoPlayer with libass support for ASS/SSA subtitles
                    ExoPlayer.Builder(context)
                        .buildWithAssSupport(
                            context = context,
                            renderType = libassRenderType,
                            renderersFactory = renderersFactory
                        )
                } else {
                    // Standard ExoPlayer without libass
                    ExoPlayer.Builder(context)
                        .setRenderersFactory(renderersFactory)
                        .build()
                }

                _exoPlayer?.apply {
                    val preferred = playerSettings.subtitleStyle.preferredLanguage
                    val secondary = playerSettings.subtitleStyle.secondaryPreferredLanguage
                    applySubtitlePreferences(preferred, secondary)
                    setMediaSource(createMediaSource(url, headers))

                    playWhenReady = true
                    prepare()

                    addListener(object : Player.Listener {
                        override fun onPlaybackStateChanged(playbackState: Int) {
                            val isBuffering = playbackState == Player.STATE_BUFFERING
                            _uiState.update { 
                                it.copy(
                                    isBuffering = isBuffering,
                                    duration = duration.coerceAtLeast(0L)
                                )
                            }
                        
                            // Handle pending seek position when player is ready
                            if (playbackState == Player.STATE_READY) {
                                _uiState.value.pendingSeekPosition?.let { position ->
                                    seekTo(position)
                                    _uiState.update { it.copy(pendingSeekPosition = null) }
                                }
                            }
                        
                            // Save progress when playback ends
                            if (playbackState == Player.STATE_ENDED) {
                                saveWatchProgress()
                            }
                        }

                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            _uiState.update { it.copy(isPlaying = isPlaying) }
                            if (isPlaying) {
                                startProgressUpdates()
                                startWatchProgressSaving()
                                scheduleHideControls()
                                tryShowParentalGuide()
                            } else {
                                stopProgressUpdates()
                                stopWatchProgressSaving()
                                // Save progress when paused
                                saveWatchProgress()
                            }
                        }

                        override fun onTracksChanged(tracks: Tracks) {
                            updateAvailableTracks(tracks)
                        }

                        override fun onPlayerError(error: PlaybackException) {
                            _uiState.update { 
                                it.copy(error = error.message ?: "Playback error occurred")
                            }
                        }
                    })
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to initialize player") }
            }
        }
    }

    /**
     * Convert LibassRenderType to AssRenderType
     */
    private fun LibassRenderType.toAssRenderType(): AssRenderType {
        return when (this) {
            LibassRenderType.CUES -> AssRenderType.CUES
            LibassRenderType.EFFECTS_CANVAS -> AssRenderType.EFFECTS_CANVAS
            LibassRenderType.EFFECTS_OPEN_GL -> AssRenderType.EFFECTS_OPEN_GL
            LibassRenderType.OVERLAY_CANVAS -> AssRenderType.OVERLAY_CANVAS
            LibassRenderType.OVERLAY_OPEN_GL -> AssRenderType.OVERLAY_OPEN_GL
        }
    }

    private fun createMediaSource(url: String, headers: Map<String, String>): MediaSource {
        val dataSourceFactory = DefaultHttpDataSource.Factory().apply {
            setDefaultRequestProperties(headers)
            setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        }

        val isHls = url.contains(".m3u8", ignoreCase = true) ||
            url.contains("/playlist", ignoreCase = true) ||
            url.contains("/hls", ignoreCase = true) ||
            url.contains("m3u8", ignoreCase = true)

        val isDash = url.contains(".mpd", ignoreCase = true) ||
            url.contains("/dash", ignoreCase = true)

        val mediaItemBuilder = MediaItem.Builder().setUri(url)
        when {
            isHls -> mediaItemBuilder.setMimeType(MimeTypes.APPLICATION_M3U8)
            isDash -> mediaItemBuilder.setMimeType(MimeTypes.APPLICATION_MPD)
        }

        val mediaItem = mediaItemBuilder.build()

        return when {
            isHls -> HlsMediaSource.Factory(dataSourceFactory)
                .setAllowChunklessPreparation(true)
                .createMediaSource(mediaItem)
            isDash -> DashMediaSource.Factory(dataSourceFactory)
                .createMediaSource(mediaItem)
            else -> DefaultMediaSourceFactory(dataSourceFactory)
                .createMediaSource(mediaItem)
        }
    }

    private fun parseHeaders(headers: String?): Map<String, String> {
        if (headers.isNullOrEmpty()) return emptyMap()
        
        return try {
            // Simple parsing for key=value&key2=value2 format
            headers.split("&").associate { pair ->
                val parts = pair.split("=", limit = 2)
                if (parts.size == 2) {
                    URLDecoder.decode(parts[0], "UTF-8") to URLDecoder.decode(parts[1], "UTF-8")
                } else {
                    "" to ""
                }
            }.filterKeys { it.isNotEmpty() }
        } catch (e: Exception) {
            emptyMap()
        }
    }

    private fun showEpisodesPanel() {
        _uiState.update {
            it.copy(
                showEpisodesPanel = true,
                showControls = true,
                showAudioDialog = false,
                showSubtitleDialog = false,
                showSpeedDialog = false
            )
        }

        // If episodes are already cached, ensure the selected season matches current playback.
        val desiredSeason = currentSeason ?: _uiState.value.episodesSelectedSeason
        if (_uiState.value.episodesAll.isNotEmpty() && desiredSeason != null) {
            selectEpisodesSeason(desiredSeason)
        } else {
            loadEpisodesIfNeeded()
        }
    }

    private fun showSourcesPanel() {
        _uiState.update {
            it.copy(
                showSourcesPanel = true,
                showControls = true,
                showAudioDialog = false,
                showSubtitleDialog = false,
                showSpeedDialog = false,
                showEpisodesPanel = false,
                showEpisodeStreams = false
            )
        }
        loadSourceStreams()
    }

    private fun loadSourceStreams() {
        val type: String
        val vid: String

        if (contentType in listOf("series", "tv") && currentSeason != null && currentEpisode != null) {
            type = contentType ?: return
            vid = currentVideoId ?: contentId ?: return
        } else {
            type = contentType ?: "movie"
            vid = contentId ?: return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoadingSourceStreams = true,
                    sourceStreamsError = null,
                    sourceAllStreams = emptyList(),
                    sourceSelectedAddonFilter = null,
                    sourceFilteredStreams = emptyList(),
                    sourceAvailableAddons = emptyList()
                )
            }

            streamRepository.getStreamsFromAllAddons(
                type = type,
                videoId = vid,
                season = if (contentType in listOf("series", "tv")) currentSeason else null,
                episode = if (contentType in listOf("series", "tv")) currentEpisode else null
            ).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        val addonStreams = result.data
                        val allStreams = addonStreams.flatMap { it.streams }
                        val availableAddons = addonStreams.map { it.addonName }
                        _uiState.update {
                            it.copy(
                                isLoadingSourceStreams = false,
                                sourceAllStreams = allStreams,
                                sourceSelectedAddonFilter = null,
                                sourceFilteredStreams = allStreams,
                                sourceAvailableAddons = availableAddons,
                                sourceStreamsError = null
                            )
                        }
                    }

                    is NetworkResult.Error -> {
                        _uiState.update {
                            it.copy(
                                isLoadingSourceStreams = false,
                                sourceStreamsError = result.message
                            )
                        }
                    }

                    NetworkResult.Loading -> {
                        _uiState.update { it.copy(isLoadingSourceStreams = true) }
                    }
                }
            }
        }
    }

    private fun dismissSourcesPanel() {
        _uiState.update {
            it.copy(
                showSourcesPanel = false,
                isLoadingSourceStreams = false,
                sourceStreamsError = null,
                sourceAllStreams = emptyList(),
                sourceSelectedAddonFilter = null,
                sourceFilteredStreams = emptyList(),
                sourceAvailableAddons = emptyList()
            )
        }
        scheduleHideControls()
    }

    private fun filterSourceStreamsByAddon(addonName: String?) {
        val allStreams = _uiState.value.sourceAllStreams
        val filteredStreams = if (addonName == null) {
            allStreams
        } else {
            allStreams.filter { it.addonName == addonName }
        }
        _uiState.update {
            it.copy(
                sourceSelectedAddonFilter = addonName,
                sourceFilteredStreams = filteredStreams
            )
        }
    }

    private fun switchToSourceStream(stream: Stream) {
        val url = stream.getStreamUrl()
        if (url.isNullOrBlank()) {
            _uiState.update { it.copy(sourceStreamsError = "Invalid stream URL") }
            return
        }

        saveWatchProgress()

        val newHeaders = stream.behaviorHints?.proxyHeaders?.request ?: emptyMap()
        currentStreamUrl = url
        currentHeaders = newHeaders
        lastSavedPosition = 0L

        _uiState.update {
            it.copy(
                isBuffering = true,
                error = null,
                currentStreamName = stream.name ?: stream.addonName,
                showSourcesPanel = false,
                isLoadingSourceStreams = false,
                sourceStreamsError = null,
                sourceAllStreams = emptyList(),
                sourceSelectedAddonFilter = null,
                sourceFilteredStreams = emptyList(),
                sourceAvailableAddons = emptyList()
            )
        }

        _exoPlayer?.let { player ->
            try {
                player.setMediaSource(createMediaSource(url, newHeaders))
                player.prepare()
                player.playWhenReady = true
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to play selected stream") }
                return
            }
        } ?: run {
            initializePlayer(url, newHeaders)
        }

        loadSavedProgressFor(currentSeason, currentEpisode)
    }

    private fun dismissEpisodesPanel() {
        _uiState.update {
            it.copy(
                showEpisodesPanel = false,
                showEpisodeStreams = false,
                isLoadingEpisodeStreams = false,
                episodeStreamsError = null,
                episodeAllStreams = emptyList(),
                episodeSelectedAddonFilter = null,
                episodeFilteredStreams = emptyList(),
                episodeAvailableAddons = emptyList(),
                episodeStreamsForVideoId = null,
                episodeStreamsSeason = null,
                episodeStreamsEpisode = null,
                episodeStreamsTitle = null
            )
        }
        scheduleHideControls()
    }

    private fun selectEpisodesSeason(season: Int) {
        val all = _uiState.value.episodesAll
        if (all.isEmpty()) return

        val seasons = _uiState.value.episodesAvailableSeasons
        if (seasons.isNotEmpty() && season !in seasons) return

        val episodesForSeason = all
            .filter { (it.season ?: -1) == season }
            .sortedWith(compareBy<Video> { it.episode ?: Int.MAX_VALUE }.thenBy { it.title })

        _uiState.update {
            it.copy(
                episodesSelectedSeason = season,
                episodes = episodesForSeason
            )
        }
    }

    private fun loadEpisodesIfNeeded() {
        val type = contentType
        val id = contentId
        if (type.isNullOrBlank() || id.isNullOrBlank()) return
        if (type !in listOf("series", "tv")) return
        if (_uiState.value.episodesAll.isNotEmpty() || _uiState.value.isLoadingEpisodes) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEpisodes = true, episodesError = null) }

            when (
                val result = metaRepository.getMetaFromAllAddons(type = type, id = id)
                    .first { it !is NetworkResult.Loading }
            ) {
                is NetworkResult.Success -> {
                    val allEpisodes = result.data.videos
                        .sortedWith(
                            compareBy<Video> { it.season ?: Int.MAX_VALUE }
                                .thenBy { it.episode ?: Int.MAX_VALUE }
                                .thenBy { it.title }
                        )

                    val seasons = allEpisodes
                        .mapNotNull { it.season }
                        .distinct()
                        .sorted()

                    val preferredSeason = when {
                        currentSeason != null && seasons.contains(currentSeason) -> currentSeason
                        initialSeason != null && seasons.contains(initialSeason) -> initialSeason
                        else -> seasons.firstOrNull { it > 0 } ?: seasons.firstOrNull() ?: 1
                    }

                    val selectedSeason = preferredSeason ?: 1
                    val episodesForSeason = allEpisodes
                        .filter { (it.season ?: -1) == selectedSeason }
                        .sortedWith(compareBy<Video> { it.episode ?: Int.MAX_VALUE }.thenBy { it.title })

                    _uiState.update {
                        it.copy(
                            isLoadingEpisodes = false,
                            episodesAll = allEpisodes,
                            episodesAvailableSeasons = seasons,
                            episodesSelectedSeason = selectedSeason,
                            episodes = episodesForSeason,
                            episodesError = null
                        )
                    }
                }

                is NetworkResult.Error -> {
                    _uiState.update { it.copy(isLoadingEpisodes = false, episodesError = result.message) }
                }

                NetworkResult.Loading -> {
                    // filtered above
                }
            }
        }
    }

    private fun loadStreamsForEpisode(video: Video) {
        val type = contentType
        if (type.isNullOrBlank()) {
            _uiState.update { it.copy(episodeStreamsError = "Missing content type") }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    showEpisodeStreams = true,
                    isLoadingEpisodeStreams = true,
                    episodeStreamsError = null,
                    episodeAllStreams = emptyList(),
                    episodeSelectedAddonFilter = null,
                    episodeFilteredStreams = emptyList(),
                    episodeAvailableAddons = emptyList(),
                    episodeStreamsForVideoId = video.id,
                    episodeStreamsSeason = video.season,
                    episodeStreamsEpisode = video.episode,
                    episodeStreamsTitle = video.title
                )
            }

            streamRepository.getStreamsFromAllAddons(
                type = type,
                videoId = video.id,
                season = video.season,
                episode = video.episode
            ).collect { result ->
                when (result) {
                    is NetworkResult.Success -> {
                        val addonStreams = result.data
                        val allStreams = addonStreams.flatMap { it.streams }
                        val availableAddons = addonStreams.map { it.addonName }
                        val filteredStreams = allStreams
                        _uiState.update {
                            it.copy(
                                isLoadingEpisodeStreams = false,
                                episodeAllStreams = allStreams,
                                episodeSelectedAddonFilter = null,
                                episodeFilteredStreams = filteredStreams,
                                episodeAvailableAddons = availableAddons,
                                episodeStreamsError = null
                            )
                        }
                    }

                    is NetworkResult.Error -> {
                        _uiState.update {
                            it.copy(
                                isLoadingEpisodeStreams = false,
                                episodeStreamsError = result.message
                            )
                        }
                    }

                    NetworkResult.Loading -> {
                        _uiState.update { it.copy(isLoadingEpisodeStreams = true) }
                    }
                }
            }
        }
    }

    private fun switchToEpisodeStream(stream: Stream) {
        val url = stream.getStreamUrl()
        if (url.isNullOrBlank()) {
            _uiState.update { it.copy(episodeStreamsError = "Invalid stream URL") }
            return
        }

        saveWatchProgress()

        val newHeaders = stream.behaviorHints?.proxyHeaders?.request ?: emptyMap()
        val targetVideo = _uiState.value.episodes.firstOrNull { it.id == _uiState.value.episodeStreamsForVideoId }

        currentStreamUrl = url
        currentHeaders = newHeaders
        currentVideoId = targetVideo?.id ?: _uiState.value.episodeStreamsForVideoId ?: currentVideoId
        currentSeason = targetVideo?.season ?: _uiState.value.episodeStreamsSeason ?: currentSeason
        currentEpisode = targetVideo?.episode ?: _uiState.value.episodeStreamsEpisode ?: currentEpisode
        currentEpisodeTitle = targetVideo?.title ?: _uiState.value.episodeStreamsTitle ?: currentEpisodeTitle

        lastSavedPosition = 0L

        _uiState.update {
            it.copy(
                isBuffering = true,
                error = null,
                currentSeason = currentSeason,
                currentEpisode = currentEpisode,
                currentEpisodeTitle = currentEpisodeTitle,
                currentStreamName = stream.name ?: stream.addonName, // Track the stream source name
                showEpisodesPanel = false,
                showEpisodeStreams = false,
                isLoadingEpisodeStreams = false,
                episodeStreamsError = null,
                episodeAllStreams = emptyList(),
                episodeSelectedAddonFilter = null,
                episodeFilteredStreams = emptyList(),
                episodeAvailableAddons = emptyList(),
                episodeStreamsForVideoId = null,
                episodeStreamsSeason = null,
                episodeStreamsEpisode = null,
                episodeStreamsTitle = null,
                // Reset parental guide for new episode
                parentalWarnings = emptyList(),
                showParentalGuide = false,
                parentalGuideHasShown = false,
                // Reset skip intro
                activeSkipInterval = null,
                skipIntervalDismissed = false
            )
        }

        playbackStartedForParentalGuide = false
        skipIntervals = emptyList()
        lastActiveSkipType = null

        // Fetch parental guide for new episode
        fetchParentalGuide(contentId, contentType, currentSeason, currentEpisode)
        fetchSkipIntervals(contentId, currentSeason, currentEpisode)

        _exoPlayer?.let { player ->
            try {
                player.setMediaSource(createMediaSource(url, newHeaders))
                player.prepare()
                player.playWhenReady = true
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "Failed to play selected stream") }
                return
            }
        } ?: run {
            initializePlayer(url, newHeaders)
        }

        loadSavedProgressFor(currentSeason, currentEpisode)
    }

    private fun updateAvailableTracks(tracks: Tracks) {
        val audioTracks = mutableListOf<TrackInfo>()
        val subtitleTracks = mutableListOf<TrackInfo>()
        var selectedAudioIndex = -1
        var selectedSubtitleIndex = -1

        tracks.groups.forEachIndexed { groupIndex, trackGroup ->
            val trackType = trackGroup.type
            
            when (trackType) {
                C.TRACK_TYPE_AUDIO -> {
                    for (i in 0 until trackGroup.length) {
                        val format = trackGroup.getTrackFormat(i)
                        val isSelected = trackGroup.isTrackSelected(i)
                        if (isSelected) selectedAudioIndex = audioTracks.size
                        
                        audioTracks.add(
                            TrackInfo(
                                index = audioTracks.size,
                                name = format.label ?: "Audio ${audioTracks.size + 1}",
                                language = format.language,
                                isSelected = isSelected
                            )
                        )
                    }
                }
                C.TRACK_TYPE_TEXT -> {
                    for (i in 0 until trackGroup.length) {
                        val format = trackGroup.getTrackFormat(i)
                        val isSelected = trackGroup.isTrackSelected(i)
                        if (isSelected) selectedSubtitleIndex = subtitleTracks.size
                        
                        subtitleTracks.add(
                            TrackInfo(
                                index = subtitleTracks.size,
                                name = format.label ?: format.language ?: "Subtitle ${subtitleTracks.size + 1}",
                                language = format.language,
                                isSelected = isSelected
                            )
                        )
                    }
                }
            }
        }

        if (selectedSubtitleIndex == -1 && subtitleTracks.isNotEmpty() && !autoSubtitleSelected) {
            val preferred = _uiState.value.subtitleStyle.preferredLanguage.lowercase()
            val secondary = _uiState.value.subtitleStyle.secondaryPreferredLanguage?.lowercase()

            fun matchesLanguage(track: TrackInfo, target: String): Boolean {
                val lang = track.language?.lowercase() ?: return false
                return lang == target || lang.startsWith(target) || lang.contains(target)
            }

            val preferredMatch = subtitleTracks.indexOfFirst { matchesLanguage(it, preferred) }
            val secondaryMatch = secondary?.let { target ->
                subtitleTracks.indexOfFirst { matchesLanguage(it, target) }
            } ?: -1

            val autoIndex = when {
                preferredMatch >= 0 -> preferredMatch
                secondaryMatch >= 0 -> secondaryMatch
                else -> 0
            }

            autoSubtitleSelected = true
            selectSubtitleTrack(autoIndex)
            selectedSubtitleIndex = autoIndex
        }

        _uiState.update {
            it.copy(
                audioTracks = audioTracks,
                subtitleTracks = subtitleTracks,
                selectedAudioTrackIndex = selectedAudioIndex,
                selectedSubtitleTrackIndex = selectedSubtitleIndex
            )
        }
    }

    private fun applySubtitlePreferences(preferred: String, secondary: String?) {
        _exoPlayer?.let { player ->
            val builder = player.trackSelectionParameters
                .buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)

            builder.setPreferredTextLanguage(preferred)

            player.trackSelectionParameters = builder.build()
        }
    }

    private fun startProgressUpdates() {
        progressJob?.cancel()
        progressJob = viewModelScope.launch {
            while (isActive) {
                _exoPlayer?.let { player ->
                    val pos = player.currentPosition.coerceAtLeast(0L)
                    _uiState.update {
                        it.copy(
                            currentPosition = pos,
                            duration = player.duration.coerceAtLeast(0L)
                        )
                    }
                    updateActiveSkipInterval(pos)
                }
                delay(500)
            }
        }
    }

    private fun stopProgressUpdates() {
        progressJob?.cancel()
        progressJob = null
    }

    private fun startWatchProgressSaving() {
        watchProgressSaveJob?.cancel()
        watchProgressSaveJob = viewModelScope.launch {
            while (isActive) {
                delay(10000) // Save every 10 seconds
                saveWatchProgressIfNeeded()
            }
        }
    }

    private fun stopWatchProgressSaving() {
        watchProgressSaveJob?.cancel()
        watchProgressSaveJob = null
    }

    private fun saveWatchProgressIfNeeded() {
        val currentPosition = _exoPlayer?.currentPosition ?: return
        val duration = _exoPlayer?.duration ?: return
        
        // Only save if position has changed significantly
        if (kotlin.math.abs(currentPosition - lastSavedPosition) >= saveThresholdMs) {
            lastSavedPosition = currentPosition
            saveWatchProgressInternal(currentPosition, duration)
        }
    }

    private fun saveWatchProgress() {
        val currentPosition = _exoPlayer?.currentPosition ?: return
        val duration = _exoPlayer?.duration ?: return
        saveWatchProgressInternal(currentPosition, duration)
    }

    private fun saveWatchProgressInternal(position: Long, duration: Long) {
        // Don't save if we don't have content metadata
        if (contentId.isNullOrEmpty() || contentType.isNullOrEmpty()) return
        // Don't save if duration is invalid
        if (duration <= 0) return
        // Don't save if position is too early (less than 1 second)
        if (position < 1000) return

        val progress = WatchProgress(
            contentId = contentId,
            contentType = contentType,
            name = contentName ?: title,
            poster = poster,
            backdrop = backdrop,
            logo = logo,
            videoId = currentVideoId ?: contentId,
            season = currentSeason,
            episode = currentEpisode,
            episodeTitle = currentEpisodeTitle,
            position = position,
            duration = duration,
            lastWatched = System.currentTimeMillis()
        )

        viewModelScope.launch {
            watchProgressRepository.saveProgress(progress)
        }
    }

    fun scheduleHideControls() {
        hideControlsJob?.cancel()
        hideControlsJob = viewModelScope.launch {
            delay(3000)
            if (_uiState.value.isPlaying && !_uiState.value.showAudioDialog &&
                !_uiState.value.showSubtitleDialog && !_uiState.value.showSpeedDialog &&
                !_uiState.value.showEpisodesPanel && !_uiState.value.showSourcesPanel) {
                _uiState.update { it.copy(showControls = false) }
            }
        }
    }

    fun hideControls() {
        hideControlsJob?.cancel()
        _uiState.update { it.copy(showControls = false) }
    }

    fun onEvent(event: PlayerEvent) {
        when (event) {
            PlayerEvent.OnPlayPause -> {
                _exoPlayer?.let { player ->
                    if (player.isPlaying) {
                        player.pause()
                    } else {
                        player.play()
                    }
                }
                showControlsTemporarily()
            }
            PlayerEvent.OnSeekForward -> {
                _exoPlayer?.let { player ->
                    player.seekTo((player.currentPosition + 10000).coerceAtMost(player.duration))
                }
                if (_uiState.value.showControls) {
                    scheduleHideControls()
                }
            }
            PlayerEvent.OnSeekBackward -> {
                _exoPlayer?.let { player ->
                    player.seekTo((player.currentPosition - 10000).coerceAtLeast(0))
                }
                if (_uiState.value.showControls) {
                    scheduleHideControls()
                }
            }
            is PlayerEvent.OnSeekTo -> {
                _exoPlayer?.seekTo(event.position)
                if (_uiState.value.showControls) {
                    scheduleHideControls()
                }
            }
            is PlayerEvent.OnSelectAudioTrack -> {
                selectAudioTrack(event.index)
                _uiState.update { it.copy(showAudioDialog = false) }
            }
            is PlayerEvent.OnSelectSubtitleTrack -> {
                selectSubtitleTrack(event.index)
                _uiState.update { it.copy(showSubtitleDialog = false) }
            }
            PlayerEvent.OnDisableSubtitles -> {
                disableSubtitles()
                _uiState.update { it.copy(showSubtitleDialog = false) }
            }
            is PlayerEvent.OnSetPlaybackSpeed -> {
                _exoPlayer?.setPlaybackSpeed(event.speed)
                _uiState.update { 
                    it.copy(playbackSpeed = event.speed, showSpeedDialog = false) 
                }
            }
            PlayerEvent.OnToggleControls -> {
                _uiState.update { it.copy(showControls = !it.showControls) }
                if (_uiState.value.showControls) {
                    scheduleHideControls()
                }
            }
            PlayerEvent.OnShowAudioDialog -> {
                _uiState.update { it.copy(showAudioDialog = true, showControls = true) }
            }
            PlayerEvent.OnShowSubtitleDialog -> {
                _uiState.update { it.copy(showSubtitleDialog = true, showControls = true) }
            }
            PlayerEvent.OnShowSpeedDialog -> {
                _uiState.update { it.copy(showSpeedDialog = true, showControls = true) }
            }
            PlayerEvent.OnShowEpisodesPanel -> {
                showEpisodesPanel()
            }
            PlayerEvent.OnDismissEpisodesPanel -> {
                dismissEpisodesPanel()
            }
            PlayerEvent.OnBackFromEpisodeStreams -> {
                _uiState.update {
                    it.copy(
                        showEpisodeStreams = false,
                        isLoadingEpisodeStreams = false,
                        episodeStreamsError = null,
                        episodeAllStreams = emptyList(),
                        episodeSelectedAddonFilter = null,
                        episodeFilteredStreams = emptyList(),
                        episodeAvailableAddons = emptyList(),
                        episodeStreamsForVideoId = null,
                        episodeStreamsSeason = null,
                        episodeStreamsEpisode = null,
                        episodeStreamsTitle = null
                    )
                }
            }
            is PlayerEvent.OnEpisodeSeasonSelected -> {
                selectEpisodesSeason(event.season)
            }
            is PlayerEvent.OnEpisodeSelected -> {
                loadStreamsForEpisode(event.video)
            }
            is PlayerEvent.OnEpisodeAddonFilterSelected -> {
                filterEpisodeStreamsByAddon(event.addonName)
            }
            is PlayerEvent.OnEpisodeStreamSelected -> {
                switchToEpisodeStream(event.stream)
            }
            PlayerEvent.OnShowSourcesPanel -> {
                showSourcesPanel()
            }
            PlayerEvent.OnDismissSourcesPanel -> {
                dismissSourcesPanel()
            }
            is PlayerEvent.OnSourceAddonFilterSelected -> {
                filterSourceStreamsByAddon(event.addonName)
            }
            is PlayerEvent.OnSourceStreamSelected -> {
                switchToSourceStream(event.stream)
            }
            PlayerEvent.OnDismissDialog -> {
                _uiState.update { 
                    it.copy(
                        showAudioDialog = false, 
                        showSubtitleDialog = false, 
                        showSpeedDialog = false
                    ) 
                }
                scheduleHideControls()
            }
            PlayerEvent.OnRetry -> {
                _uiState.update { it.copy(error = null) }
                releasePlayer()
                initializePlayer(currentStreamUrl, currentHeaders)
            }
            PlayerEvent.OnParentalGuideHide -> {
                _uiState.update { it.copy(showParentalGuide = false) }
            }
            PlayerEvent.OnSkipIntro -> {
                _uiState.value.activeSkipInterval?.let { interval ->
                    _exoPlayer?.seekTo((interval.endTime * 1000).toLong())
                    _uiState.update { it.copy(activeSkipInterval = null, skipIntervalDismissed = true) }
                }
            }
            PlayerEvent.OnDismissSkipIntro -> {
                _uiState.update { it.copy(skipIntervalDismissed = true) }
            }
        }
    }

    private fun filterEpisodeStreamsByAddon(addonName: String?) {
        val allStreams = _uiState.value.episodeAllStreams
        val filteredStreams = if (addonName == null) {
            allStreams
        } else {
            allStreams.filter { it.addonName == addonName }
        }

        _uiState.update {
            it.copy(
                episodeSelectedAddonFilter = addonName,
                episodeFilteredStreams = filteredStreams
            )
        }
    }

    private fun showControlsTemporarily() {
        _uiState.update { it.copy(showControls = true) }
        scheduleHideControls()
    }

    private fun selectAudioTrack(trackIndex: Int) {
        _exoPlayer?.let { player ->
            val tracks = player.currentTracks
            var currentAudioIndex = 0
            
            tracks.groups.forEach { trackGroup ->
                if (trackGroup.type == C.TRACK_TYPE_AUDIO) {
                    for (i in 0 until trackGroup.length) {
                        if (currentAudioIndex == trackIndex) {
                            val override = TrackSelectionOverride(trackGroup.mediaTrackGroup, i)
                            player.trackSelectionParameters = player.trackSelectionParameters
                                .buildUpon()
                                .setOverrideForType(override)
                                .build()
                            return
                        }
                        currentAudioIndex++
                    }
                }
            }
        }
    }

    private fun selectSubtitleTrack(trackIndex: Int) {
        _exoPlayer?.let { player ->
            val tracks = player.currentTracks
            var currentSubIndex = 0
            
            tracks.groups.forEach { trackGroup ->
                if (trackGroup.type == C.TRACK_TYPE_TEXT) {
                    for (i in 0 until trackGroup.length) {
                        if (currentSubIndex == trackIndex) {
                            val override = TrackSelectionOverride(trackGroup.mediaTrackGroup, i)
                            player.trackSelectionParameters = player.trackSelectionParameters
                                .buildUpon()
                                .setOverrideForType(override)
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                                .build()
                            return
                        }
                        currentSubIndex++
                    }
                }
            }
        }
    }

    private fun disableSubtitles() {
        _exoPlayer?.let { player ->
            player.trackSelectionParameters = player.trackSelectionParameters
                .buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
        }
    }

    private fun releasePlayer() {
        // Save progress before releasing
        saveWatchProgress()
        
        progressJob?.cancel()
        hideControlsJob?.cancel()
        watchProgressSaveJob?.cancel()
        _exoPlayer?.release()
        _exoPlayer = null
    }

    override fun onCleared() {
        super.onCleared()
        releasePlayer()
    }
}
