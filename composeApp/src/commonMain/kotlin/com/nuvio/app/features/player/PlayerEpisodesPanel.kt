package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.StreamsUiState
import com.nuvio.app.features.streams.isSelectableForPlayback
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.buildPlaybackVideoId
import com.nuvio.app.features.watching.application.WatchingState
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

/**
 * Episode selection panel shown inside the player.
 * First shows the episode list; when an episode is tapped the sub-view
 * loads streams for that episode and lets the user pick one.
 */
@Composable
fun PlayerEpisodesPanel(
    visible: Boolean,
    episodes: List<MetaVideo>,
    parentMetaType: String,
    parentMetaId: String,
    currentSeason: Int?,
    currentEpisode: Int?,
    progressByVideoId: Map<String, WatchProgressEntry>,
    watchedKeys: Set<String>,
    blurUnwatchedEpisodes: Boolean,
    // episode stream sub-view state
    episodeStreamsState: EpisodeStreamsPanelState,
    onSeasonSelected: (Int) -> Unit,
    onEpisodeSelected: (MetaVideo) -> Unit,
    onEpisodeStreamFilterSelected: (String?) -> Unit,
    onEpisodeStreamSelected: (StreamItem, MetaVideo) -> Unit,
    onBackToEpisodes: () -> Unit,
    onReloadEpisodeStreams: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(NuvioTokens.Motion.normalMillis)),
        exit = fadeOut(tween(NuvioTokens.Motion.normalMillis)),
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() },
                    onClick = onDismiss,
                )
                .background(tokens.colors.overlayScrim.copy(alpha = tokens.opacity.medium)),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = slideInVertically(tween(NuvioTokens.Motion.sheetEnterMillis)) { it / 3 } +
                    fadeIn(tween(NuvioTokens.Motion.sheetEnterMillis)),
                exit = slideOutVertically(tween(NuvioTokens.Motion.sheetExitMillis)) { it / 3 } +
                    fadeOut(tween(NuvioTokens.Motion.sheetExitMillis)),
            ) {
                Box(
                    modifier = Modifier
                        .widthIn(max = tokens.components.playerPanelMaxWidth)
                        .fillMaxWidth(0.92f)
                        .heightIn(max = tokens.components.dialogMaxWidth + NuvioTokens.Space.s64)
                        .clip(tokens.shapes.playerPanel)
                        .background(tokens.colors.surfaceSheet)
                        .border(tokens.borders.thin, tokens.colors.borderDefault, tokens.shapes.playerPanel)
                        .clickable(
                            indication = null,
                            interactionSource = remember { MutableInteractionSource() },
                            onClick = {},
                        ),
                ) {
                    if (episodeStreamsState.showStreams) {
                        EpisodeStreamsSubView(
                            state = episodeStreamsState,
                            onFilterSelected = onEpisodeStreamFilterSelected,
                            onStreamSelected = onEpisodeStreamSelected,
                            onBack = onBackToEpisodes,
                            onReload = onReloadEpisodeStreams,
                            onDismiss = onDismiss,
                        )
                    } else {
                        EpisodesListSubView(
                            episodes = episodes,
                            parentMetaType = parentMetaType,
                            parentMetaId = parentMetaId,
                            currentSeason = currentSeason,
                            currentEpisode = currentEpisode,
                            progressByVideoId = progressByVideoId,
                            watchedKeys = watchedKeys,
                            blurUnwatchedEpisodes = blurUnwatchedEpisodes,
                            onSeasonSelected = onSeasonSelected,
                            onEpisodeSelected = onEpisodeSelected,
                            onDismiss = onDismiss,
                        )
                    }
                }
            }
        }
    }
}

data class EpisodeStreamsPanelState(
    val showStreams: Boolean = false,
    val selectedEpisode: MetaVideo? = null,
    val streamsUiState: StreamsUiState = StreamsUiState(),
)

// ── Episode List View ──────────────────────────────────────────────

