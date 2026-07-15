package com.nuvio.app.features.livetv

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.NuvioIconActionButton
import com.nuvio.app.core.ui.NuvioInputField
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioSectionLabel
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.features.home.components.HomeEmptyStateCard
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_retry
import nuvio.composeapp.generated.resources.live_tv_action_back_to_top
import nuvio.composeapp.generated.resources.live_tv_button_continue
import nuvio.composeapp.generated.resources.live_tv_empty_message
import nuvio.composeapp.generated.resources.live_tv_empty_title
import nuvio.composeapp.generated.resources.live_tv_filter_choose_category
import nuvio.composeapp.generated.resources.live_tv_filter_favorites
import nuvio.composeapp.generated.resources.live_tv_group_all_channels
import nuvio.composeapp.generated.resources.live_tv_group_uncategorized
import nuvio.composeapp.generated.resources.live_tv_last_watched_title
import nuvio.composeapp.generated.resources.live_tv_load_failed
import nuvio.composeapp.generated.resources.live_tv_no_matching_channels_message
import nuvio.composeapp.generated.resources.live_tv_no_matching_channels_title
import nuvio.composeapp.generated.resources.live_tv_no_playlist_message
import nuvio.composeapp.generated.resources.live_tv_no_playlist_title
import nuvio.composeapp.generated.resources.live_tv_search_placeholder
import nuvio.composeapp.generated.resources.live_tv_section_channels
import nuvio.composeapp.generated.resources.live_tv_title
import org.jetbrains.compose.resources.stringResource

