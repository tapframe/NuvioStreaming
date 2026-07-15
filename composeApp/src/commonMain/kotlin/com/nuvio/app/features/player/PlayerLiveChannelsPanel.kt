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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Search
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
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.NuvioInputField
import com.nuvio.app.features.livetv.LiveTvChannel
import com.nuvio.app.features.livetv.LiveTvRepository
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_close
import nuvio.composeapp.generated.resources.compose_player_channels
import nuvio.composeapp.generated.resources.compose_player_playing
import nuvio.composeapp.generated.resources.live_tv_action_back_to_top
import nuvio.composeapp.generated.resources.live_tv_filter_choose_category
import nuvio.composeapp.generated.resources.live_tv_filter_favorites
import nuvio.composeapp.generated.resources.live_tv_group_all_channels
import nuvio.composeapp.generated.resources.live_tv_group_uncategorized
import nuvio.composeapp.generated.resources.live_tv_no_matching_channels_message
import nuvio.composeapp.generated.resources.live_tv_no_matching_channels_title
import nuvio.composeapp.generated.resources.live_tv_search_placeholder
import org.jetbrains.compose.resources.stringResource

@Composable
fun PlayerLiveChannelsPanel(
    visible: Boolean,
    channels: List<LiveTvChannel>,
    currentStreamUrl: String?,
    onChannelSelected: (LiveTvChannel) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LiveTvRepository.ensureLoaded()
    val liveTvUiState by LiveTvRepository.uiState.collectAsStateWithLifecycle()
    val favoriteChannelIds = liveTvUiState.favoriteChannelIds
    val colorScheme = MaterialTheme.colorScheme
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val showBackToTop by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 260
        }
    }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var filterMode by rememberSaveable { mutableStateOf(PlayerLiveChannelFilterMode.All) }
    var selectedCategoryName by rememberSaveable { mutableStateOf<String?>(null) }

    val allChannelsLabel = stringResource(Res.string.live_tv_group_all_channels)
    val favoritesLabel = stringResource(Res.string.live_tv_filter_favorites)
    val uncategorizedLabel = stringResource(Res.string.live_tv_group_uncategorized)
    val chooseCategoryLabel = stringResource(Res.string.live_tv_filter_choose_category)

    val categoryOptions = remember(
        channels,
        allChannelsLabel,
        favoritesLabel,
        uncategorizedLabel,
    ) {
        buildPlayerLiveChannelCategoryFilterOptions(
            channels = channels,
            allChannelsLabel = allChannelsLabel,
            favoritesLabel = favoritesLabel,
            uncategorizedLabel = uncategorizedLabel,
        )
    }
    val visibleChannels = remember(
        channels,
        favoriteChannelIds,
        filterMode,
        selectedCategoryName,
        searchQuery,
        uncategorizedLabel,
    ) {
        filterPlayerLiveChannels(
            channels = channels,
            favoriteChannelIds = favoriteChannelIds,
            filterMode = filterMode,
            selectedCategoryName = selectedCategoryName,
            searchQuery = searchQuery,
            uncategorizedGroupName = uncategorizedLabel,
        )
    }

    LaunchedEffect(searchQuery, filterMode, selectedCategoryName) {
        listState.scrollToItem(0)
    }

    LaunchedEffect(categoryOptions, filterMode, selectedCategoryName) {
        if (filterMode == PlayerLiveChannelFilterMode.Category && selectedCategoryName != null) {
            val selectedStillExists = categoryOptions.any { option ->
                option.mode == PlayerLiveChannelFilterMode.Category && option.categoryName == selectedCategoryName
            }
            if (!selectedStillExists) {
                filterMode = PlayerLiveChannelFilterMode.All
                selectedCategoryName = null
            }
        }
    }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(200)),
        exit = fadeOut(tween(200)),
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() },
                    onClick = onDismiss,
                )
                .background(colorScheme.scrim.copy(alpha = 0.52f)),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = slideInVertically(tween(300)) { it / 3 } + fadeIn(tween(300)),
                exit = slideOutVertically(tween(250)) { it / 3 } + fadeOut(tween(250)),
            ) {
                Box(
                    modifier = Modifier
                        .widthIn(max = 520.dp)
                        .fillMaxWidth(0.92f)
                        .heightIn(max = 640.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(colorScheme.surface)
                        .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.8f), RoundedCornerShape(24.dp))
                        .clickable(
                            indication = null,
                            interactionSource = remember { MutableInteractionSource() },
                            onClick = {},
                        ),
                ) {
                    Column {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = stringResource(Res.string.compose_player_channels),
                                    color = colorScheme.onSurface,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = "${visibleChannels.size}/${channels.size}",
                                    color = colorScheme.onSurfaceVariant,
                                    fontSize = 12.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            PanelChipButton(
                                label = stringResource(Res.string.action_close),
                                onClick = onDismiss,
                            )
                        }

                        PlayerLiveChannelSearchField(
                            query = searchQuery,
                            onQueryChange = { searchQuery = it },
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )

                        PlayerLiveChannelFilterRow(
                            filterMode = filterMode,
                            selectedCategoryName = selectedCategoryName,
                            allChannelsLabel = allChannelsLabel,
                            favoritesLabel = favoritesLabel,
                            chooseCategoryLabel = chooseCategoryLabel,
                            categoryOptions = categoryOptions.filter { option ->
                                option.mode == PlayerLiveChannelFilterMode.Category
                            },
                            onAllChannelsClick = {
                                filterMode = PlayerLiveChannelFilterMode.All
                                selectedCategoryName = null
                            },
                            onFavoritesClick = {
                                filterMode = PlayerLiveChannelFilterMode.Favorites
                                selectedCategoryName = null
                            },
                            onCategoryOptionClick = { option ->
                                filterMode = PlayerLiveChannelFilterMode.Category
                                selectedCategoryName = option.categoryName
                            },
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                        )

                        Box(modifier = Modifier.weight(1f)) {
                            LazyColumn(
                                state = listState,
                                modifier = Modifier.padding(horizontal = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                                contentPadding = PaddingValues(bottom = 16.dp),
                            ) {
                                if (visibleChannels.isEmpty()) {
                                    item(key = "empty") {
                                        PlayerLiveChannelsEmptyState()
                                    }
                                } else {
                                    items(
                                        items = visibleChannels,
                                        key = { channel -> channel.id },
                                    ) { channel ->
                                        LiveChannelRow(
                                            channel = channel,
                                            isCurrent = channel.streamUrl == currentStreamUrl,
                                            onClick = { onChannelSelected(channel) },
                                        )
                                    }
                                }
                            }

                            if (showBackToTop) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(end = 12.dp, bottom = 16.dp),
                                ) {
                                    PlayerLiveChannelsBackToTopButton(
                                        onClick = {
                                            coroutineScope.launch {
                                                listState.animateScrollToItem(0)
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayerLiveChannelSearchField(
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
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            },
        )
    }
}

@Composable
private fun PlayerLiveChannelFilterRow(
    filterMode: PlayerLiveChannelFilterMode,
    selectedCategoryName: String?,
    allChannelsLabel: String,
    favoritesLabel: String,
    chooseCategoryLabel: String,
    categoryOptions: List<PlayerLiveChannelCategoryFilterOption>,
    onAllChannelsClick: () -> Unit,
    onFavoritesClick: () -> Unit,
    onCategoryOptionClick: (PlayerLiveChannelCategoryFilterOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlayerLiveChannelFilterChip(
            label = allChannelsLabel,
            selected = filterMode == PlayerLiveChannelFilterMode.All,
            onClick = onAllChannelsClick,
        )
        PlayerLiveChannelFilterChip(
            label = favoritesLabel,
            selected = filterMode == PlayerLiveChannelFilterMode.Favorites,
            onClick = onFavoritesClick,
        )
        PlayerLiveChannelCategoryFilterChip(
            selected = filterMode == PlayerLiveChannelFilterMode.Category,
            label = selectedCategoryName ?: chooseCategoryLabel,
            options = categoryOptions,
            onOptionClick = onCategoryOptionClick,
        )
    }
}

@Composable
private fun PlayerLiveChannelFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (selected) colorScheme.primaryContainer else colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .border(
                width = 1.dp,
                color = if (selected) colorScheme.primary.copy(alpha = 0.45f) else colorScheme.outlineVariant.copy(alpha = 0.7f),
                shape = RoundedCornerShape(999.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (selected) colorScheme.onPrimaryContainer else colorScheme.onSurface,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun PlayerLiveChannelCategoryFilterChip(
    selected: Boolean,
    label: String,
    options: List<PlayerLiveChannelCategoryFilterOption>,
    onOptionClick: (PlayerLiveChannelCategoryFilterOption) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val colorScheme = MaterialTheme.colorScheme
    Box {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (selected) colorScheme.primaryContainer else colorScheme.surfaceVariant.copy(alpha = 0.5f))
                .border(
                    width = 1.dp,
                    color = if (selected) colorScheme.primary.copy(alpha = 0.45f) else colorScheme.outlineVariant.copy(alpha = 0.7f),
                    shape = RoundedCornerShape(999.dp),
                )
                .clickable { expanded = true }
                .padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = label,
                color = if (selected) colorScheme.onPrimaryContainer else colorScheme.onSurface,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Icon(
                imageVector = Icons.Rounded.KeyboardArrowDown,
                contentDescription = null,
                tint = if (selected) colorScheme.onPrimaryContainer else colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier
                .widthIn(min = 360.dp, max = 480.dp)
                .heightIn(max = 560.dp),
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
private fun PlayerLiveChannelsBackToTopButton(
    onClick: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        modifier = Modifier.size(48.dp),
        onClick = onClick,
        color = colorScheme.primaryContainer,
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 8.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, colorScheme.primary.copy(alpha = 0.45f)),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = Icons.Rounded.KeyboardArrowUp,
                contentDescription = stringResource(Res.string.live_tv_action_back_to_top),
                tint = colorScheme.onPrimaryContainer,
            )
        }
    }
}

@Composable
private fun PlayerLiveChannelsEmptyState() {
    val colorScheme = MaterialTheme.colorScheme
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(colorScheme.surfaceVariant.copy(alpha = 0.35f))
            .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = stringResource(Res.string.live_tv_no_matching_channels_title),
            color = colorScheme.onSurface,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
        )
        Text(
            text = stringResource(Res.string.live_tv_no_matching_channels_message),
            color = colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
        )
    }
}

@Composable
private fun LiveChannelRow(
    channel: LiveTvChannel,
    isCurrent: Boolean,
    onClick: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    val cardShape = RoundedCornerShape(12.dp)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .clip(cardShape)
            .background(
                if (isCurrent) colorScheme.primaryContainer.copy(alpha = 0.4f) else Color.White.copy(alpha = 0.05f),
            )
            .then(
                if (isCurrent) {
                    Modifier.border(1.dp, colorScheme.primary.copy(alpha = 0.45f), cardShape)
                } else {
                    Modifier
                },
            )
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(width = 72.dp, height = 44.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(colorScheme.surfaceVariant.copy(alpha = 0.6f)),
            contentAlignment = Alignment.Center,
        ) {
            if (!channel.logoUrl.isNullOrBlank()) {
                AsyncImage(
                    model = channel.logoUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(6.dp),
                )
            } else {
                Icon(
                    imageVector = Icons.Rounded.LiveTv,
                    contentDescription = null,
                    tint = colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(24.dp),
                )
            }
        }

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = channel.name,
                    color = colorScheme.onSurface,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (isCurrent) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(colorScheme.primaryContainer)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Text(
                            text = stringResource(Res.string.compose_player_playing),
                            color = colorScheme.onPrimaryContainer,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            if (!channel.group.isNullOrBlank()) {
                Text(
                    text = channel.group,
                    color = colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private enum class PlayerLiveChannelFilterMode {
    All,
    Favorites,
    Category,
}

private data class PlayerLiveChannelCategoryFilterOption(
    val label: String,
    val mode: PlayerLiveChannelFilterMode,
    val categoryName: String? = null,
)

private fun buildPlayerLiveChannelCategoryFilterOptions(
    channels: List<LiveTvChannel>,
    allChannelsLabel: String,
    favoritesLabel: String,
    uncategorizedLabel: String,
): List<PlayerLiveChannelCategoryFilterOption> {
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
        add(PlayerLiveChannelCategoryFilterOption(allChannelsLabel, PlayerLiveChannelFilterMode.All))
        add(PlayerLiveChannelCategoryFilterOption(favoritesLabel, PlayerLiveChannelFilterMode.Favorites))
        add(PlayerLiveChannelCategoryFilterOption(uncategorizedLabel, PlayerLiveChannelFilterMode.Category, uncategorizedLabel))
        categories.forEach { category ->
            add(PlayerLiveChannelCategoryFilterOption(category, PlayerLiveChannelFilterMode.Category, category))
        }
    }
}

private fun filterPlayerLiveChannels(
    channels: List<LiveTvChannel>,
    favoriteChannelIds: Set<String>,
    filterMode: PlayerLiveChannelFilterMode,
    selectedCategoryName: String?,
    searchQuery: String,
    uncategorizedGroupName: String,
): List<LiveTvChannel> {
    val normalizedQuery = searchQuery.trim().lowercase()
    return channels
        .asSequence()
        .filter { channel ->
            when (filterMode) {
                PlayerLiveChannelFilterMode.All -> true
                PlayerLiveChannelFilterMode.Favorites -> channel.id in favoriteChannelIds
                PlayerLiveChannelFilterMode.Category -> selectedCategoryName == null ||
                    playerLiveChannelCategoryName(channel, uncategorizedGroupName).equals(selectedCategoryName, ignoreCase = true)
            }
        }
        .filter { channel ->
            normalizedQuery.isBlank() ||
                channel.name.lowercase().contains(normalizedQuery) ||
                playerLiveChannelCategoryName(channel, uncategorizedGroupName).lowercase().contains(normalizedQuery) ||
                channel.playlistName.orEmpty().lowercase().contains(normalizedQuery)
        }
        .sortedBy { it.name.lowercase() }
        .toList()
}

private fun playerLiveChannelCategoryName(
    channel: LiveTvChannel,
    uncategorizedGroupName: String,
): String = channel.group?.trim()?.takeIf(String::isNotBlank) ?: uncategorizedGroupName