@Composable
private fun EpisodesListSubView(
    episodes: List<MetaVideo>,
    parentMetaType: String,
    parentMetaId: String,
    currentSeason: Int?,
    currentEpisode: Int?,
    progressByVideoId: Map<String, WatchProgressEntry>,
    watchedKeys: Set<String>,
    blurUnwatchedEpisodes: Boolean,
    onSeasonSelected: (Int) -> Unit,
    onEpisodeSelected: (MetaVideo) -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    val groupedEpisodes = remember(episodes) {
        episodes
            .filter { it.season != null || it.episode != null }
            .groupBy { it.season?.coerceAtLeast(0) ?: 0 }
    }
    val availableSeasons = remember(groupedEpisodes) {
        val regular = groupedEpisodes.keys.filter { it > 0 }.sorted()
        val specials = groupedEpisodes.keys.filter { it == 0 }
        regular + specials
    }
    var selectedSeason by remember(currentSeason, availableSeasons) {
        mutableIntStateOf(
            when {
                currentSeason != null && currentSeason in availableSeasons -> currentSeason
                availableSeasons.isNotEmpty() -> availableSeasons.first()
                else -> 1
            },
        )
    }
    val seasonEpisodes = remember(groupedEpisodes, selectedSeason) {
        (groupedEpisodes[selectedSeason] ?: emptyList())
            .sortedBy { it.episode ?: 0 }
    }
    val seasonListState = rememberLazyListState()
    val episodeListState = rememberLazyListState()
    var hasPositionedSeasonRow by remember(availableSeasons) { mutableStateOf(false) }
    var hasPositionedEpisodeList by remember(selectedSeason) { mutableStateOf(false) }

    LaunchedEffect(selectedSeason, availableSeasons) {
        val selectedSeasonIndex = availableSeasons.indexOf(selectedSeason)
        if (selectedSeasonIndex >= 0) {
            if (hasPositionedSeasonRow) {
                seasonListState.animateScrollToItem(selectedSeasonIndex)
            } else {
                seasonListState.scrollToItem(selectedSeasonIndex)
                hasPositionedSeasonRow = true
            }
        }
    }

    LaunchedEffect(selectedSeason, seasonEpisodes, currentSeason, currentEpisode) {
        if (seasonEpisodes.isEmpty()) return@LaunchedEffect
        val activeEpisodeIndex = if (selectedSeason == currentSeason && currentEpisode != null) {
            seasonEpisodes.indexOfFirst { episode ->
                episode.season == currentSeason && episode.episode == currentEpisode
            }
        } else {
            -1
        }
        val targetIndex = activeEpisodeIndex.takeIf { it >= 0 } ?: 0
        if (hasPositionedEpisodeList) {
            episodeListState.animateScrollToItem(targetIndex)
        } else {
            episodeListState.scrollToItem(targetIndex)
            hasPositionedEpisodeList = true
        }
    }

    Column {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = tokens.spacing.sheetPadding, vertical = tokens.spacing.cardPadding),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_panel_episodes),
                color = tokens.colors.textPrimary,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
            PanelChipButton(label = stringResource(Res.string.action_close), onClick = onDismiss)
        }

        // Season tabs
        if (availableSeasons.size > 1) {
            LazyRow(
                state = seasonListState,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = tokens.spacing.sheetPadding)
                    .padding(bottom = tokens.spacing.listGap),
                horizontalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap),
            ) {
                items(availableSeasons, key = { season -> season }) { season ->
                    val label = if (season == 0) {
                        stringResource(Res.string.episodes_specials)
                    } else {
                        stringResource(Res.string.episodes_season, season)
                    }
                    AddonFilterChip(
                        label = label,
                        isSelected = selectedSeason == season,
                        onClick = {
                            selectedSeason = season
                            onSeasonSelected(season)
                        },
                    )
                }
            }
        }

        // Episode list
        if (seasonEpisodes.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = NuvioTokens.Space.s40),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(Res.string.compose_player_no_episodes_available),
                    color = tokens.colors.textMuted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        } else {
            LazyColumn(
                state = episodeListState,
                modifier = Modifier.padding(horizontal = tokens.spacing.cardPaddingCompact),
                verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s4),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = tokens.spacing.cardPadding),
            ) {
                itemsIndexed(
                    items = seasonEpisodes,
                    key = { index, episode -> "${episode.season}:${episode.episode}:${episode.id}#$index" },
                ) { _, episode ->
                    val isCurrent = episode.season == currentSeason && episode.episode == currentEpisode
                    val episodeVideoId = buildPlaybackVideoId(
                        parentMetaId = parentMetaId,
                        seasonNumber = episode.season,
                        episodeNumber = episode.episode,
                        fallbackVideoId = episode.id,
                    )
                    val isWatched = progressByVideoId[episodeVideoId]?.isEffectivelyCompleted == true ||
                        WatchingState.isEpisodeWatched(
                            watchedKeys = watchedKeys,
                            metaType = parentMetaType,
                            metaId = parentMetaId,
                            episode = episode,
                        )
                    EpisodeRow(
                        episode = episode,
                        isCurrent = isCurrent,
                        isWatched = isWatched,
                        blurUnwatchedEpisodes = blurUnwatchedEpisodes,
                        onClick = { onEpisodeSelected(episode) },
                    )
                }
            }
        }
    }
}

