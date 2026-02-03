@file:OptIn(androidx.tv.material3.ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Border
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.FilterChip
import androidx.tv.material3.FilterChipDefaults
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.compose.foundation.BorderStroke
import com.nuvio.tv.domain.model.Stream
import com.nuvio.tv.domain.model.Video
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.theme.NuvioTheme
import com.nuvio.tv.ui.components.LoadingIndicator
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
internal fun EpisodesSidePanel(
    uiState: PlayerUiState,
    episodesFocusRequester: FocusRequester,
    streamsFocusRequester: FocusRequester,
    onClose: () -> Unit,
    onBackToEpisodes: () -> Unit,
    onAddonFilterSelected: (String?) -> Unit,
    onEpisodeSelected: (Video) -> Unit,
    onStreamSelected: (Stream) -> Unit
) {
    LaunchedEffect(
        uiState.showEpisodeStreams,
        uiState.episodes.size,
        uiState.episodeFilteredStreams.size
    ) {
        try {
            if (uiState.showEpisodeStreams) {
                streamsFocusRequester.requestFocus()
            } else {
                episodesFocusRequester.requestFocus()
            }
        } catch (_: Exception) {
            // Focus requester may not be ready yet
        }
    }

    // Scrim + right panel
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.45f))
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .fillMaxHeight()
                .width(520.dp)
                .clip(RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp))
                .background(NuvioColors.BackgroundElevated)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (uiState.showEpisodeStreams) "Streams" else "Episodes",
                        style = MaterialTheme.typography.headlineSmall,
                        color = NuvioColors.TextPrimary
                    )

                    DialogButton(
                        text = "Close",
                        onClick = onClose,
                        isPrimary = false
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (uiState.showEpisodeStreams) {
                    EpisodeStreamsView(
                        uiState = uiState,
                        streamsFocusRequester = streamsFocusRequester,
                        onBackToEpisodes = onBackToEpisodes,
                        onAddonFilterSelected = onAddonFilterSelected,
                        onStreamSelected = onStreamSelected
                    )
                } else {
                    EpisodesListView(
                        uiState = uiState,
                        episodesFocusRequester = episodesFocusRequester,
                        onEpisodeSelected = onEpisodeSelected
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun EpisodeStreamsView(
    uiState: PlayerUiState,
    streamsFocusRequester: FocusRequester,
    onBackToEpisodes: () -> Unit,
    onAddonFilterSelected: (String?) -> Unit,
    onStreamSelected: (Stream) -> Unit
) {
    // Streams for selected episode
    Row(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        DialogButton(
            text = "Back",
            onClick = onBackToEpisodes,
            isPrimary = false
        )

        val season = uiState.episodeStreamsSeason
        val episode = uiState.episodeStreamsEpisode
        val title = uiState.episodeStreamsTitle
        Text(
            text = buildString {
                if (season != null && episode != null) append("S$season E$episode")
                if (!title.isNullOrBlank()) {
                    if (isNotEmpty()) append(" • ")
                    append(title)
                }
            },
            style = MaterialTheme.typography.bodyLarge,
            color = NuvioTheme.extendedColors.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }

    Spacer(modifier = Modifier.height(16.dp))

    AnimatedVisibility(
        visible = !uiState.isLoadingEpisodeStreams && uiState.episodeAvailableAddons.isNotEmpty(),
        enter = fadeIn(animationSpec = tween(200)),
        exit = fadeOut(animationSpec = tween(120))
    ) {
        AddonFilterChips(
            addons = uiState.episodeAvailableAddons,
            selectedAddon = uiState.episodeSelectedAddonFilter,
            onAddonSelected = onAddonFilterSelected
        )
    }

    Spacer(modifier = Modifier.height(16.dp))

    when {
        uiState.isLoadingEpisodeStreams -> {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                LoadingIndicator()
            }
        }

        uiState.episodeStreamsError != null -> {
            Text(
                text = uiState.episodeStreamsError ?: "Failed to load streams",
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.85f)
            )
        }

        uiState.episodeFilteredStreams.isEmpty() -> {
            Text(
                text = "No streams found",
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.7f)
            )
        }

        else -> {
            TvLazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxHeight()
            ) {
                items(uiState.episodeFilteredStreams) { stream ->
                    StreamItem(
                        stream = stream,
                        focusRequester = streamsFocusRequester,
                        requestInitialFocus = stream == uiState.episodeFilteredStreams.firstOrNull(),
                        onClick = { onStreamSelected(stream) }
                    )
                }
            }
        }
    }
}

