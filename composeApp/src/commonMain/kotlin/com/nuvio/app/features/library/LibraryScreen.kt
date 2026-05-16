package com.nuvio.app.features.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.nuvio.app.core.format.formatReleaseDateForDisplay
import com.nuvio.app.core.network.NetworkCondition
import com.nuvio.app.core.network.NetworkStatusRepository
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioNetworkOfflineCard
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioStatusModal
import com.nuvio.app.core.ui.NuvioToastController
import com.nuvio.app.core.ui.NuvioAnimatedWatchedBadge
import com.nuvio.app.core.ui.posterCardClickable
import com.nuvio.app.core.ui.rememberPosterCardStyleUiState
import com.nuvio.app.features.home.components.HomeEmptyStateCard
import com.nuvio.app.features.home.components.HomeSkeletonRow
import com.nuvio.app.features.home.PosterShape
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watching.application.WatchingState
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource

private data class LibraryRemovalTarget(
    val item: LibraryItem,
    val listKey: String? = null,
    val listTitle: String? = null,
)

private enum class LibraryFilter {
    All,
    Movies,
    Series,
    Watched,
    Unwatched,
}

@Composable
fun LibraryScreen(
    modifier: Modifier = Modifier,
    onPosterClick: ((LibraryItem) -> Unit)? = null,
    onSectionViewAllClick: ((LibrarySection) -> Unit)? = null,
) {
    val uiState by remember {
        LibraryRepository.ensureLoaded()
        LibraryRepository.uiState
    }.collectAsStateWithLifecycle()
    val watchedUiState by remember {
        WatchedRepository.ensureLoaded()
        WatchedRepository.uiState
    }.collectAsStateWithLifecycle()
    val networkStatusUiState by NetworkStatusRepository.uiState.collectAsStateWithLifecycle()
    var pendingRemovalTarget by remember { mutableStateOf<LibraryRemovalTarget?>(null) }
    var selectedFilterName by rememberSaveable { mutableStateOf(LibraryFilter.All.name) }
    val selectedFilter = remember(selectedFilterName) {
        runCatching { LibraryFilter.valueOf(selectedFilterName) }.getOrDefault(LibraryFilter.All)
    }
    val filteredSections = remember(uiState.sections, watchedUiState.watchedKeys, selectedFilter) {
        uiState.sections.filteredBy(selectedFilter, watchedUiState.watchedKeys)
    }
    val filteredItems = remember(filteredSections) {
        filteredSections
            .flatMap { section -> section.items }
            .distinctBy { item -> "${item.type}:${item.id}" }
    }
    var observedOfflineState by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    val isTraktSource = uiState.sourceMode == LibrarySourceMode.TRAKT
    val retryLibraryLoad: () -> Unit = {
        NetworkStatusRepository.requestRefresh(force = true)
        coroutineScope.launch {
            LibraryRepository.pullFromServer(ProfileRepository.activeProfileId)
        }
    }

    LaunchedEffect(networkStatusUiState.condition, isTraktSource) {
        when (networkStatusUiState.condition) {
            NetworkCondition.NoInternet,
            NetworkCondition.ServersUnreachable,
            -> {
                observedOfflineState = true
            }

            NetworkCondition.Online -> {
                if (!observedOfflineState) return@LaunchedEffect
                observedOfflineState = false
                if (isTraktSource) {
                    coroutineScope.launch {
                        LibraryRepository.pullFromServer(ProfileRepository.activeProfileId)
                    }
                }
            }

            NetworkCondition.Unknown,
            NetworkCondition.Checking,
            -> Unit
        }
    }

    NuvioScreen(
        modifier = modifier,
        horizontalPadding = 0.dp,
    ) {
        stickyHeader {
            androidx.compose.foundation.layout.Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background),
            ) {
                NuvioScreenHeader(
                    title = if (isTraktSource) {
                        stringResource(Res.string.library_trakt_title)
                    } else {
                        stringResource(Res.string.library_title)
                    },
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                Spacer(modifier = Modifier.height(6.dp))
                if (uiState.sections.isNotEmpty()) {
                    LibraryFilterRow(
                        selectedFilter = selectedFilter,
                        onSelectFilter = { selectedFilterName = it.name },
                    )
                    Text(
                        text = stringResource(Res.string.library_filter_count, filteredItems.size),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                            start = 16.dp,
                            top = 14.dp,
                            end = 16.dp,
                        ),
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onSurface,
                        textAlign = androidx.compose.ui.text.style.TextAlign.End,
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                }
            }
        }

        when {
            !uiState.isLoaded || (uiState.isLoading && uiState.sections.isEmpty()) -> {
                items(3) {
                    HomeSkeletonRow(modifier = Modifier.padding(horizontal = 16.dp))
                }
            }

            !uiState.errorMessage.isNullOrBlank() && uiState.sections.isEmpty() -> {
                item {
                    if (networkStatusUiState.isOfflineLike) {
                        NuvioNetworkOfflineCard(
                            condition = networkStatusUiState.condition,
                            modifier = Modifier.padding(horizontal = 16.dp),
                            onRetry = retryLibraryLoad,
                        )
                    } else {
                        HomeEmptyStateCard(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            title = if (isTraktSource) {
                                stringResource(Res.string.library_trakt_load_failed)
                            } else {
                                stringResource(Res.string.library_load_failed)
                            },
                            message = uiState.errorMessage.orEmpty(),
                            actionLabel = stringResource(Res.string.action_retry),
                            onActionClick = retryLibraryLoad,
                        )
                    }
                }
            }

            uiState.sections.isEmpty() -> {
                item {
                    if (networkStatusUiState.isOfflineLike && isTraktSource) {
                        NuvioNetworkOfflineCard(
                            condition = networkStatusUiState.condition,
                            modifier = Modifier.padding(horizontal = 16.dp),
                            onRetry = retryLibraryLoad,
                        )
                    } else {
                        HomeEmptyStateCard(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            title = if (isTraktSource) {
                                stringResource(Res.string.library_trakt_empty_title)
                            } else {
                                stringResource(Res.string.library_empty_title)
                            },
                            message = if (isTraktSource) {
                                stringResource(Res.string.library_trakt_empty_message)
                            } else {
                                stringResource(Res.string.library_empty_message)
                            },
                        )
                    }
                }
            }

            else -> {
                if (filteredItems.isEmpty()) {
                    item {
                        HomeEmptyStateCard(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            title = stringResource(Res.string.library_filter_empty_title),
                            message = stringResource(Res.string.library_filter_empty_message),
                        )
                    }
                } else {
                    libraryGrid(
                        items = filteredItems,
                        watchedKeys = watchedUiState.watchedKeys,
                        onPosterClick = onPosterClick,
                        onPosterLongClick = { item ->
                            pendingRemovalTarget = if (isTraktSource) {
                                LibraryRemovalTarget(
                                    item = item,
                                )
                            } else {
                                LibraryRemovalTarget(item = item)
                            }
                        },
                    )
                }
            }
        }
    }

    NuvioStatusModal(
        title = stringResource(Res.string.library_remove_title),
        message = pendingRemovalTarget?.let { target ->
            val listTitle = target.listTitle
            if (listTitle.isNullOrBlank()) {
                stringResource(Res.string.library_remove_message, target.item.name)
            } else {
                stringResource(Res.string.library_remove_from_list_message, target.item.name, listTitle)
            }
        }.orEmpty(),
        isVisible = pendingRemovalTarget != null,
        confirmText = stringResource(Res.string.library_remove_confirm),
        dismissText = stringResource(Res.string.action_cancel),
        onConfirm = {
            val target = pendingRemovalTarget
            pendingRemovalTarget = null
            target?.let {
                val listKey = target.listKey
                if (listKey.isNullOrBlank()) {
                    LibraryRepository.remove(target.item.id)
                } else {
                    coroutineScope.launch {
                        runCatching {
                            LibraryRepository.removeFromList(target.item, listKey)
                        }.onFailure { error ->
                            NuvioToastController.show(
                                error.message ?: getString(Res.string.trakt_lists_update_failed),
                            )
                        }
                    }
                }
            }
        },
        onDismiss = { pendingRemovalTarget = null },
    )
}