@Composable
private fun EpisodeRow(
    episode: MetaVideo,
    isCurrent: Boolean,
    isWatched: Boolean,
    blurUnwatchedEpisodes: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val shouldBlurArtwork = blurUnwatchedEpisodes && !isWatched && !isCurrent

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(tokens.shapes.compactCard)
            .background(
                if (isCurrent) tokens.colors.overlaySelected else Color.Transparent,
            )
            .then(
                if (isCurrent) {
                    Modifier.border(tokens.borders.thin, tokens.colors.borderSelected, tokens.shapes.compactCard)
                } else {
                    Modifier
                },
            )
            .clickable(onClick = onClick)
            .padding(horizontal = NuvioTokens.Space.s12, vertical = NuvioTokens.Space.s10),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(tokens.spacing.listGap),
    ) {
        // Thumbnail
        if (episode.thumbnail != null) {
            AsyncImage(
                model = episode.thumbnail,
                contentDescription = null,
                modifier = Modifier
                    .width(NuvioTokens.Space.s80)
                    .height(NuvioTokens.Space.s48)
                    .clip(tokens.shapes.compactCard)
                    .then(if (shouldBlurArtwork) Modifier.blur(NuvioTokens.Space.s18) else Modifier),
                contentScale = ContentScale.Crop,
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap),
            ) {
                val episodeLabel = buildString {
                    if (episode.season != null && episode.episode != null) {
                        append(
                            stringResource(
                                Res.string.compose_player_episode_code_full,
                                episode.season,
                                episode.episode,
                            ),
                        )
                    } else if (episode.episode != null) {
                        append(stringResource(Res.string.compose_player_episode_code_episode_only, episode.episode))
                    }
                }
                if (episodeLabel.isNotBlank()) {
                    Text(
                        text = episodeLabel,
                        color = tokens.colors.textMuted,
                        fontSize = NuvioTokens.Type.labelXs,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                if (isCurrent) {
                    Box(
                        modifier = Modifier
                            .clip(tokens.shapes.chip)
                            .background(tokens.colors.accent)
                            .padding(horizontal = NuvioTokens.Space.s6, vertical = NuvioTokens.Space.s2),
                    ) {
                        Text(
                            text = stringResource(Res.string.compose_player_playing),
                            color = tokens.colors.onAccent,
                            fontSize = NuvioTokens.Type.labelXs,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            Text(
                text = episode.title,
                color = tokens.colors.textPrimary,
                fontSize = NuvioTokens.Type.bodySm,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            episode.overview?.let { overview ->
                Text(
                    text = overview,
                    color = tokens.colors.textSecondary,
                    fontSize = NuvioTokens.Type.labelXs,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

// ── Episode Streams Sub-View ──────────────────────────────────────

@Composable
private fun EpisodeStreamsSubView(
    state: EpisodeStreamsPanelState,
    onFilterSelected: (String?) -> Unit,
    onStreamSelected: (StreamItem, MetaVideo) -> Unit,
    onBack: () -> Unit,
    onReload: () -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val debridSettings by remember {
        DebridSettingsRepository.ensureLoaded()
        DebridSettingsRepository.uiState
    }.collectAsStateWithLifecycle()

    val episode = state.selectedEpisode ?: return
    val streamsUiState = state.streamsUiState

    Column {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = tokens.spacing.sheetPadding, vertical = tokens.spacing.cardPadding),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_panel_streams),
                color = tokens.colors.textPrimary,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
            PanelChipButton(label = stringResource(Res.string.action_close), onClick = onDismiss)
        }

        // Back + reload + episode info
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = tokens.spacing.sheetPadding)
                .padding(bottom = tokens.spacing.controlGap),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap),
        ) {
            PanelChipButton(
                label = stringResource(Res.string.action_back),
                icon = Icons.AutoMirrored.Rounded.ArrowBack,
                onClick = onBack,
            )
            PanelChipButton(
                label = stringResource(Res.string.compose_action_reload),
                icon = Icons.Rounded.Refresh,
                onClick = onReload,
            )
            Text(
                text = buildString {
                    if (episode.season != null && episode.episode != null) {
                        append(
                            stringResource(
                                Res.string.compose_player_episode_code_full,
                                episode.season,
                                episode.episode,
                            ),
                        )
                    }
                    if (episode.title.isNotBlank()) {
                        if (isNotEmpty()) append(" • ")
                        append(episode.title)
                    }
                },
                color = tokens.colors.textMuted,
                fontSize = NuvioTokens.Type.labelSm,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }

        // Addon filter chips
        val addonNames = remember(streamsUiState.groups) {
            streamsUiState.groups.map { it.addonName }.distinct()
        }
        if (addonNames.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = tokens.spacing.sheetPadding)
                    .padding(bottom = tokens.spacing.listGap),
                horizontalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap),
            ) {
                AddonFilterChip(
                    label = stringResource(Res.string.collections_tab_all),
                    isSelected = streamsUiState.selectedFilter == null,
                    onClick = { onFilterSelected(null) },
                )
                addonNames.forEach { addon ->
                    val group = streamsUiState.groups.firstOrNull { it.addonName == addon }
                    AddonFilterChip(
                        label = addon,
                        isSelected = streamsUiState.selectedFilter == group?.addonId,
                        isLoading = group?.isLoading == true,
                        hasError = group?.error != null,
                        onClick = { onFilterSelected(group?.addonId) },
                    )
                }
            }
        }

        // Streams
        when {
            streamsUiState.isAnyLoading && streamsUiState.allStreams.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = NuvioTokens.Space.s40),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        color = tokens.colors.accent,
                        strokeWidth = tokens.borders.medium,
                        modifier = Modifier.size(tokens.icons.lg + NuvioTokens.Space.s4),
                    )
                }
            }

            streamsUiState.allStreams.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = NuvioTokens.Space.s40),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(Res.string.compose_player_no_streams_found),
                        color = tokens.colors.textMuted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            else -> {
                val streams = streamsUiState.filteredGroups.flatMap { it.streams }
                LazyColumn(
                    modifier = Modifier.padding(horizontal = tokens.spacing.cardPadding),
                    verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s6),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = tokens.spacing.cardPadding),
                ) {
                    itemsIndexed(
                        items = streams,
                        key = { index, stream -> "${stream.addonId}::${index}::${stream.url ?: stream.infoHash ?: stream.clientResolve?.infoHash ?: stream.name}" },
                    ) { _, stream ->
                        EpisodeSourceStreamRow(
                            stream = stream,
                            enabled = stream.isSelectableForPlayback(debridSettings.canResolvePlayableLinks),
                            onClick = { onStreamSelected(stream, episode) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EpisodeSourceStreamRow(
    stream: StreamItem,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(tokens.shapes.compactCard)
            .background(tokens.colors.surfaceCard)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = tokens.spacing.cardPadding, vertical = tokens.spacing.listGap),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(tokens.spacing.listGap),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stream.streamLabel,
                color = tokens.colors.textPrimary,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            stream.streamSubtitle?.let { subtitle ->
                if (subtitle != stream.streamLabel) {
                    Text(
                        text = subtitle,
                        color = tokens.colors.textSecondary,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Text(
                text = stream.addonName,
                color = tokens.colors.textMuted,
                fontSize = NuvioTokens.Type.labelXs,
                fontStyle = FontStyle.Italic,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
