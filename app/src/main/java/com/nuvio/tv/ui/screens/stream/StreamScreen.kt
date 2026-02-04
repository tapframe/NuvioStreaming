@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.stream

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.foundation.lazy.list.itemsIndexed
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.FilterChip
import androidx.tv.material3.FilterChipDefaults
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.nuvio.tv.domain.model.Stream
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.components.StreamsSkeletonList
import com.nuvio.tv.ui.theme.NuvioTheme

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun StreamScreen(
    viewModel: StreamScreenViewModel = hiltViewModel(),
    onBackPress: () -> Unit,
    onStreamSelected: (StreamPlaybackInfo) -> Unit
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
        // Full screen backdrop
        StreamBackdrop(
            backdrop = uiState.backdrop ?: uiState.poster,
            isLoading = uiState.isLoading
        )

        // Content overlay
        Row(
            modifier = Modifier.fillMaxSize()
        ) {
            // Left side - Title/Logo (centered vertically)
            LeftContentSection(
                title = uiState.title,
                logo = uiState.logo,
                isEpisode = uiState.isEpisode,
                season = uiState.season,
                episode = uiState.episode,
                episodeName = uiState.episodeName,
                genres = uiState.genres,
                year = uiState.year,
                modifier = Modifier
                    .weight(0.4f)
                    .fillMaxHeight()
            )

            // Right side - Streams container
            RightStreamSection(
                isLoading = uiState.isLoading,
                error = uiState.error,
                streams = uiState.filteredStreams,
                availableAddons = uiState.availableAddons,
                selectedAddonFilter = uiState.selectedAddonFilter,
                onAddonFilterSelected = { viewModel.onEvent(StreamScreenEvent.OnAddonFilterSelected(it)) },
                onStreamSelected = { stream ->
                    val playbackInfo = viewModel.getStreamForPlayback(stream)
                    onStreamSelected(playbackInfo)
                },
                onRetry = { viewModel.onEvent(StreamScreenEvent.OnRetry) },
                modifier = Modifier
                    .weight(0.6f)
                    .fillMaxHeight()
            )
        }
    }
}

@Composable
private fun StreamBackdrop(
    backdrop: String?,
    isLoading: Boolean
) {
    val alpha by animateFloatAsState(
        targetValue = if (isLoading) 0.3f else 0.5f,
        animationSpec = tween(500),
        label = "backdrop_alpha"
    )

    Box(modifier = Modifier.fillMaxSize()) {
        // Backdrop image
        if (backdrop != null) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }

        // Dark overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(NuvioColors.Background.copy(alpha = alpha))
        )

        // Left gradient for text readability
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colorStops = arrayOf(
                            0.0f to NuvioColors.Background,
                            0.25f to NuvioColors.Background.copy(alpha = 0.95f),
                            0.4f to NuvioColors.Background.copy(alpha = 0.8f),
                            0.5f to NuvioColors.Background.copy(alpha = 0.5f),
                            0.6f to Color.Transparent,
                            1.0f to Color.Transparent
                        )
                    )
                )
        )

        // Right gradient for streams panel
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colorStops = arrayOf(
                            0.0f to Color.Transparent,
                            0.4f to Color.Transparent,
                            0.5f to NuvioColors.Background.copy(alpha = 0.3f),
                            0.7f to NuvioColors.Background.copy(alpha = 0.7f),
                            0.85f to NuvioColors.Background.copy(alpha = 0.9f),
                            1.0f to NuvioColors.Background
                        )
                    )
                )
        )
    }
}

