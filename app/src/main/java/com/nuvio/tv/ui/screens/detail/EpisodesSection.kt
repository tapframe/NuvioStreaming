package com.nuvio.tv.ui.screens.detail

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.nuvio.tv.domain.model.Video
import com.nuvio.tv.ui.components.FadeInAsyncImage
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.theme.NuvioTheme

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SeasonTabs(
    seasons: List<Int>,
    selectedSeason: Int,
    onSeasonSelected: (Int) -> Unit,
    selectedTabFocusRequester: FocusRequester
) {
    // Move season 0 (specials) to the end
    val sortedSeasons = remember(seasons) {
        val regularSeasons = seasons.filter { it > 0 }.sorted()
        val specials = seasons.filter { it == 0 }
        regularSeasons + specials
    }

    TvLazyRow(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 48.dp, vertical = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(sortedSeasons, key = { it }) { season ->
            val isSelected = season == selectedSeason
            var isFocused by remember { mutableStateOf(false) }

            Card(
                onClick = { onSeasonSelected(season) },
                modifier = Modifier
                    .then(if (isSelected) Modifier.focusRequester(selectedTabFocusRequester) else Modifier)
                    .onFocusChanged {
                    val nowFocused = it.isFocused
                    isFocused = nowFocused
                    if (nowFocused && !isSelected) {
                        onSeasonSelected(season)
                    }
                },
                shape = CardDefaults.shape(
                    shape = RoundedCornerShape(20.dp)
                ),
                colors = CardDefaults.colors(
                    containerColor = if (isSelected) NuvioColors.SurfaceVariant else NuvioColors.BackgroundCard,
                    focusedContainerColor = NuvioColors.Secondary
                ),
                border = CardDefaults.border(
                    focusedBorder = Border(
                        border = BorderStroke(2.dp, NuvioColors.FocusRing),
                        shape = RoundedCornerShape(20.dp)
                    )
                ),
                scale = CardDefaults.scale(focusedScale = 1.0f)
            ) {
                Text(
                    text = if (season == 0) "Specials" else "Season $season",
                    style = MaterialTheme.typography.titleMedium,
                    color = when {
                        isFocused -> NuvioColors.OnPrimary
                        isSelected -> NuvioColors.TextPrimary
                        else -> NuvioTheme.extendedColors.textSecondary
                    },
                    modifier = Modifier.padding(vertical = 10.dp, horizontal = 20.dp)
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun EpisodesRow(
    episodes: List<Video>,
    episodeProgressMap: Map<Pair<Int, Int>, com.nuvio.tv.domain.model.WatchProgress> = emptyMap(),
    onEpisodeClick: (Video) -> Unit,
    upFocusRequester: FocusRequester
) {
    TvLazyRow(
        modifier = Modifier
            .fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 48.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(episodes, key = { it.id }) { episode ->
            val progress = episode.season?.let { s ->
                episode.episode?.let { e ->
                    episodeProgressMap[s to e]
                }
            }
            EpisodeCard(
                episode = episode,
                watchProgress = progress,
                onClick = { onEpisodeClick(episode) },
                upFocusRequester = upFocusRequester
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun EpisodeCard(
    episode: Video,
    watchProgress: com.nuvio.tv.domain.model.WatchProgress? = null,
    onClick: () -> Unit,
    upFocusRequester: FocusRequester
) {
    val formattedDate = remember(episode.released) {
        episode.released?.let { formatReleaseDate(it) } ?: ""
    }

    Card(
        onClick = onClick,
        modifier = Modifier
            .width(280.dp)
            .focusProperties { up = upFocusRequester },
        shape = CardDefaults.shape(
            shape = RoundedCornerShape(8.dp)
        ),
        colors = CardDefaults.colors(
            containerColor = NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.FocusBackground
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(8.dp)
            )
        ),
        scale = CardDefaults.scale(
            focusedScale = 1.02f
        )
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(158.dp)
                    .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
            ) {
                FadeInAsyncImage(
                    model = episode.thumbnail,
                    contentDescription = episode.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )

                // Show watched/in-progress indicator
                val indicatorColor = when {
                    watchProgress?.isCompleted() == true -> NuvioColors.Primary.copy(alpha = 0.8f)
                    watchProgress?.isInProgress() == true -> NuvioColors.Primary
                    else -> NuvioColors.Primary
                }
                
                val indicatorText = when {
                    watchProgress?.isCompleted() == true -> "✓"
                    watchProgress?.isInProgress() == true -> "◉"
                    else -> "◉"
                }

                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(NuvioColors.Background.copy(alpha = 0.8f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = indicatorText,
                        style = MaterialTheme.typography.labelSmall,
                        color = indicatorColor
                    )
                }

                // Progress bar overlay at bottom of thumbnail
                watchProgress?.let { progress ->
                    if (progress.isInProgress()) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .fillMaxWidth()
                                .height(4.dp)
                                .background(NuvioColors.Background.copy(alpha = 0.5f))
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(progress.progressPercentage)
                                    .height(4.dp)
                                    .background(NuvioColors.Primary)
                            )
                        }
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "S${episode.season?.toString()?.padStart(2, '0')}E${episode.episode?.toString()?.padStart(2, '0')} - $formattedDate",
                        style = MaterialTheme.typography.labelSmall,
                        color = NuvioTheme.extendedColors.textSecondary
                    )
                    
                    episode.runtime?.let { runtime ->
                        Text(
                            text = "${runtime}m",
                            style = MaterialTheme.typography.labelSmall,
                            color = NuvioTheme.extendedColors.textTertiary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = episode.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = NuvioColors.TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                episode.overview?.let { overview ->
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = overview,
                        style = MaterialTheme.typography.bodySmall,
                        color = NuvioTheme.extendedColors.textSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}