@Composable
fun LiveTvScreen(
    modifier: Modifier = Modifier,
    scrollToTopRequests: Flow<Unit> = emptyFlow(),
    onChannelClick: (LiveTvChannel) -> Unit,
) {
    val uiState by remember {
        LiveTvRepository.ensureLoaded()
        LiveTvRepository.uiState
    }.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val showBackToTop by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 320
        }
    }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var filterMode by rememberSaveable { mutableStateOf(LiveTvChannelFilterMode.All) }
    var selectedCategoryName by rememberSaveable { mutableStateOf<String?>(null) }

    val allChannelsLabel = stringResource(Res.string.live_tv_group_all_channels)
    val favoritesLabel = stringResource(Res.string.live_tv_filter_favorites)
    val uncategorizedLabel = stringResource(Res.string.live_tv_group_uncategorized)
    val chooseCategoryLabel = stringResource(Res.string.live_tv_filter_choose_category)

    val categoryOptions = remember(
        uiState.channels,
        allChannelsLabel,
        favoritesLabel,
        uncategorizedLabel,
    ) {
        buildLiveTvCategoryFilterOptions(
            channels = uiState.channels,
            allChannelsLabel = allChannelsLabel,
            favoritesLabel = favoritesLabel,
            uncategorizedLabel = uncategorizedLabel,
        )
    }

    val visibleChannels = remember(
        uiState.channels,
        uiState.favoriteChannelIds,
        filterMode,
        selectedCategoryName,
        searchQuery,
        uncategorizedLabel,
    ) {
        filterLiveTvChannels(
            channels = uiState.channels,
            favoriteChannelIds = uiState.favoriteChannelIds,
            filterMode = filterMode,
            selectedCategoryName = selectedCategoryName,
            searchQuery = searchQuery,
            uncategorizedGroupName = uncategorizedLabel,
        )
    }

    val lastWatchedChannel = remember(uiState.channels, uiState.lastWatchedChannelId) {
        uiState.lastWatchedChannelId?.let { channelId ->
            uiState.channels.firstOrNull { it.id == channelId }
        }
    }

    val playChannel: (LiveTvChannel) -> Unit = { channel ->
        LiveTvRepository.markChannelWatched(channel)
        onChannelClick(channel)
    }

    LaunchedEffect(scrollToTopRequests) {
        scrollToTopRequests.collect {
            listState.animateScrollToItem(0)
        }
    }

    LaunchedEffect(searchQuery, filterMode, selectedCategoryName) {
        listState.scrollToItem(0)
    }

    LaunchedEffect(categoryOptions, filterMode, selectedCategoryName) {
        if (filterMode == LiveTvChannelFilterMode.Category && selectedCategoryName != null) {
            val selectedStillExists = categoryOptions.any { option ->
                option.mode == LiveTvChannelFilterMode.Category && option.categoryName == selectedCategoryName
            }
            if (!selectedStillExists) {
                filterMode = LiveTvChannelFilterMode.All
                selectedCategoryName = null
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        NuvioScreen(
            modifier = Modifier.fillMaxSize(),
            horizontalPadding = 16.dp,
            listState = listState,
        ) {
        item {
            NuvioScreenHeader(
                title = stringResource(Res.string.live_tv_title),
                includeStatusBarPadding = false,
                actions = {
                    if (uiState.hasPlaylist) {
                        NuvioIconActionButton(
                            icon = Icons.Rounded.Refresh,
                            contentDescription = stringResource(Res.string.action_retry),
                            onClick = LiveTvRepository::refresh,
                        )
                    }
                },
            )
        }

            when {
                uiState.isLoading && uiState.channels.isEmpty() -> {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 64.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(
                                color = MaterialTheme.nuvio.colors.accent,
                                strokeWidth = 2.dp,
                            )
                        }
                    }
                }

                !uiState.hasPlaylist -> {
                    item {
                        HomeEmptyStateCard(
                            title = stringResource(Res.string.live_tv_no_playlist_title),
                            message = stringResource(Res.string.live_tv_no_playlist_message),
                        )
                    }
                }

                !uiState.errorMessage.isNullOrBlank() && uiState.channels.isEmpty() -> {
                    item {
                        HomeEmptyStateCard(
                            title = stringResource(Res.string.live_tv_load_failed),
                            message = uiState.errorMessage.orEmpty(),
                            actionLabel = stringResource(Res.string.action_retry),
                            onActionClick = LiveTvRepository::refresh,
                        )
                    }
                }

                uiState.channels.isEmpty() -> {
                    item {
                        HomeEmptyStateCard(
                            title = stringResource(Res.string.live_tv_empty_title),
                            message = stringResource(Res.string.live_tv_empty_message),
                            actionLabel = stringResource(Res.string.action_retry),
                            onActionClick = LiveTvRepository::refresh,
                        )
                    }
                }

                else -> {
                    if (lastWatchedChannel != null) {
                        item(key = "last-watched:${lastWatchedChannel.id}") {
                            LiveTvRecentChannelCard(
                                channel = lastWatchedChannel,
                                categoryName = categoryNameForChannel(lastWatchedChannel, uncategorizedLabel),
                                onContinueClick = { playChannel(lastWatchedChannel) },
                            )
                        }
                    }

                    item {
                        LiveTvSearchField(
                            query = searchQuery,
                            onQueryChange = { searchQuery = it },
                        )
                    }

                    item {
                        LiveTvFilterPanelRow(
                            groups = categoryOptions
                                .filter { option -> option.mode == LiveTvChannelFilterMode.Category }
                                .map { option -> option.label },
                            selectedGroup = selectedCategoryName,
                            favoritesOnly = filterMode == LiveTvChannelFilterMode.Favorites,
                            allLabel = allChannelsLabel,
                            favoritesLabel = favoritesLabel,
                            categoryLabel = chooseCategoryLabel,
                            onAllSelected = {
                                filterMode = LiveTvChannelFilterMode.All
                                selectedCategoryName = null
                            },
                            onFavoritesSelected = {
                                filterMode = LiveTvChannelFilterMode.Favorites
                                selectedCategoryName = null
                            },
                            onGroupSelected = { category ->
                                filterMode = LiveTvChannelFilterMode.Category
                                selectedCategoryName = category
                            },
                        )
                    }

                    item {
                        LiveTvChannelsSubheader(channelCount = visibleChannels.size)
                    }

                    if (visibleChannels.isEmpty()) {
                        item {
                            HomeEmptyStateCard(
                                title = stringResource(Res.string.live_tv_no_matching_channels_title),
                                message = stringResource(Res.string.live_tv_no_matching_channels_message),
                            )
                        }
                    } else {
                        liveTvChannelList(
                            channels = visibleChannels,
                            favoriteChannelIds = uiState.favoriteChannelIds,
                            uncategorizedGroupName = uncategorizedLabel,
                            onFavoriteClick = { channel -> LiveTvRepository.toggleFavoriteChannel(channel.id) },
                            onPlayClick = playChannel,
                        )
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = showBackToTop,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 20.dp, bottom = liveTvBackToTopBottomPadding),
        ) {
            LiveTvBackToTopButton(
                onClick = {
                    coroutineScope.launch {
                        listState.animateScrollToItem(0)
                    }
                },
            )
        }
    }
}

@Composable
private fun LiveTvBackToTopButton(
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = Modifier.size(48.dp),
        onClick = onClick,
        color = tokens.colors.overlaySelected,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 8.dp,
        border = BorderStroke(NuvioTokens.Border.thin, tokens.colors.borderSubtle),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = Icons.Rounded.KeyboardArrowUp,
                contentDescription = stringResource(Res.string.live_tv_action_back_to_top),
                tint = tokens.colors.accent,
            )
        }
    }
}