@Composable
private fun LeftContentSection(
    title: String,
    logo: String?,
    isEpisode: Boolean,
    season: Int?,
    episode: Int?,
    episodeName: String?,
    genres: String?,
    year: String?,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.padding(start = 48.dp, end = 24.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Column(
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth(0.8f)
        ) {
            if (logo != null) {
                AsyncImage(
                    model = logo,
                    contentDescription = title,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    contentScale = ContentScale.Fit,
                    alignment = Alignment.Center
                )
            } else {
                Text(
                    text = title,
                    style = MaterialTheme.typography.displaySmall,
                    color = NuvioColors.TextPrimary,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Show episode info or movie info
            if (isEpisode && season != null && episode != null) {
                // Episode info
                Text(
                    text = "S$season E$episode",
                    style = MaterialTheme.typography.titleLarge,
                    color = NuvioTheme.extendedColors.textSecondary,
                    textAlign = TextAlign.Center
                )
                if (episodeName != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = episodeName,
                        style = MaterialTheme.typography.bodyLarge,
                        color = NuvioColors.TextPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center
                    )
                }
            } else {
                // Movie info - genres and year
                val infoText = listOfNotNull(genres, year).joinToString(" • ")
                if (infoText.isNotEmpty()) {
                    Text(
                        text = infoText,
                        style = MaterialTheme.typography.bodyLarge,
                        color = NuvioTheme.extendedColors.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun RightStreamSection(
    isLoading: Boolean,
    error: String?,
    streams: List<Stream>,
    availableAddons: List<String>,
    selectedAddonFilter: String?,
    onAddonFilterSelected: (String?) -> Unit,
    onStreamSelected: (Stream) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    var enter by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        enter = true
    }

    Column(
        modifier = modifier
            .padding(top = 48.dp, end = 48.dp, bottom = 48.dp)
    ) {
        val chipRowHeight = 56.dp

        // Addon filter chips
        Box(modifier = Modifier.height(chipRowHeight)) {
            androidx.compose.animation.AnimatedVisibility(
                visible = !isLoading && availableAddons.isNotEmpty(),
                enter = fadeIn(animationSpec = tween(300)),
                exit = fadeOut(animationSpec = tween(300))
            ) {
                AddonFilterChips(
                    addons = availableAddons,
                    selectedAddon = selectedAddonFilter,
                    onAddonSelected = onAddonFilterSelected
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        androidx.compose.animation.AnimatedVisibility(
            visible = enter,
            enter = fadeIn(animationSpec = tween(260)) +
                slideInHorizontally(
                    animationSpec = tween(260),
                    initialOffsetX = { fullWidth -> (fullWidth * 0.06f).toInt() }
                ),
            exit = fadeOut(animationSpec = tween(120))
        ) {
            // Content area
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(16.dp))
                    .background(NuvioColors.BackgroundCard.copy(alpha = 0.5f)),
                contentAlignment = Alignment.Center
            ) {
                when {
                    isLoading -> {
                        LoadingState()
                    }
                    error != null -> {
                        ErrorState(
                            message = error,
                            onRetry = onRetry
                        )
                    }
                    streams.isEmpty() -> {
                        EmptyState()
                    }
                    else -> {
                        StreamsList(
                            streams = streams,
                            onStreamSelected = onStreamSelected
                        )
                    }
                }
            }
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
        // "All" chip
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
    var isFocused by remember { mutableStateOf(false) }

    FilterChip(
        selected = isSelected,
        onClick = onClick,
        modifier = Modifier.onFocusChanged {
            val nowFocused = it.isFocused
            isFocused = nowFocused
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

@Composable
private fun LoadingState() {
    StreamsSkeletonList()
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ErrorState(
    message: String,
    onRetry: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier.padding(32.dp)
    ) {
        Icon(
            imageVector = Icons.Default.Warning,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = NuvioColors.Error
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = NuvioTheme.extendedColors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(24.dp))

        var isFocused by remember { mutableStateOf(false) }
        Card(
            onClick = onRetry,
            modifier = Modifier.onFocusChanged { isFocused = it.isFocused },
            colors = CardDefaults.colors(
                containerColor = NuvioColors.BackgroundCard,
                focusedContainerColor = NuvioColors.Secondary
            ),
            border = CardDefaults.border(
                focusedBorder = Border(
                    border = BorderStroke(2.dp, NuvioColors.FocusRing),
                    shape = RoundedCornerShape(8.dp)
                )
            ),
            shape = CardDefaults.shape(shape = RoundedCornerShape(8.dp)),
            scale = CardDefaults.scale(focusedScale = 1.02f)
        ) {
            Text(
                text = "Retry",
                style = MaterialTheme.typography.labelLarge,
                color = if (isFocused) NuvioColors.OnPrimary else NuvioColors.TextPrimary,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp)
            )
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier.padding(32.dp)
    ) {
        Text(
            text = "No streams found",
            style = MaterialTheme.typography.bodyLarge,
            color = NuvioTheme.extendedColors.textSecondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Try installing more addons to find streams",
            style = MaterialTheme.typography.bodyMedium,
            color = NuvioTheme.extendedColors.textSecondary,
            textAlign = TextAlign.Center
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun StreamsList(
    streams: List<Stream>,
    onStreamSelected: (Stream) -> Unit
) {
    TvLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(vertical = 8.dp)
    ) {
        itemsIndexed(streams, key = { index, stream ->
            "${stream.addonName}_${stream.url ?: stream.infoHash ?: stream.ytId ?: "unknown"}_$index"
        }) { _, stream ->
            StreamCard(
                stream = stream,
                onClick = { onStreamSelected(stream) }
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun StreamCard(
    stream: Stream,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth(),
        colors = CardDefaults.colors(
            containerColor = NuvioColors.BackgroundElevated,
            focusedContainerColor = NuvioColors.FocusBackground
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(12.dp)
            )
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(12.dp)),
        scale = CardDefaults.scale(focusedScale = 1.05f)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = stream.getDisplayName(),
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioColors.TextPrimary
                )

                stream.getDisplayDescription()?.let { description ->
                    if (description != stream.getDisplayName()) {
                        Text(
                            text = description,
                            style = MaterialTheme.typography.bodySmall,
                            color = NuvioTheme.extendedColors.textSecondary
                        )
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (stream.isTorrent()) {
                        StreamTypeChip(text = "Torrent", color = NuvioColors.Secondary)
                    }
                    if (stream.isYouTube()) {
                        StreamTypeChip(text = "YouTube", color = Color(0xFFFF0000))
                    }
                    if (stream.isExternal()) {
                        StreamTypeChip(text = "External", color = NuvioColors.Primary)
                    }
                }
            }

            Column(
                horizontalAlignment = Alignment.End
            ) {
                if (stream.addonLogo != null) {
                    AsyncImage(
                        model = stream.addonLogo,
                        contentDescription = stream.addonName,
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        contentScale = ContentScale.Fit
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = stream.addonName,
                    style = MaterialTheme.typography.labelSmall,
                    color = NuvioTheme.extendedColors.textTertiary,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun StreamTypeChip(
    text: String,
    color: Color
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.2f))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = color
        )
    }
}
