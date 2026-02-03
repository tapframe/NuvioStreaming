package com.nuvio.tv.ui.screens.detail

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.rememberTvLazyListState
import androidx.tv.material3.ExperimentalTvMaterial3Api
import com.nuvio.tv.domain.model.ContentType
import com.nuvio.tv.domain.model.Meta
import com.nuvio.tv.domain.model.MetaCastMember
import com.nuvio.tv.domain.model.NextToWatch
import com.nuvio.tv.domain.model.Video
import com.nuvio.tv.domain.model.WatchProgress
import com.nuvio.tv.ui.components.ErrorState
import com.nuvio.tv.ui.components.FadeInAsyncImage
import com.nuvio.tv.ui.components.LoadingIndicator
import com.nuvio.tv.ui.theme.NuvioColors

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun MetaDetailsScreen(
    viewModel: MetaDetailsViewModel = hiltViewModel(),
    onBackPress: () -> Unit,
    onPlayClick: (
        videoId: String,
        contentType: String,
        contentId: String,
        title: String,
        poster: String?,
        backdrop: String?,
        logo: String?,
        season: Int?,
        episode: Int?,
        episodeName: String?,
        genres: String?,
        year: String?
    ) -> Unit = { _, _, _, _, _, _, _, _, _, _, _, _ -> }
) {
    val uiState by viewModel.uiState.collectAsState()

    BackHandler {
        onBackPress()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(NuvioColors.Background)
    ) {
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    LoadingIndicator()
                }
            }
            uiState.error != null -> {
                ErrorState(
                    message = uiState.error ?: "An error occurred",
                    onRetry = { viewModel.onEvent(MetaDetailsEvent.OnRetry) }
                )
            }
            uiState.meta != null -> {
                val meta = uiState.meta!!
                val genresString = meta.genres.takeIf { it.isNotEmpty() }?.joinToString(" • ")
                val yearString = meta.releaseInfo
                
                MetaDetailsContent(
                    meta = meta,
                    seasons = uiState.seasons,
                    selectedSeason = uiState.selectedSeason,
                    episodesForSeason = uiState.episodesForSeason,
                    isInLibrary = uiState.isInLibrary,
                    nextToWatch = uiState.nextToWatch,
                    episodeProgressMap = uiState.episodeProgressMap,
                    onSeasonSelected = { viewModel.onEvent(MetaDetailsEvent.OnSeasonSelected(it)) },
                    onEpisodeClick = { video ->
                        // Navigate to stream screen for episode
                        onPlayClick(
                            video.id,
                            meta.type.toApiString(),
                            meta.id,
                            meta.name,
                            video.thumbnail ?: meta.poster,
                            meta.background,
                            meta.logo,
                            video.season,
                            video.episode,
                            video.title,
                            null,
                            null
                        )
                    },
                    onPlayClick = { videoId ->
                        // Navigate to stream screen for movie
                        onPlayClick(
                            videoId,
                            meta.type.toApiString(),
                            meta.id,
                            meta.name,
                            meta.poster,
                            meta.background,
                            meta.logo,
                            null,
                            null,
                            null,
                            genresString,
                            yearString
                        )
                    },
                    onToggleLibrary = { viewModel.onEvent(MetaDetailsEvent.OnToggleLibrary) }
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun MetaDetailsContent(
    meta: Meta,
    seasons: List<Int>,
    selectedSeason: Int,
    episodesForSeason: List<Video>,
    isInLibrary: Boolean,
    nextToWatch: NextToWatch?,
    episodeProgressMap: Map<Pair<Int, Int>, WatchProgress>,
    onSeasonSelected: (Int) -> Unit,
    onEpisodeClick: (Video) -> Unit,
    onPlayClick: (String) -> Unit,
    onToggleLibrary: () -> Unit
) {
    val isSeries = meta.type == ContentType.SERIES || meta.videos.isNotEmpty()
    val nextEpisode = episodesForSeason.firstOrNull()
    val listState = rememberTvLazyListState()
    val selectedSeasonFocusRequester = remember { FocusRequester() }

    // Track if scrolled past hero (first item)
    val isScrolledPastHero by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex > 0 ||
            (listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset > 200)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Sticky background image - stays fixed in place while content scrolls
        Box(modifier = Modifier.fillMaxSize()) {
            FadeInAsyncImage(
                model = meta.background ?: meta.poster,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                fadeDurationMs = 600
            )

            // Light global dim so text remains readable
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(NuvioColors.Background.copy(alpha = 0.08f))
            )

            // Left side gradient fade for text readability
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.horizontalGradient(
                            colorStops = arrayOf(
                                0.0f to NuvioColors.Background,
                                0.20f to NuvioColors.Background.copy(alpha = 0.95f),
                                0.35f to NuvioColors.Background.copy(alpha = 0.8f),
                                0.45f to NuvioColors.Background.copy(alpha = 0.6f),
                                0.55f to NuvioColors.Background.copy(alpha = 0.4f),
                                0.65f to NuvioColors.Background.copy(alpha = 0.2f),
                                0.75f to Color.Transparent,
                                1.0f to Color.Transparent
                            )
                        )
                    )
            )

            // Bottom gradient when scrolled past hero
            if (isScrolledPastHero) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colorStops = arrayOf(
                                    0.0f to Color.Transparent,
                                    0.5f to Color.Transparent,
                                    0.7f to NuvioColors.Background.copy(alpha = 0.5f),
                                    0.85f to NuvioColors.Background.copy(alpha = 0.8f),
                                    1.0f to NuvioColors.Background
                                )
                            )
                        )
                )
            }
        }

        // Single scrollable column with hero + content
        TvLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = listState
        ) {
            // Hero as first item in the lazy column
            item {
                HeroContentSection(
                    meta = meta,
                    nextEpisode = nextEpisode,
                    nextToWatch = nextToWatch,
                    onPlayClick = {
                        // Use nextToWatch's video ID if available, otherwise fall back to logic
                        val videoId = nextToWatch?.nextVideoId ?: if (isSeries && nextEpisode != null) {
                            nextEpisode.id
                        } else {
                            meta.id
                        }
                        onPlayClick(videoId)
                    },
                    isInLibrary = isInLibrary,
                    onToggleLibrary = onToggleLibrary
                )
            }

            // Season tabs and episodes for series
            if (isSeries && seasons.isNotEmpty()) {
                item {
                    SeasonTabs(
                        seasons = seasons,
                        selectedSeason = selectedSeason,
                        onSeasonSelected = onSeasonSelected,
                        selectedTabFocusRequester = selectedSeasonFocusRequester
                    )
                }
                item {
                    EpisodesRow(
                        episodes = episodesForSeason,
                        episodeProgressMap = episodeProgressMap,
                        onEpisodeClick = onEpisodeClick,
                        upFocusRequester = selectedSeasonFocusRequester
                    )
                }
            }

            // Cast section below episodes
                val castMembersToShow = if (meta.castMembers.isNotEmpty()) {
                    meta.castMembers
                } else {
                    meta.cast.map { name -> MetaCastMember(name = name) }
                }

                if (castMembersToShow.isNotEmpty()) {
                item {
                        CastSection(cast = castMembersToShow)
                }
            }

                if (meta.productionCompanies.isNotEmpty()) {
                    item {
                        CompanyLogosSection(
                            title = "Production",
                            companies = meta.productionCompanies
                        )
                    }
                }

                if (meta.networks.isNotEmpty()) {
                    item {
                        CompanyLogosSection(
                            title = "Network",
                            companies = meta.networks
                        )
                    }
                }
        }
    }
}