@Composable
private fun LiveTvSearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxWidth()) {
        NuvioInputField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = stringResource(Res.string.live_tv_search_placeholder),
            trailingContent = {
                if (query.isBlank()) {
                    Icon(
                        imageVector = Icons.Rounded.Search,
                        contentDescription = null,
                        tint = MaterialTheme.nuvio.colors.textMuted,
                    )
                } else {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = null,
                            tint = MaterialTheme.nuvio.colors.textMuted,
                        )
                    }
                }
            },
        )
    }
}

@Composable
private fun LiveTvFilterRow(
    filterMode: LiveTvChannelFilterMode,
    selectedCategoryName: String?,
    allChannelsLabel: String,
    favoritesLabel: String,
    chooseCategoryLabel: String,
    categoryOptions: List<LiveTvCategoryFilterOption>,
    onAllChannelsClick: () -> Unit,
    onFavoritesClick: () -> Unit,
    onCategoryOptionClick: (LiveTvCategoryFilterOption) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LiveTvFilterChip(
            label = allChannelsLabel,
            selected = filterMode == LiveTvChannelFilterMode.All,
            onClick = onAllChannelsClick,
        )
        LiveTvFilterChip(
            label = favoritesLabel,
            selected = filterMode == LiveTvChannelFilterMode.Favorites,
            onClick = onFavoritesClick,
        )
        LiveTvCategoryFilterChip(
            selected = filterMode == LiveTvChannelFilterMode.Category,
            label = selectedCategoryName ?: chooseCategoryLabel,
            options = categoryOptions,
            onOptionClick = onCategoryOptionClick,
        )
    }
}

@Composable
private fun LiveTvFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Row(
        modifier = Modifier
            .clip(tokens.shapes.chip)
            .background(if (selected) tokens.colors.overlaySelected else tokens.colors.surface)
            .then(
                if (selected) Modifier else Modifier.border(
                    width = NuvioTokens.Border.thin,
                    color = tokens.colors.borderSubtle,
                    shape = tokens.shapes.chip,
                ),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s6),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) tokens.colors.accent else tokens.colors.textSecondary,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun LiveTvCategoryFilterChip(
    selected: Boolean,
    label: String,
    options: List<LiveTvCategoryFilterOption>,
    onOptionClick: (LiveTvCategoryFilterOption) -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    var expanded by remember { mutableStateOf(false) }
    val shape = tokens.shapes.chip

    Box(modifier = Modifier.wrapContentSize(Alignment.TopStart)) {
        Row(
            modifier = Modifier
                .clip(shape)
                .background(if (selected) tokens.colors.overlaySelected else tokens.colors.surface)
                .border(
                    width = if (selected) 0.dp else NuvioTokens.Border.thin,
                    color = if (selected) Color.Transparent else tokens.colors.borderSubtle,
                    shape = shape,
                )
                .clickable { expanded = true }
                .padding(horizontal = 16.dp, vertical = 9.dp),
            horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s6),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = if (selected) tokens.colors.accent else tokens.colors.textSecondary,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Icon(
                imageVector = Icons.Rounded.KeyboardArrowDown,
                contentDescription = null,
                modifier = Modifier.size(NuvioTokens.Icon.sm + NuvioTokens.Space.s2),
                tint = if (selected) tokens.colors.accent else tokens.colors.textMuted,
            )
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.widthIn(min = 220.dp),
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = option.label,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    onClick = {
                        expanded = false
                        onOptionClick(option)
                    },
                )
            }
        }
    }
}