@Composable
private fun LibraryFilterRow(
    selectedFilter: LibraryFilter,
    onSelectFilter: (LibraryFilter) -> Unit,
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(
            items = LibraryFilter.entries,
            key = { filter -> filter.name },
        ) { filter ->
            val selected = filter == selectedFilter
            Surface(
                modifier = Modifier.clickable { onSelectFilter(filter) },
                shape = MaterialTheme.shapes.small,
                color = if (selected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.surface
                },
                contentColor = if (selected) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
            ) {
                Text(
                    text = filter.label(),
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}

@Composable
private fun LibraryFilter.label(): String =
    when (this) {
        LibraryFilter.All -> stringResource(Res.string.library_filter_all)
        LibraryFilter.Movies -> stringResource(Res.string.media_movies)
        LibraryFilter.Series -> stringResource(Res.string.media_series)
        LibraryFilter.Watched -> stringResource(Res.string.episodes_cd_watched)
        LibraryFilter.Unwatched -> stringResource(Res.string.library_filter_unwatched)
    }

private fun List<LibrarySection>.filteredBy(
    filter: LibraryFilter,
    watchedKeys: Set<String>,
): List<LibrarySection> =
    mapNotNull { section ->
        val filteredItems = section.items.filter { item ->
            when (filter) {
                LibraryFilter.All -> true
                LibraryFilter.Movies -> item.type == "movie"
                LibraryFilter.Series -> item.type == "series"
                LibraryFilter.Watched -> item.isWatched(watchedKeys)
                LibraryFilter.Unwatched -> !item.isWatched(watchedKeys)
            }
        }
        section.copy(items = filteredItems).takeIf { it.items.isNotEmpty() }
    }

private fun LibraryItem.isWatched(watchedKeys: Set<String>): Boolean =
    WatchingState.isPosterWatched(
        watchedKeys = watchedKeys,
        item = toMetaPreview(),
    )

private fun LazyListScope.libraryGrid(
    items: List<LibraryItem>,
    watchedKeys: Set<String>,
    onPosterClick: ((LibraryItem) -> Unit)?,
    onPosterLongClick: (LibraryItem) -> Unit,
) {
    items(
        items = items.chunked(LIBRARY_GRID_COLUMNS),
    ) { rowItems ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            rowItems.forEach { item ->
                LibraryGridPosterTile(
                    item = item,
                    isWatched = item.isWatched(watchedKeys),
                    modifier = Modifier.weight(1f),
                    onClick = onPosterClick?.let { { it(item) } },
                    onLongClick = { onPosterLongClick(item) },
                )
            }
            repeat(LIBRARY_GRID_COLUMNS - rowItems.size) {
                Spacer(modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun LibraryGridPosterTile(
    item: LibraryItem,
    isWatched: Boolean,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
) {
    val posterCardStyle = rememberPosterCardStyleUiState()
    val hideLabels = posterCardStyle.hideLabelsEnabled

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(item.posterShape.libraryAspectRatio())
                .clip(RoundedCornerShape(posterCardStyle.cornerRadiusDp.dp))
                .background(MaterialTheme.colorScheme.surface)
                .posterCardClickable(onClick = onClick, onLongClick = onLongClick),
        ) {
            if (item.poster != null) {
                AsyncImage(
                    model = item.poster,
                    contentDescription = item.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }
            NuvioAnimatedWatchedBadge(
                isVisible = isWatched,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(6.dp),
            )
        }
        if (!hideLabels) {
            Text(
                text = item.name,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val detail = item.releaseInfo?.let { formatReleaseDateForDisplay(it) }
            if (detail != null) {
                Text(
                    text = detail,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun PosterShape.libraryAspectRatio(): Float =
    when (this) {
        PosterShape.Poster -> 0.68f
        PosterShape.Square -> 1f
        PosterShape.Landscape -> 16f / 9f
    }

private const val LIBRARY_GRID_COLUMNS = 3