@Composable
private fun EpisodesListView(
    uiState: PlayerUiState,
    episodesFocusRequester: FocusRequester,
    onEpisodeSelected: (Video) -> Unit
) {
    when {
        uiState.isLoadingEpisodes -> {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                LoadingIndicator()
            }
        }

        uiState.episodesError != null -> {
            Text(
                text = uiState.episodesError ?: "Failed to load episodes",
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.85f)
            )
        }

        uiState.episodes.isEmpty() -> {
            Text(
                text = "No episodes available",
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.7f)
            )
        }

        else -> {
            TvLazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxHeight()
            ) {
                items(uiState.episodes) { episode ->
                    val isCurrent = episode.season == uiState.currentSeason &&
                        episode.episode == uiState.currentEpisode
                    EpisodeItem(
                        episode = episode,
                        isCurrent = isCurrent,
                        focusRequester = episodesFocusRequester,
                        requestInitialFocus = isCurrent,
                        onClick = { onEpisodeSelected(episode) }
                    )
                }
            }
        }
    }
}

@Composable
private fun EpisodeItem(
    episode: Video,
    isCurrent: Boolean,
    focusRequester: FocusRequester,
    requestInitialFocus: Boolean,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .then(if (requestInitialFocus) Modifier.focusRequester(focusRequester) else Modifier),
        colors = CardDefaults.colors(
            containerColor = if (isCurrent) NuvioColors.Primary.copy(alpha = 0.18f) else NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.Primary.copy(alpha = 0.32f)
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(10.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = buildString {
                        val s = episode.season
                        val e = episode.episode
                        if (s != null && e != null) append("S${s.toString().padStart(2, '0')}E${e.toString().padStart(2, '0')}")
                        if (episode.title.isNotBlank()) {
                            if (isNotEmpty()) append(" • ")
                            append(episode.title)
                        }
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (isCurrent) NuvioColors.Primary else NuvioColors.TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                episode.overview?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = NuvioTheme.extendedColors.textSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (isCurrent) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Current",
                    tint = NuvioColors.Primary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
private fun StreamItem(
    stream: Stream,
    focusRequester: FocusRequester,
    requestInitialFocus: Boolean,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .then(if (requestInitialFocus) Modifier.focusRequester(focusRequester) else Modifier),
        colors = CardDefaults.colors(
            containerColor = NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.FocusBackground
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(10.dp))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = stream.getDisplayName(),
                style = MaterialTheme.typography.bodyLarge,
                color = NuvioColors.TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = stream.addonName,
                style = MaterialTheme.typography.labelSmall,
                color = NuvioTheme.extendedColors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun AddonFilterChips(
    addons: List<String>,
    selectedAddon: String?,
    onAddonSelected: (String?) -> Unit
) {
    TvLazyRow(
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
    ) {
        item {
            AddonChip(
                name = "All",
                isSelected = selectedAddon == null,
                onClick = { onAddonSelected(null) }
            )
        }

        items(addons) { addon ->
            AddonChip(
                name = addon,
                isSelected = selectedAddon == addon,
                onClick = { onAddonSelected(addon) }
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun AddonChip(
    name: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    FilterChip(
        selected = isSelected,
        onClick = onClick,
        modifier = Modifier.onFocusChanged {
            val nowFocused = it.isFocused
            if (nowFocused && !isSelected) {
                onClick()
            }
        },
        colors = FilterChipDefaults.colors(
            containerColor = NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.Secondary,
            selectedContainerColor = NuvioColors.Secondary.copy(alpha = 0.3f),
            focusedSelectedContainerColor = NuvioColors.Secondary,
            contentColor = NuvioColors.TextSecondary,
            focusedContentColor = NuvioColors.OnPrimary,
            selectedContentColor = NuvioColors.Secondary,
            focusedSelectedContentColor = NuvioColors.OnPrimary
        ),
        border = FilterChipDefaults.border(
            border = Border(
                border = BorderStroke(1.dp, NuvioColors.Border),
                shape = RoundedCornerShape(20.dp)
            ),
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(20.dp)
            ),
            selectedBorder = Border(
                border = BorderStroke(1.dp, NuvioColors.Primary),
                shape = RoundedCornerShape(20.dp)
            ),
            focusedSelectedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(20.dp)
            )
        ),
        shape = FilterChipDefaults.shape(shape = RoundedCornerShape(20.dp))
    ) {
        Text(
            text = name,
            style = MaterialTheme.typography.labelLarge
        )
    }
}