@Composable
private fun LiveTvChannelsSubheader(
    channelCount: Int,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NuvioSectionLabel(text = stringResource(Res.string.live_tv_section_channels))
        Text(
            text = channelCount.toString(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.nuvio.colors.textMuted,
        )
    }
}

@Composable
private fun LiveTvRecentChannelCard(
    channel: LiveTvChannel,
    categoryName: String,
    onContinueClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = Modifier.fillMaxWidth(),
        onClick = onContinueClick,
        color = tokens.colors.surface,
        shape = tokens.shapes.card,
        border = BorderStroke(NuvioTokens.Border.thin, tokens.colors.borderSubtle),
    ) {
        Row(
            modifier = Modifier.padding(tokens.spacing.cardPadding),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChannelLogo(
                channel = channel,
                modifier = Modifier.size(58.dp),
                shape = RoundedCornerShape(16.dp),
                iconTint = tokens.colors.accent,
                borderColor = tokens.colors.borderSubtle,
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(
                    text = stringResource(Res.string.live_tv_last_watched_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = tokens.colors.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = channel.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.colors.textPrimary,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                LiveTvCategoryLine(categoryName = categoryName)
            }

            Surface(
                color = tokens.colors.overlaySelected,
                shape = tokens.shapes.chip,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = tokens.colors.accent,
                    )
                    Text(
                        text = stringResource(Res.string.live_tv_button_continue),
                        style = MaterialTheme.typography.labelLarge,
                        color = tokens.colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

private fun LazyListScope.liveTvChannelList(
    channels: List<LiveTvChannel>,
    favoriteChannelIds: Set<String>,
    uncategorizedGroupName: String,
    onFavoriteClick: (LiveTvChannel) -> Unit,
    onPlayClick: (LiveTvChannel) -> Unit,
) {
    items(
        items = channels,
        key = { channel -> "channel:${channel.id}" },
    ) { channel ->
        LiveTvChannelCard(
            channel = channel,
            categoryName = categoryNameForChannel(channel, uncategorizedGroupName),
            isFavorite = channel.id in favoriteChannelIds,
            onFavoriteClick = { onFavoriteClick(channel) },
            onPlayClick = { onPlayClick(channel) },
        )
    }
}

@Composable
private fun LiveTvChannelCard(
    channel: LiveTvChannel,
    categoryName: String,
    isFavorite: Boolean,
    onFavoriteClick: () -> Unit,
    onPlayClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = modifier.fillMaxWidth(),
        onClick = onPlayClick,
        color = tokens.colors.surface,
        shape = tokens.shapes.compactCard,
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            ChannelLogo(channel = channel)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = channel.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = tokens.colors.textPrimary,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                LiveTvCategoryLine(categoryName = categoryName)
            }
            IconButton(onClick = onFavoriteClick) {
                Icon(
                    imageVector = if (isFavorite) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                    contentDescription = null,
                    tint = if (isFavorite) tokens.colors.warning else tokens.colors.textMuted,
                )
            }
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(tokens.shapes.avatar)
                    .background(tokens.colors.overlaySelected)
                    .clickable(onClick = onPlayClick),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.PlayArrow,
                    contentDescription = null,
                    tint = tokens.colors.accent,
                )
            }
        }
    }
}

@Composable
private fun LiveTvCategoryLine(categoryName: String) {
    val tokens = MaterialTheme.nuvio
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(RoundedCornerShape(99.dp))
                .background(tokens.colors.accent),
        )
        Text(
            text = categoryName,
            style = MaterialTheme.typography.bodySmall,
            color = tokens.colors.textMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ChannelLogo(
    channel: LiveTvChannel,
    modifier: Modifier = Modifier.size(64.dp),
    shape: RoundedCornerShape = RoundedCornerShape(14.dp),
    iconTint: Color = MaterialTheme.nuvio.colors.textMuted,
    borderColor: Color? = null,
) {
    val tokens = MaterialTheme.nuvio
    val boxModifier = modifier
        .clip(shape)
        .background(tokens.colors.surfaceCard)
        .then(
            if (borderColor != null) {
                Modifier.border(
                    width = NuvioTokens.Border.thin,
                    color = borderColor,
                    shape = shape,
                )
            } else {
                Modifier
            },
        )

    Box(
        modifier = boxModifier,
        contentAlignment = Alignment.Center,
    ) {
        if (!channel.logoUrl.isNullOrBlank()) {
            AsyncImage(
                model = channel.logoUrl,
                contentDescription = channel.name,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(8.dp),
                contentScale = ContentScale.Fit,
            )
        } else {
            Icon(
                imageVector = Icons.Rounded.Tv,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}

private enum class LiveTvChannelFilterMode {
    All,
    Favorites,
    Category,
}

private data class LiveTvCategoryFilterOption(
    val label: String,
    val mode: LiveTvChannelFilterMode,
    val categoryName: String? = null,
)

private fun buildLiveTvCategoryFilterOptions(
    channels: List<LiveTvChannel>,
    allChannelsLabel: String,
    favoritesLabel: String,
    uncategorizedLabel: String,
): List<LiveTvCategoryFilterOption> {
    val categories = channels
        .mapNotNull { channel -> channel.group?.trim()?.takeIf(String::isNotBlank) }
        .distinctBy { it.lowercase() }
        .filterNot { category ->
            category.equals(allChannelsLabel, ignoreCase = true) ||
                category.equals(favoritesLabel, ignoreCase = true) ||
                category.equals(uncategorizedLabel, ignoreCase = true)
        }
        .sortedBy { it.lowercase() }

    return buildList {
        add(LiveTvCategoryFilterOption(allChannelsLabel, LiveTvChannelFilterMode.All))
        add(LiveTvCategoryFilterOption(favoritesLabel, LiveTvChannelFilterMode.Favorites))
        add(LiveTvCategoryFilterOption(uncategorizedLabel, LiveTvChannelFilterMode.Category, uncategorizedLabel))
        categories.forEach { category ->
            add(LiveTvCategoryFilterOption(category, LiveTvChannelFilterMode.Category, category))
        }
    }
}

private fun filterLiveTvChannels(
    channels: List<LiveTvChannel>,
    favoriteChannelIds: Set<String>,
    filterMode: LiveTvChannelFilterMode,
    selectedCategoryName: String?,
    searchQuery: String,
    uncategorizedGroupName: String,
): List<LiveTvChannel> {
    val normalizedQuery = searchQuery.trim().lowercase()
    return channels
        .asSequence()
        .filter { channel ->
            when (filterMode) {
                LiveTvChannelFilterMode.All -> true
                LiveTvChannelFilterMode.Favorites -> channel.id in favoriteChannelIds
                LiveTvChannelFilterMode.Category -> selectedCategoryName == null ||
                    categoryNameForChannel(channel, uncategorizedGroupName).equals(selectedCategoryName, ignoreCase = true)
            }
        }
        .filter { channel ->
            normalizedQuery.isBlank() ||
                channel.name.lowercase().contains(normalizedQuery) ||
                categoryNameForChannel(channel, uncategorizedGroupName).lowercase().contains(normalizedQuery) ||
                channel.playlistName.orEmpty().lowercase().contains(normalizedQuery)
        }
        .sortedBy { it.name.lowercase() }
        .toList()
}

private fun categoryNameForChannel(
    channel: LiveTvChannel,
    uncategorizedGroupName: String,
): String = channel.group?.trim()?.takeIf(String::isNotBlank) ?: uncategorizedGroupName
