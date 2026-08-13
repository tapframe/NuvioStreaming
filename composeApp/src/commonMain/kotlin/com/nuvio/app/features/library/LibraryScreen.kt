package com.nuvio.app.features.library

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.ViewAgenda
import com.nuvio.app.core.ui.NuvioLoadingIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.nuvio.app.core.i18n.localizedMonthName
import com.nuvio.app.core.i18n.localizedShortMonthName
import com.nuvio.app.core.i18n.localizedByteUnit
import com.nuvio.app.core.network.NetworkCondition
import com.nuvio.app.core.network.NetworkStatusRepository
import com.nuvio.app.core.ui.DisintegratingContainer
import com.nuvio.app.core.ui.DisintegrationRequest
import com.nuvio.app.core.ui.NuvioDropdownChip
import com.nuvio.app.core.ui.NuvioDropdownOption
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioNetworkOfflineCard
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioShelfSection
import com.nuvio.app.core.ui.NuvioViewAllPillSize
import com.nuvio.app.core.ui.ScopedDisintegrationTracker
import com.nuvio.app.core.ui.nuvioConsumePointerEvents
import com.nuvio.app.features.cloud.CloudLibraryFile
import com.nuvio.app.features.cloud.CloudLibraryItem
import com.nuvio.app.features.cloud.CloudLibraryItemType
import com.nuvio.app.features.cloud.CloudLibraryRepository
import com.nuvio.app.features.cloud.CloudLibraryUiState
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.home.components.HomeEmptyStateCard
import com.nuvio.app.features.home.components.HomePosterCard
import com.nuvio.app.features.home.components.HomeSkeletonRow
import com.nuvio.app.features.home.components.posterGridColumnCountForWidth
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.tracking.TrackingRefreshIntent
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import com.nuvio.app.features.watching.application.WatchingState
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
fun LibraryScreen(
    modifier: Modifier = Modifier,
    scrollToTopRequests: Flow<Unit> = emptyFlow(),
    onPosterClick: ((LibraryItem) -> Unit)? = null,
    onPosterLongClick: ((LibraryItem, LibrarySection) -> Unit)? = null,
    onSectionViewAllClick: ((LibrarySection, LibrarySortOption) -> Unit)? = null,
    onCloudFilePlay: ((CloudLibraryItem, CloudLibraryFile) -> Unit)? = null,
    onConnectCloudClick: (() -> Unit)? = null,
    disintegrationRequest: DisintegrationRequest<String>? = null,
) {
    val uiState by remember {
        LibraryRepository.ensureLoaded()
        LibraryRepository.uiState
    }.collectAsStateWithLifecycle()
    val cloudUiState by CloudLibraryRepository.uiState.collectAsStateWithLifecycle()
    val cloudSettings by remember {
        DebridSettingsRepository.ensureLoaded()
        DebridSettingsRepository.uiState
    }.collectAsStateWithLifecycle()
    val watchedUiState by remember {
        WatchedRepository.ensureLoaded()
        WatchedRepository.uiState
    }.collectAsStateWithLifecycle()
    val fullyWatchedSeriesKeys by WatchedRepository.fullyWatchedSeriesKeys.collectAsStateWithLifecycle()
    val displaySettings by remember {
        LibraryDisplaySettingsRepository.ensureLoaded()
        LibraryDisplaySettingsRepository.uiState
    }.collectAsStateWithLifecycle()
    val networkStatusUiState by NetworkStatusRepository.uiState.collectAsStateWithLifecycle()
    var observedOfflineState by remember { mutableStateOf(false) }
    var sourceModeName by rememberSaveable { mutableStateOf(LibraryViewMode.Saved.name) }
    val sourceMode = remember(sourceModeName) {
        runCatching { LibraryViewMode.valueOf(sourceModeName) }.getOrDefault(LibraryViewMode.Saved)
    }
    var showReleaseCalendar by rememberSaveable { mutableStateOf(false) }
    var releaseCalendarEvents by remember(uiState.items) {
        mutableStateOf(buildLibraryReleaseCalendarFallbackEvents(uiState.items))
    }
    var releaseCalendarLoading by remember(uiState.items) { mutableStateOf(false) }
    var selectedProviderId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedTypeName by rememberSaveable { mutableStateOf<String?>(null) }
    var cloudSearchQuery by rememberSaveable { mutableStateOf("") }
    val selectedType = remember(selectedTypeName) {
        selectedTypeName?.let { runCatching { CloudLibraryItemType.valueOf(it) }.getOrNull() }
    }
    var selectedCloudItemKey by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedLibrarySectionKey by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedLibraryType by rememberSaveable { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val isRemoteSource = uiState.sourceMode != LibrarySourceMode.LOCAL
    val effectiveSortOption = effectiveLibrarySortOption(
        selected = displaySettings.sortOption,
        sourceMode = uiState.sourceMode,
    )
    val sortedSections = remember(uiState.sections, displaySettings.sortOption, uiState.sourceMode) {
        sortLibrarySections(
            sections = uiState.sections,
            selected = displaySettings.sortOption,
            sourceMode = uiState.sourceMode,
        )
    }
    val verticalProjection = remember(
        uiState.sections,
        uiState.sourceMode,
        selectedLibrarySectionKey,
        selectedLibraryType,
        displaySettings.sortOption,
    ) {
        buildLibraryVerticalProjection(
            sections = uiState.sections,
            sourceMode = uiState.sourceMode,
            selectedSectionKey = selectedLibrarySectionKey,
            selectedType = selectedLibraryType,
            sortOption = displaySettings.sortOption,
        )
    }
    val retryLibraryLoad: () -> Unit = {
        NetworkStatusRepository.requestRefresh(force = true)
        coroutineScope.launch {
            LibraryRepository.pullFromServer(
                profileId = ProfileRepository.activeProfileId,
                refreshIntent = TrackingRefreshIntent.USER_INITIATED,
            )
        }
    }

    LaunchedEffect(networkStatusUiState.condition, isRemoteSource) {
        when (networkStatusUiState.condition) {
            NetworkCondition.NoInternet,
            NetworkCondition.ServersUnreachable,
            -> {
                observedOfflineState = true
            }

            NetworkCondition.Online -> {
                if (!observedOfflineState) return@LaunchedEffect
                observedOfflineState = false
                if (isRemoteSource) {
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

    LaunchedEffect(scrollToTopRequests) {
        scrollToTopRequests.collect {
            listState.animateScrollToItem(0)
        }
    }

    LaunchedEffect(sourceMode, cloudSettings.cloudLibraryEnabled, cloudSettings.providerApiKeys) {
        if (sourceMode == LibraryViewMode.Cloud) {
            CloudLibraryRepository.ensureLoaded()
            selectedCloudItemKey = null
        }
    }

    LaunchedEffect(showReleaseCalendar, uiState.items) {
        if (!showReleaseCalendar) return@LaunchedEffect
        val itemsSnapshot = uiState.items
        releaseCalendarEvents = buildLibraryReleaseCalendarFallbackEvents(itemsSnapshot)
        releaseCalendarLoading = true
        try {
            releaseCalendarEvents = buildLibraryReleaseCalendarEvents(itemsSnapshot)
        } finally {
            releaseCalendarLoading = false
        }
    }

    val disintegration = remember { LibraryDisintegrationHolder() }
    val librarySectionsDisplay = if (
        sourceMode != LibraryViewMode.Cloud &&
        displaySettings.layoutMode == LibraryLayoutMode.HORIZONTAL &&
        uiState.isLoaded &&
        sortedSections.isNotEmpty()
    ) {
        disintegration.sync(
            sourceMode = uiState.sourceMode,
            sections = sortedSections,
            previewLimit = LIBRARY_SECTION_PREVIEW_LIMIT,
            request = disintegrationRequest,
        )
    } else {
        disintegration.reset()
        emptyList()
    }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val gridColumns = remember(maxWidth) { posterGridColumnCountForWidth(maxWidth) }

        NuvioScreen(
            modifier = Modifier.fillMaxSize(),
            horizontalPadding = 0.dp,
            listState = listState,
            autoHidesNativeTabBar = true,
        ) {
            stickyHeader {
                Box(modifier = Modifier.fillMaxWidth()) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .background(MaterialTheme.colorScheme.background)
                            .nuvioConsumePointerEvents(),
                    )
                    androidx.compose.foundation.layout.Column(
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        NuvioScreenHeader(
                            title = if (sourceMode == LibraryViewMode.Cloud) {
                                stringResource(Res.string.library_title)
                            } else {
                                when (uiState.sourceMode) {
                                    LibrarySourceMode.LOCAL -> stringResource(Res.string.library_title)
                                    LibrarySourceMode.TRAKT -> stringResource(Res.string.library_trakt_title)
                                    LibrarySourceMode.SIMKL -> stringResource(Res.string.library_simkl_title)
                                }
                            },
                            modifier = Modifier.padding(horizontal = 16.dp),
                            actions = {
                                if (sourceMode == LibraryViewMode.Saved) {
                                    val targetLayout = if (displaySettings.layoutMode == LibraryLayoutMode.HORIZONTAL) {
                                        LibraryLayoutMode.VERTICAL
                                    } else {
                                        LibraryLayoutMode.HORIZONTAL
                                    }
                                    IconButton(
                                        onClick = {
                                            LibraryDisplaySettingsRepository.setLayoutMode(targetLayout)
                                        },
                                    ) {
                                        Crossfade(
                                            targetState = targetLayout,
                                            animationSpec = tween(durationMillis = 140),
                                            label = "libraryLayoutAction",
                                        ) { animatedTargetLayout ->
                                            Icon(
                                                imageVector = if (animatedTargetLayout == LibraryLayoutMode.VERTICAL) {
                                                    Icons.Rounded.GridView
                                                } else {
                                                    Icons.Rounded.ViewAgenda
                                                },
                                                contentDescription = if (animatedTargetLayout == LibraryLayoutMode.VERTICAL) {
                                                    stringResource(Res.string.library_layout_show_vertical)
                                                } else {
                                                    stringResource(Res.string.library_layout_show_horizontal)
                                                },
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                }
                                if (sourceMode != LibraryViewMode.Cloud) {
                                    val openCalendarLabel = stringResource(Res.string.library_calendar_open)
                                    IconButton(
                                        onClick = { showReleaseCalendar = true },
                                        modifier = Modifier
                                            .size(40.dp)
                                            .semantics { contentDescription = openCalendarLabel },
                                    ) {
                                        LibraryCalendarGlyph(
                                            modifier = Modifier.size(19.dp),
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            cutoutColor = MaterialTheme.colorScheme.background,
                                        )
                                    }
                                }
                            },
                        )
                        LibrarySourceSwitch(
                            selectedMode = sourceMode,
                            onModeSelected = { mode ->
                                sourceModeName = mode.name
                            },
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                    }
                }
            }

            if (sourceMode == LibraryViewMode.Cloud) {
                cloudLibraryContent(
                    uiState = cloudUiState,
                    selectedProviderId = selectedProviderId,
                    selectedType = selectedType,
                    selectedCloudItemKey = selectedCloudItemKey,
                    searchQuery = cloudSearchQuery,
                    onSearchQueryChange = {
                        cloudSearchQuery = it
                        selectedCloudItemKey = null
                    },
                    onProviderSelected = {
                        selectedProviderId = it
                        selectedTypeName = null
                        selectedCloudItemKey = null
                    },
                    onTypeSelected = {
                        selectedTypeName = it?.name
                        selectedCloudItemKey = null
                    },
                    onItemSelected = { item ->
                        val playableFiles = item.playableFiles
                        when {
                            playableFiles.size == 1 -> onCloudFilePlay?.invoke(item, playableFiles.first())
                            playableFiles.size > 1 -> selectedCloudItemKey = item.stableKey
                        }
                    },
                    onFileSelected = { item, file -> onCloudFilePlay?.invoke(item, file) },
                    onBackToItems = { selectedCloudItemKey = null },
                    onRefresh = { CloudLibraryRepository.refresh() },
                    onConnectCloudClick = onConnectCloudClick,
                )
            } else {
                when {
                    !uiState.isLoaded || (uiState.isLoading && uiState.sections.isEmpty()) -> {
                        if (displaySettings.layoutMode == LibraryLayoutMode.VERTICAL) {
                            libraryVerticalSkeletonItems(gridColumns)
                        } else {
                            items(3) {
                                HomeSkeletonRow(
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                )
                            }
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
                                    title = when (uiState.sourceMode) {
                                        LibrarySourceMode.LOCAL -> stringResource(Res.string.library_load_failed)
                                        LibrarySourceMode.TRAKT -> stringResource(Res.string.library_trakt_load_failed)
                                        LibrarySourceMode.SIMKL -> stringResource(Res.string.library_simkl_load_failed)
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
                            if (networkStatusUiState.isOfflineLike && isRemoteSource) {
                                NuvioNetworkOfflineCard(
                                    condition = networkStatusUiState.condition,
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    onRetry = retryLibraryLoad,
                                )
                            } else {
                                HomeEmptyStateCard(
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    title = when (uiState.sourceMode) {
                                        LibrarySourceMode.LOCAL -> stringResource(Res.string.library_empty_title)
                                        LibrarySourceMode.TRAKT -> stringResource(Res.string.library_trakt_empty_title)
                                        LibrarySourceMode.SIMKL -> stringResource(Res.string.library_simkl_empty_title)
                                    },
                                    message = when (uiState.sourceMode) {
                                        LibrarySourceMode.LOCAL -> stringResource(Res.string.library_empty_message)
                                        LibrarySourceMode.TRAKT -> stringResource(Res.string.library_trakt_empty_message)
                                        LibrarySourceMode.SIMKL -> stringResource(Res.string.library_simkl_empty_message)
                                    },
                                )
                            }
                        }
                    }

                    else -> {
                        item(
                            key = "library-saved-controls:${uiState.sourceMode}:" +
                                "${displaySettings.layoutMode}:$effectiveSortOption",
                        ) {
                            LibrarySavedControls(
                                layoutMode = displaySettings.layoutMode,
                                sourceMode = uiState.sourceMode,
                                sortOption = effectiveSortOption,
                                verticalProjection = verticalProjection,
                                onSectionSelected = { sectionKey ->
                                    selectedLibrarySectionKey = sectionKey
                                    selectedLibraryType = null
                                },
                                onTypeSelected = { type -> selectedLibraryType = type },
                                onSortSelected = LibraryDisplaySettingsRepository::setSortOption,
                                modifier = libraryContentTransitionModifier()
                                    .padding(horizontal = 16.dp),
                            )
                        }
                        when (displaySettings.layoutMode) {
                            LibraryLayoutMode.HORIZONTAL -> librarySections(
                                displaySections = librarySectionsDisplay,
                                watchedKeys = watchedUiState.watchedKeys,
                                fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
                                sortOption = effectiveSortOption,
                                onPosterClick = onPosterClick,
                                onSectionViewAllClick = onSectionViewAllClick,
                                onPosterLongClick = onPosterLongClick,
                                onDisintegrated = disintegration::onExited,
                            )
                            LibraryLayoutMode.VERTICAL -> libraryVerticalContent(
                                projection = verticalProjection,
                                columns = gridColumns,
                                watchedKeys = watchedUiState.watchedKeys,
                                fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
                                onPosterClick = onPosterClick,
                                onPosterLongClick = onPosterLongClick,
                            )
                        }
                    }
                }
            }
        }
    }

    if (showReleaseCalendar) {
        LibraryReleaseCalendarPage(
            events = releaseCalendarEvents,
            isLoading = releaseCalendarLoading,
            onDismiss = { showReleaseCalendar = false },
            onPosterClick = onPosterClick,
        )
    }
}

private fun LazyListScope.cloudLibraryContent(
    uiState: CloudLibraryUiState,
    selectedProviderId: String?,
    selectedType: CloudLibraryItemType?,
    selectedCloudItemKey: String?,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onProviderSelected: (String?) -> Unit,
    onTypeSelected: (CloudLibraryItemType?) -> Unit,
    onItemSelected: (CloudLibraryItem) -> Unit,
    onFileSelected: (CloudLibraryItem, CloudLibraryFile) -> Unit,
    onBackToItems: () -> Unit,
    onRefresh: () -> Unit,
    onConnectCloudClick: (() -> Unit)?,
) {
    when {
        !uiState.isLoaded -> {
            cloudLibrarySkeletonItems()
        }

        !uiState.isEnabled -> {
            item {
                HomeEmptyStateCard(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    title = stringResource(Res.string.cloud_library_disabled_title),
                    message = stringResource(Res.string.cloud_library_disabled_message),
                    actionLabel = stringResource(Res.string.cloud_library_disabled_action),
                    onActionClick = onConnectCloudClick,
                )
            }
        }

        !uiState.hasConnectedProvider -> {
            item {
                HomeEmptyStateCard(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    title = stringResource(Res.string.cloud_library_connect_title),
                    message = stringResource(Res.string.cloud_library_connect_message),
                    actionLabel = stringResource(Res.string.cloud_library_connect_action),
                    onActionClick = onConnectCloudClick,
                )
            }
        }

        else -> {
            val providerItems = uiState.items
                .filter { item -> selectedProviderId == null || item.providerId == selectedProviderId }
            val availableTypes = providerItems
                .map { item -> item.type }
                .distinct()
                .sortedBy { type -> type.ordinal }
            val effectiveSelectedType = selectedType?.takeIf { type -> type in availableTypes }
            val typeFilteredItems = providerItems
                .filter { item -> effectiveSelectedType == null || item.type == effectiveSelectedType }
            // Local filter over the already-loaded library. Matches the item name or any of its
            // file names, since the useful identifier is often in the filename, not the title.
            val trimmedQuery = searchQuery.trim()
            val filteredItems = if (trimmedQuery.isEmpty()) {
                typeFilteredItems
            } else {
                typeFilteredItems.filter { item ->
                    item.name.contains(trimmedQuery, ignoreCase = true) ||
                        item.files.any { file -> file.name.contains(trimmedQuery, ignoreCase = true) }
                }
            }
            val selectedItem = filteredItems.firstOrNull { it.stableKey == selectedCloudItemKey }

            if (selectedItem != null) {
                item {
                    CloudLibraryFilePicker(
                        item = selectedItem,
                        onBack = onBackToItems,
                        onFileSelected = { file -> onFileSelected(selectedItem, file) },
                    )
                }
            } else {
                item {
                    CloudLibraryToolbar(
                        uiState = uiState,
                        selectedProviderId = selectedProviderId,
                        selectedType = effectiveSelectedType,
                        availableTypes = availableTypes,
                        onProviderSelected = onProviderSelected,
                        onTypeSelected = onTypeSelected,
                        onRefresh = onRefresh,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }

                item(key = "cloud-library-search") {
                    CloudLibrarySearchField(
                        query = searchQuery,
                        onQueryChange = onSearchQueryChange,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }

                uiState.providers
                    .filter { providerState -> selectedProviderId == null || providerState.providerId == selectedProviderId }
                    .filter { providerState -> !providerState.errorMessage.isNullOrBlank() && providerState.items.isEmpty() }
                    .forEach { providerState ->
                        item(key = "cloud-error-${providerState.providerId}") {
                            HomeEmptyStateCard(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                title = stringResource(Res.string.cloud_library_load_failed, providerState.providerName),
                                message = providerState.errorMessage.orEmpty(),
                                actionLabel = stringResource(Res.string.action_retry),
                                onActionClick = onRefresh,
                            )
                        }
                    }

                if (uiState.isRefreshing && filteredItems.isEmpty()) {
                    cloudLibrarySkeletonItems()
                } else if (filteredItems.isEmpty()) {
                    item {
                        HomeEmptyStateCard(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            title = stringResource(Res.string.cloud_library_empty_title),
                            message = stringResource(Res.string.cloud_library_empty_message),
                            actionLabel = stringResource(Res.string.action_retry),
                            onActionClick = onRefresh,
                        )
                    }
                } else {
                    items(
                        items = filteredItems,
                        key = { item -> item.stableKey },
                    ) { item ->
                        CloudLibraryRow(
                            item = item,
                            onClick = { onItemSelected(item) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CloudLibrarySearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        placeholder = { Text(stringResource(Res.string.cloud_library_search_label)) },
        leadingIcon = {
            Icon(
                imageVector = Icons.Rounded.Search,
                contentDescription = null,
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = stringResource(Res.string.compose_search_clear),
                    )
                }
            }
        },
    )
}

private fun LazyListScope.cloudLibrarySkeletonItems() {
    item(key = "cloud-library-skeleton-toolbar") {
        CloudLibrarySkeletonToolbar(
            modifier = Modifier.padding(horizontal = 16.dp),
        )
    }
    items(3) {
        CloudLibrarySkeletonRow()
    }
}

@Composable
private fun LibrarySourceSwitch(
    selectedMode: LibraryViewMode,
    onModeSelected: (LibraryViewMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LibraryChip(
            label = stringResource(Res.string.library_source_saved),
            selected = selectedMode == LibraryViewMode.Saved,
            onClick = { onModeSelected(LibraryViewMode.Saved) },
        )
        LibraryChip(
            label = stringResource(Res.string.library_source_cloud),
            selected = selectedMode == LibraryViewMode.Cloud,
            onClick = { onModeSelected(LibraryViewMode.Cloud) },
        )
    }
}

@Composable
private fun CloudLibraryToolbar(
    uiState: CloudLibraryUiState,
    selectedProviderId: String?,
    selectedType: CloudLibraryItemType?,
    availableTypes: List<CloudLibraryItemType>,
    onProviderSelected: (String?) -> Unit,
    onTypeSelected: (CloudLibraryItemType?) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val providerOptions = buildList {
        add(NuvioDropdownOption(key = "", label = stringResource(Res.string.cloud_library_provider_all)))
        addAll(
            uiState.providers.map { provider ->
                NuvioDropdownOption(
                    key = provider.providerId,
                    label = provider.providerName,
                )
            },
        )
    }
    val typeOptions = buildList {
        add(NuvioDropdownOption(key = "", label = stringResource(Res.string.cloud_library_type_all)))
        addAll(
            availableTypes.map { type ->
                NuvioDropdownOption(
                    key = type.name,
                    label = cloudLibraryTypeLabel(type),
                )
            },
        )
    }
    val selectedProviderName = uiState.providers
        .firstOrNull { provider -> provider.providerId == selectedProviderId }
        ?.providerName
        ?: stringResource(Res.string.cloud_library_provider_all)
    val selectedTypeLabel = selectedType?.let { type -> cloudLibraryTypeLabel(type) }
        ?: stringResource(Res.string.cloud_library_type_all)

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                NuvioDropdownChip(
                    title = stringResource(Res.string.cloud_library_select_provider),
                    label = selectedProviderName,
                    selectedKey = selectedProviderId.orEmpty(),
                    options = providerOptions,
                    enabled = providerOptions.size > 1,
                    onSelected = { option ->
                        onProviderSelected(option.key.ifBlank { null })
                    },
                )
                NuvioDropdownChip(
                    title = stringResource(Res.string.cloud_library_select_type),
                    label = selectedTypeLabel,
                    selectedKey = selectedType?.name.orEmpty(),
                    options = typeOptions,
                    enabled = typeOptions.size > 1,
                    onSelected = { option ->
                        val type = option.key
                            .takeIf { it.isNotBlank() }
                            ?.let(CloudLibraryItemType::valueOf)
                        onTypeSelected(type)
                    },
                )
            }
            IconButton(onClick = onRefresh) {
                Icon(
                    imageVector = Icons.Rounded.Refresh,
                    contentDescription = stringResource(Res.string.cloud_library_refresh),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun LibraryChip(
    label: String,
    selected: Boolean,
    loading: Boolean = false,
    error: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    expanded: Boolean = false,
) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = if (selected) colorScheme.primaryContainer else colorScheme.surfaceContainerLow,
        border = if (selected) BorderStroke(1.dp, colorScheme.primary.copy(alpha = 0.45f)) else null,
    ) {
        Row(
            modifier = if (expanded) {
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            } else {
                Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
            },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (expanded) Arrangement.Center else Arrangement.spacedBy(6.dp),
        ) {
            if (loading) {
                NuvioLoadingIndicator(
                    modifier = Modifier.size(12.dp),
                    color = colorScheme.primary,
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = when {
                    error -> colorScheme.error
                    selected -> colorScheme.onPrimaryContainer
                    else -> colorScheme.onSurfaceVariant
                },
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun CloudLibraryRow(
    item: CloudLibraryItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val playableCount = item.playableFiles.size
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .clickable(enabled = playableCount > 0, onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = item.name,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = cloudLibrarySubtitle(item),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = cloudLibraryStatusLine(item),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (playableCount > 0) {
                    IconButton(onClick = onClick) {
                        Icon(
                            imageVector = Icons.Rounded.PlayArrow,
                            contentDescription = stringResource(Res.string.action_play),
                        )
                    }
                }
            }
            item.progressFraction?.takeIf { it in 0f..0.999f }?.let { progress ->
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun CloudLibraryFilePicker(
    item: CloudLibraryItem,
    onBack: () -> Unit,
    onFileSelected: (CloudLibraryFile) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = stringResource(Res.string.action_back),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.name,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(Res.string.cloud_library_file_picker_title),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            val files = item.playableFiles
            if (files.isEmpty()) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = stringResource(Res.string.cloud_library_no_files_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(Res.string.cloud_library_no_files_message),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                files.forEach { file ->
                    CloudLibraryFileRow(
                        file = file,
                        onClick = { onFileSelected(file) },
                    )
                }
            }
        }
    }
}

@Composable
private fun CloudLibraryFileRow(
    file: CloudLibraryFile,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.58f),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .size(18.dp),
                    imageVector = Icons.AutoMirrored.Filled.InsertDriveFile,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Text(
                    modifier = Modifier.weight(1f),
                    text = file.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = file.sizeBytes?.let { size -> formatCloudBytes(size) }.orEmpty(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Icon(
                    imageVector = Icons.Rounded.PlayArrow,
                    contentDescription = stringResource(Res.string.cloud_library_play_file),
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun cloudLibrarySubtitle(item: CloudLibraryItem): String {
    val fileLine = when (val playableCount = item.playableFiles.size) {
        0 -> stringResource(Res.string.cloud_library_no_playable_files)
        1 -> item.playableFiles.first().name
        else -> stringResource(Res.string.cloud_library_playable_file_count, playableCount)
    }
    return listOf(item.providerName, cloudLibraryTypeLabel(item.type), fileLine).joinToString(" • ")
}

@Composable
private fun cloudLibraryStatusLine(item: CloudLibraryItem): String {
    val fallback = if (item.playableFiles.isEmpty()) {
        stringResource(Res.string.cloud_library_no_playable_files)
    } else {
        stringResource(Res.string.cloud_library_status_ready)
    }
    return listOfNotNull(
        item.status?.toDisplayStatus(),
        item.sizeBytes?.let(::formatCloudBytes),
        item.progressFraction?.let { "${(it * 100f).toInt()}%" },
    ).joinToString(" • ").ifBlank { fallback }
}

@Composable
private fun cloudLibraryTypeLabel(type: CloudLibraryItemType): String =
    when (type) {
        CloudLibraryItemType.Torrent -> stringResource(Res.string.cloud_library_type_torrents)
        CloudLibraryItemType.Usenet -> stringResource(Res.string.cloud_library_type_usenet)
        CloudLibraryItemType.WebDownload -> stringResource(Res.string.cloud_library_type_web)
        CloudLibraryItemType.File -> stringResource(Res.string.cloud_library_type_files)
    }

private fun formatCloudBytes(bytes: Long): String {
    if (bytes <= 0L) return "0 ${localizedByteUnit("B")}"
    val kib = 1024.0
    val mib = kib * 1024.0
    val gib = mib * 1024.0
    val value = bytes.toDouble()
    return when {
        value >= gib -> "${((value / gib) * 10.0).toInt() / 10.0} ${localizedByteUnit("GB")}"
        value >= mib -> "${((value / mib) * 10.0).toInt() / 10.0} ${localizedByteUnit("MB")}"
        value >= kib -> "${((value / kib) * 10.0).toInt() / 10.0} ${localizedByteUnit("KB")}"
        else -> "$bytes ${localizedByteUnit("B")}"
    }
}

private fun String.toDisplayStatus(): String =
    replace('_', ' ')
        .lowercase()
        .replaceFirstChar { it.titlecase() }

@Composable
private fun CloudLibrarySkeletonToolbar(
    modifier: Modifier = Modifier,
) {
    val brush = rememberCloudLibrarySkeletonBrush()
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CloudSkeletonBlock(brush = brush, width = 112.dp, height = 36.dp, cornerRadius = 12.dp)
            CloudSkeletonBlock(brush = brush, width = 92.dp, height = 36.dp, cornerRadius = 12.dp)
        }
    }
}

@Composable
private fun CloudLibrarySkeletonRow(
    modifier: Modifier = Modifier,
) {
    val brush = rememberCloudLibrarySkeletonBrush()
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    CloudSkeletonBlock(
                        brush = brush,
                        modifier = Modifier.fillMaxWidth(0.74f),
                        height = 18.dp,
                        cornerRadius = 6.dp,
                    )
                    CloudSkeletonBlock(
                        brush = brush,
                        modifier = Modifier.fillMaxWidth(0.9f),
                        height = 14.dp,
                        cornerRadius = 6.dp,
                    )
                    CloudSkeletonBlock(
                        brush = brush,
                        modifier = Modifier.fillMaxWidth(0.52f),
                        height = 12.dp,
                        cornerRadius = 6.dp,
                    )
                }
                CloudSkeletonBlock(brush = brush, width = 48.dp, height = 48.dp, cornerRadius = 24.dp)
            }
        }
    }
}

@Composable
private fun rememberCloudLibrarySkeletonBrush(): Brush {
    val shimmerColors = listOf(
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.9f),
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.48f),
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.9f),
    )
    val transition = rememberInfiniteTransition()
    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
    )
    return Brush.linearGradient(
        colors = shimmerColors,
        start = Offset(translateAnim - 200f, 0f),
        end = Offset(translateAnim, 0f),
    )
}

@Composable
private fun CloudSkeletonBlock(
    brush: Brush,
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp,
    cornerRadius: Dp,
) {
    val sizeModifier = if (width != null) {
        modifier.size(width = width, height = height)
    } else {
        modifier.height(height)
    }
    Box(
        modifier = sizeModifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(brush),
    )
}

@Composable
private fun LibraryReleaseCalendarPage(
    events: List<LibraryCalendarEvent>,
    isLoading: Boolean,
    onDismiss: () -> Unit,
    onPosterClick: ((LibraryItem) -> Unit)?,
) {
    val today = remember { parseLibraryCalendarDate(CurrentDateProvider.todayIsoDate()) ?: LibraryCalendarDate(1970, 1, 1) }
    val todayIso = today.iso
    val initialMonth = remember { initialLibraryCalendarMonth() }
    var calendarSelection by remember(events) {
        mutableStateOf(defaultLibraryCalendarSelection(events, initialMonth, todayIso))
    }
    val visibleMonth = calendarSelection.month
    val selectedDateIso = calendarSelection.dateIso
    val monthEvents = remember(events, visibleMonth) {
        events
            .filter { event -> event.date.year == visibleMonth.year && event.date.month == visibleMonth.month }
            .sortedWith(compareBy<LibraryCalendarEvent> { it.date.iso }.thenBy { it.sortTitle.lowercase() })
    }
    val eventsByDate = remember(events) { events.groupBy { event -> event.date.iso } }

    val selectedEvents = eventsByDate[selectedDateIso].orEmpty()
    val selectedDate = parseLibraryCalendarDate(selectedDateIso)

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
        ),
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    start = 20.dp,
                    top = 12.dp,
                    end = 20.dp,
                    bottom = 44.dp,
                ),
            ) {
                item {
                    LibraryCalendarTopBar(
                        title = stringResource(Res.string.library_calendar_title),
                        subtitle = stringResource(Res.string.library_calendar_exact_dates_only),
                        onBack = onDismiss,
                    )
                }

                if (events.isEmpty() && isLoading) {
                    item {
                        LibraryCalendarLoadingState()
                    }
                } else if (events.isEmpty()) {
                    item {
                        LibraryCalendarEmptyState()
                    }
                } else {
                    item {
                        LibraryCalendarCard(
                            month = visibleMonth,
                            monthEventCount = monthEvents.size,
                            eventsByDate = eventsByDate,
                            selectedDateIso = selectedDateIso,
                            todayIso = todayIso,
                            onPrevious = {
                                calendarSelection = defaultLibraryCalendarSelection(
                                    events = events,
                                    month = visibleMonth.previous(),
                                    todayIso = todayIso,
                                )
                            },
                            onNext = {
                                calendarSelection = defaultLibraryCalendarSelection(
                                    events = events,
                                    month = visibleMonth.next(),
                                    todayIso = todayIso,
                                )
                            },
                            onToday = {
                                calendarSelection = LibraryCalendarSelection(
                                    month = LibraryCalendarMonth(today.year, today.month),
                                    dateIso = todayIso,
                                )
                            },
                            onDateSelected = { date ->
                                calendarSelection = calendarSelection.copy(dateIso = date.iso)
                            },
                        )
                    }

                    item {
                        Spacer(modifier = Modifier.height(26.dp))
                        LibraryCalendarAgendaHeader(
                            selectedDate = selectedDate,
                            eventCount = selectedEvents.size,
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    if (selectedEvents.isEmpty()) {
                        item {
                            LibraryCalendarNoDayEvents()
                        }
                    } else {
                        items(
                            items = selectedEvents,
                            key = { event -> event.key },
                        ) { event ->
                            LibraryCalendarEventRow(
                                event = event,
                                todayIso = todayIso,
                                onClick = onPosterClick?.let { posterClick ->
                                    {
                                        onDismiss()
                                        posterClick(event.item)
                                    }
                                },
                            )
                        }
                    }

                    if (isLoading) {
                        item {
                            LibraryCalendarInlineLoading()
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(12.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun LibraryCalendarTopBar(
    title: String,
    subtitle: String,
    onBack: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 22.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        IconButton(
            onClick = onBack,
            modifier = Modifier.size(40.dp),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = stringResource(Res.string.action_back),
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(top = 2.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun LibraryCalendarGlyph(
    modifier: Modifier = Modifier,
    tint: Color,
    cutoutColor: Color,
) {
    Canvas(modifier = modifier) {
        val scale = size.minDimension / 14f
        fun x(value: Float) = value * scale
        fun y(value: Float) = value * scale

        drawRoundRect(
            color = tint,
            topLeft = Offset(x(1.5f), y(2.5f)),
            size = Size(x(11f), y(10f)),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(x(1.1f), y(1.1f)),
        )
        drawRect(
            color = cutoutColor,
            topLeft = Offset(x(2.6f), y(5.1f)),
            size = Size(x(8.8f), y(0.9f)),
        )
        drawRoundRect(
            color = tint,
            topLeft = Offset(x(3.5f), y(1.3f)),
            size = Size(x(1.5f), y(3.1f)),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(x(0.7f), y(0.7f)),
        )
        drawRoundRect(
            color = tint,
            topLeft = Offset(x(9f), y(1.3f)),
            size = Size(x(1.5f), y(3.1f)),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(x(0.7f), y(0.7f)),
        )

        val cell = x(1.15f)
        val gap = x(1.05f)
        val startX = x(4.1f)
        val startY = y(7.25f)
        repeat(3) { column ->
            repeat(2) { row ->
                drawRoundRect(
                    color = cutoutColor,
                    topLeft = Offset(startX + column * (cell + gap), startY + row * (cell + gap)),
                    size = Size(cell, cell),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(x(0.22f), y(0.22f)),
                )
            }
        }
    }
}


private fun LazyListScope.librarySections(
    displaySections: List<LibraryDisplaySection>,
    watchedKeys: Set<String>,
    fullyWatchedSeriesKeys: Set<String>,
    sortOption: LibrarySortOption,
    onPosterClick: ((LibraryItem) -> Unit)?,
    onSectionViewAllClick: ((LibrarySection, LibrarySortOption) -> Unit)?,
    onPosterLongClick: ((LibraryItem, LibrarySection) -> Unit)?,
    onDisintegrated: (String) -> Unit,
) {
    items(
        items = displaySections,
        key = { section -> "library-horizontal:${section.type}" },
    ) { section ->
        NuvioShelfSection(
            title = section.displayTitle,
            entries = section.previewEntries,
            modifier = libraryContentTransitionModifier(),
            headerHorizontalPadding = 16.dp,
            rowContentPadding = PaddingValues(horizontal = 16.dp),
            onViewAllClick = section.source
                ?.takeIf { it.items.size > LIBRARY_SECTION_PREVIEW_LIMIT }
                ?.let { source -> onSectionViewAllClick?.let { { it(source, sortOption) } } },
            viewAllPillSize = NuvioViewAllPillSize.Compact,
            key = { entry -> entry.globalKey },
            animatePlacement = true,
        ) { entry ->
            val item = entry.item
            val posterItem = item.toMetaPreview()
            val entrySource = entry.section
            DisintegratingContainer(
                disintegrating = entry.exiting,
                onDisintegrated = { onDisintegrated(entry.globalKey) },
            ) {
                HomePosterCard(
                    item = posterItem,
                    isWatched = WatchingState.isPosterWatched(
                        watchedKeys = watchedKeys,
                        item = posterItem,
                        fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
                    ),
                    onClick = if (entry.exiting) null else onPosterClick?.let { { it(item) } },
                    onLongClick = if (entry.exiting || entrySource == null) {
                        null
                    } else {
                        onPosterLongClick?.let { { it(item, entrySource) } }
                    },
                )
            }
        }
    }
}

@Composable
private fun LibraryCalendarLoadingState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(28.dp),
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 2.dp,
        )
        Text(
            text = stringResource(Res.string.library_calendar_loading),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LibraryCalendarInlineLoading() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 2.dp,
        )
    }
}

@Composable
private fun LibraryCalendarEmptyState() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.18f)),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(Res.string.library_calendar_empty_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stringResource(Res.string.library_calendar_empty_message),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LibraryCalendarCard(
    month: LibraryCalendarMonth,
    monthEventCount: Int,
    eventsByDate: Map<String, List<LibraryCalendarEvent>>,
    selectedDateIso: String?,
    todayIso: String,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
    onDateSelected: (LibraryCalendarDate) -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        shape = RoundedCornerShape(28.dp),
        border = BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.48f),
        ),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = onPrevious,
                    modifier = Modifier.size(38.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowLeft,
                        contentDescription = stringResource(Res.string.library_calendar_previous_month),
                        modifier = Modifier.size(22.dp),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 6.dp),
                ) {
                    Text(
                        text = month.displayTitle,
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = libraryCalendarReleaseCountText(monthEventCount),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Surface(
                    modifier = Modifier.clickable(onClick = onToday),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    shape = RoundedCornerShape(50),
                ) {
                    Text(
                        text = stringResource(Res.string.library_calendar_today),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                IconButton(
                    onClick = onNext,
                    modifier = Modifier.size(38.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                        contentDescription = stringResource(Res.string.library_calendar_next_month),
                        modifier = Modifier.size(22.dp),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            LibraryCalendarWeekdayHeader()
            LibraryCalendarMonthGrid(
                month = month,
                eventsByDate = eventsByDate,
                selectedDateIso = selectedDateIso,
                todayIso = todayIso,
                onDateSelected = onDateSelected,
            )
        }
    }
}

@Composable
private fun LibraryCalendarWeekdayHeader() {
    val labels = listOf(
        stringResource(Res.string.library_calendar_weekday_sun),
        stringResource(Res.string.library_calendar_weekday_mon),
        stringResource(Res.string.library_calendar_weekday_tue),
        stringResource(Res.string.library_calendar_weekday_wed),
        stringResource(Res.string.library_calendar_weekday_thu),
        stringResource(Res.string.library_calendar_weekday_fri),
        stringResource(Res.string.library_calendar_weekday_sat),
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
    ) {
        labels.forEach { label ->
            Text(
                text = label,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontSize = 10.sp,
                    lineHeight = 12.sp,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.68f),
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

@Composable
private fun LibraryCalendarMonthGrid(
    month: LibraryCalendarMonth,
    eventsByDate: Map<String, List<LibraryCalendarEvent>>,
    selectedDateIso: String?,
    todayIso: String,
    onDateSelected: (LibraryCalendarDate) -> Unit,
) {
    val cells = remember(month) { libraryCalendarCells(month) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        cells.chunked(7).forEach { week ->
            Row(
                modifier = Modifier.fillMaxWidth(),
            ) {
                week.forEach { date ->
                    if (date == null) {
                        Spacer(
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp),
                        )
                    } else {
                        val dayEvents = eventsByDate[date.iso].orEmpty()
                        val hasEvents = dayEvents.isNotEmpty()
                        val isSelected = selectedDateIso == date.iso
                        val isToday = todayIso == date.iso
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .clickable { onDateSelected(date) },
                            contentAlignment = Alignment.Center,
                        ) {
                            val dayColor = when {
                                isSelected -> MaterialTheme.colorScheme.onPrimary
                                hasEvents || isToday -> MaterialTheme.colorScheme.onSurface
                                else -> MaterialTheme.colorScheme.onSurfaceVariant
                            }
                            Box(
                                modifier = Modifier
                                    .size(38.dp)
                                    .clip(RoundedCornerShape(13.dp))
                                    .background(
                                        if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                                    )
                                    .then(
                                        if (!isSelected && isToday) {
                                            Modifier.border(
                                                BorderStroke(1.2.dp, MaterialTheme.colorScheme.primary),
                                                RoundedCornerShape(13.dp),
                                            )
                                        } else {
                                            Modifier
                                        },
                                    ),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = date.day.toString(),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = dayColor,
                                    fontWeight = if (hasEvents) FontWeight.Bold else FontWeight.Normal,
                                    modifier = if (hasEvents && isSelected) {
                                        Modifier.padding(bottom = 6.dp)
                                    } else {
                                        Modifier
                                    },
                                )
                                if (hasEvents && !isToday) {
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.BottomCenter)
                                            .padding(bottom = if (isSelected) 5.dp else 2.dp)
                                            .size(4.dp)
                                            .clip(CircleShape)
                                            .background(
                                                if (isSelected) {
                                                    MaterialTheme.colorScheme.onPrimary
                                                } else {
                                                    MaterialTheme.colorScheme.primary
                                                },
                                            ),
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
private fun LibraryCalendarAgendaHeader(
    selectedDate: LibraryCalendarDate?,
    eventCount: Int,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = stringResource(Res.string.library_calendar_agenda),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = selectedDate?.let(::displayLibraryCalendarEventDate).orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Surface(
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            shape = RoundedCornerShape(50),
        ) {
            Text(
                text = libraryCalendarReleaseCountText(eventCount),
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun libraryCalendarReleaseCountText(count: Int): String =
    if (count == 1) {
        stringResource(Res.string.library_calendar_release_count_single)
    } else {
        stringResource(Res.string.library_calendar_release_count, count)
    }

@Composable
private fun LibraryCalendarNoDayEvents() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
        ),
    ) {
        Row(
            modifier = Modifier.padding(18.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(42.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                shape = RoundedCornerShape(14.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    LibraryCalendarGlyph(
                        modifier = Modifier.size(19.dp),
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        cutoutColor = MaterialTheme.colorScheme.primaryContainer,
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = stringResource(Res.string.library_calendar_no_day_events_title),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(Res.string.library_calendar_no_day_events_message),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun LibraryCalendarEventRow(
    event: LibraryCalendarEvent,
    todayIso: String,
    onClick: (() -> Unit)?,
) {
    val isUpcoming = event.date.iso > todayIso
    val modifier = if (onClick != null) {
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
    } else {
        Modifier.fillMaxWidth()
    }
    Surface(
        modifier = modifier.padding(bottom = 10.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.38f),
        ),
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(13.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LibraryCalendarEventArtwork(event = event)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = event.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                event.subtitle?.let { subtitle ->
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = stringResource(
                        if (isUpcoming) {
                            Res.string.library_calendar_upcoming
                        } else {
                            Res.string.library_calendar_available
                        },
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            if (onClick != null) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(22.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun LibraryCalendarEventArtwork(event: LibraryCalendarEvent) {
    Box(
        modifier = Modifier
            .size(width = 104.dp, height = 62.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh),
        contentAlignment = Alignment.Center,
    ) {
        if (!event.imageUrl.isNullOrBlank()) {
            AsyncImage(
                model = event.imageUrl,
                contentDescription = event.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                shape = RoundedCornerShape(14.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = "${event.date.day} ${localizedShortMonthName(event.date.month)}",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

private data class LibraryCalendarEvent(
    val key: String,
    val date: LibraryCalendarDate,
    val rawReleaseInfo: String,
    val item: LibraryItem,
    val title: String,
    val subtitle: String? = null,
    val imageUrl: String? = null,
    val sortTitle: String = title,
)

private data class LibraryCalendarSelection(
    val month: LibraryCalendarMonth,
    val dateIso: String,
)

private data class LibraryCalendarDate(
    val year: Int,
    val month: Int,
    val day: Int,
) {
    val iso: String = "${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}"
}

private data class LibraryCalendarMonth(
    val year: Int,
    val month: Int,
) {
    val key: String = "${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}"
    val displayTitle: String = "${localizedMonthName(month)} $year"

    fun previous(): LibraryCalendarMonth =
        if (month == 1) LibraryCalendarMonth(year - 1, 12) else copy(month = month - 1)

    fun next(): LibraryCalendarMonth =
        if (month == 12) LibraryCalendarMonth(year + 1, 1) else copy(month = month + 1)
}

private suspend fun buildLibraryReleaseCalendarEvents(items: List<LibraryItem>): List<LibraryCalendarEvent> {
    val fallbackEvents = buildLibraryReleaseCalendarFallbackEvents(items)
    val episodeEvents = buildLibraryEpisodeCalendarEvents(items)
    val seriesWithEpisodeEvents = episodeEvents.map { it.item.id to it.item.type.lowercase() }.toSet()
    return (episodeEvents + fallbackEvents.filterNot { event ->
        event.item.isLibrarySeries() && (event.item.id to event.item.type.lowercase()) in seriesWithEpisodeEvents
    })
        .distinctBy { it.key }
        .sortedWith(compareBy<LibraryCalendarEvent> { it.date.iso }.thenBy { it.sortTitle.lowercase() })
}

private fun buildLibraryReleaseCalendarFallbackEvents(items: List<LibraryItem>): List<LibraryCalendarEvent> =
    items
        .asSequence()
        .mapNotNull { item ->
            val rawReleaseInfo = item.releaseInfo?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val date = parseLibraryCalendarDate(rawReleaseInfo) ?: return@mapNotNull null
            LibraryCalendarEvent(
                key = "item:${item.type}:${item.id}:${date.iso}",
                date = date,
                rawReleaseInfo = rawReleaseInfo,
                item = item,
                title = item.name,
                imageUrl = item.banner ?: item.poster,
                sortTitle = item.name,
            )
        }
        .sortedWith(compareBy<LibraryCalendarEvent> { it.date.iso }.thenBy { it.item.name.lowercase() })
        .toList()

private suspend fun buildLibraryEpisodeCalendarEvents(items: List<LibraryItem>): List<LibraryCalendarEvent> =
    coroutineScope {
        val events = mutableListOf<LibraryCalendarEvent>()
        items
            .filter(LibraryItem::isLibrarySeries)
            .chunked(4)
            .forEach { chunk ->
                events += chunk.map { item ->
                    async {
                        val details = MetaDetailsRepository.fetch(item.type, item.id) ?: return@async emptyList()
                        details.videos.mapNotNull { video -> video.toLibraryCalendarEvent(item) }
                    }
                }.awaitAll().flatten()
            }
        events
    }

private fun MetaVideo.toLibraryCalendarEvent(item: LibraryItem): LibraryCalendarEvent? {
    val rawReleaseInfo = released?.takeIf { it.isNotBlank() } ?: return null
    val date = parseLibraryCalendarDate(rawReleaseInfo) ?: return null
    val seasonNumber = season?.takeIf { it > 0 }
    val episodeNumber = episode?.takeIf { it > 0 }
    val episodeLabel = when {
        seasonNumber != null && episodeNumber != null -> "S${seasonNumber}E${episodeNumber}"
        episodeNumber != null -> "E$episodeNumber"
        else -> null
    }
    val subtitle = listOfNotNull(episodeLabel, title.takeIf { it.isNotBlank() })
        .joinToString(" - ")
        .takeIf { it.isNotBlank() }
    return LibraryCalendarEvent(
        key = "episode:${item.type}:${item.id}:${season ?: 0}:${episode ?: id}:${date.iso}",
        date = date,
        rawReleaseInfo = rawReleaseInfo,
        item = item,
        title = item.name,
        subtitle = subtitle,
        imageUrl = thumbnail ?: item.banner ?: item.poster,
        sortTitle = "${item.name} ${season ?: 0} ${episode ?: 0} $title",
    )
}

private fun LibraryItem.isLibrarySeries(): Boolean =
    type.equals("series", ignoreCase = true) ||
        type.equals("tv", ignoreCase = true) ||
        type.equals("show", ignoreCase = true) ||
        type.equals("tvshow", ignoreCase = true)

private fun parseLibraryCalendarDate(raw: String?): LibraryCalendarDate? {
    val datePart = raw
        ?.trim()
        ?.substringBefore('T')
        ?.takeIf { it.length == 10 }
        ?: return null
    val parts = datePart.split('-')
    if (parts.size != 3) return null
    val year = parts[0].toIntOrNull()?.takeIf { it in 1000..9999 } ?: return null
    val month = parts[1].toIntOrNull()?.takeIf { it in 1..12 } ?: return null
    val day = parts[2].toIntOrNull()?.takeIf { it in 1..daysInLibraryCalendarMonth(year, month) } ?: return null
    return LibraryCalendarDate(year, month, day)
}

private fun initialLibraryCalendarMonth(): LibraryCalendarMonth {
    val today = parseLibraryCalendarDate(CurrentDateProvider.todayIsoDate())
        ?: LibraryCalendarDate(1970, 1, 1)
    return LibraryCalendarMonth(today.year, today.month)
}

private fun defaultLibraryCalendarSelectedDate(
    monthEvents: List<LibraryCalendarEvent>,
    month: LibraryCalendarMonth,
    todayIso: String,
): String? {
    val isCurrentMonth = todayIso.take(7) == month.key
    return monthEvents
        .firstOrNull { event -> !isCurrentMonth || event.date.iso >= todayIso }
        ?.date
        ?.iso
        ?: monthEvents.firstOrNull()?.date?.iso
}

private fun defaultLibraryCalendarSelection(
    events: List<LibraryCalendarEvent>,
    month: LibraryCalendarMonth,
    todayIso: String,
): LibraryCalendarSelection {
    val monthEvents = events
        .filter { event -> event.date.year == month.year && event.date.month == month.month }
        .sortedWith(compareBy<LibraryCalendarEvent> { it.date.iso }.thenBy { it.sortTitle.lowercase() })
    return LibraryCalendarSelection(
        month = month,
        dateIso = defaultLibraryCalendarSelectedDate(monthEvents, month, todayIso)
            ?: LibraryCalendarDate(month.year, month.month, 1).iso,
    )
}

private fun displayLibraryCalendarEventDate(date: LibraryCalendarDate): String =
    "${localizedMonthName(date.month)} ${date.day}, ${date.year}"

private fun libraryCalendarCells(month: LibraryCalendarMonth): List<LibraryCalendarDate?> {
    val firstDayOffset = firstLibraryCalendarWeekdayOffset(month.year, month.month)
    val days = daysInLibraryCalendarMonth(month.year, month.month)
    val cells = MutableList<LibraryCalendarDate?>(firstDayOffset) { null }
    for (day in 1..days) {
        cells += LibraryCalendarDate(month.year, month.month, day)
    }
    while (cells.size < 42) {
        cells += null
    }
    return cells
}

private fun firstLibraryCalendarWeekdayOffset(year: Int, month: Int): Int {
    val epochDay = isoEpochDay(LibraryCalendarDate(year, month, 1).iso)
    val raw = (epochDay + 4L) % 7L
    return if (raw < 0L) (raw + 7L).toInt() else raw.toInt()
}

private fun daysInLibraryCalendarMonth(year: Int, month: Int): Int =
    when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        2 -> if (isLibraryCalendarLeapYear(year)) 29 else 28
        else -> 30
    }

private fun isLibraryCalendarLeapYear(year: Int): Boolean =
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

private fun isoEpochDay(date: String): Long {
    val year = date.substring(0, 4).toLong()
    val month = date.substring(5, 7).toLong()
    val day = date.substring(8, 10).toLong()

    val adjustedYear = year - if (month <= 2L) 1L else 0L
    val era = if (adjustedYear >= 0L) adjustedYear / 400L else (adjustedYear - 399L) / 400L
    val yearOfEra = adjustedYear - era * 400L
    val adjustedMonth = month + if (month > 2L) -3L else 9L
    val dayOfYear = (153L * adjustedMonth + 2L) / 5L + day - 1L
    val dayOfEra = yearOfEra * 365L + yearOfEra / 4L - yearOfEra / 100L + dayOfYear
    return era * 146_097L + dayOfEra - 719_468L
}

private enum class LibraryViewMode {
    Saved,
    Cloud,
}

private const val LIBRARY_SECTION_PREVIEW_LIMIT = 18

private data class LibraryDisplayEntry(
    val globalKey: String,
    val item: LibraryItem,
    val section: LibrarySection?,
    val exiting: Boolean,
)

private data class LibraryDisplaySection(
    val source: LibrarySection?,
    val type: String,
    val displayTitle: String,
    val previewEntries: List<LibraryDisplayEntry>,
)

private class LibraryExitingEntry(
    val item: LibraryItem,
    val sectionType: String,
    val sectionTitle: String,
    val index: Int,
)

private class LibraryDisintegrationHolder {
    private val tracker = ScopedDisintegrationTracker<LibrarySourceMode, String, LibraryExitingEntry> { entry ->
        librarySectionItemKey(entry.sectionType, entry.item)
    }

    fun onExited(globalKey: String) {
        tracker.onDisintegrated(globalKey)
    }

    fun reset() {
        tracker.reset()
    }

    fun sync(
        sourceMode: LibrarySourceMode,
        sections: List<LibrarySection>,
        previewLimit: Int,
        request: DisintegrationRequest<String>?,
    ): List<LibraryDisplaySection> {
        val current = ArrayList<LibraryExitingEntry>()
        sections.forEach { section ->
            section.items.take(previewLimit).forEachIndexed { index, item ->
                current += LibraryExitingEntry(item, section.type, section.displayTitle, index)
            }
        }
        val exitingBySection = tracker.sync(sourceMode, current, request)
            .asSequence()
            .filter { entry -> entry.exiting }
            .map { entry -> entry.item }
            .groupBy { entry -> entry.sectionType }
        val seenTypes = HashSet<String>(sections.size)
        val result = ArrayList<LibraryDisplaySection>(sections.size + 1)

        for (section in sections) {
            seenTypes += section.type
            val entries = ArrayList<LibraryDisplayEntry>(previewLimit + 1)
            section.items.take(previewLimit).forEach { item ->
                entries += LibraryDisplayEntry(
                    globalKey = librarySectionItemKey(section.type, item),
                    item = item,
                    section = section,
                    exiting = false,
                )
            }
            exitingBySection[section.type]?.sortedBy { it.index }?.forEach { ex ->
                val key = librarySectionItemKey(section.type, ex.item)
                if (entries.none { it.globalKey == key }) {
                    entries.add(
                        ex.index.coerceIn(0, entries.size),
                        LibraryDisplayEntry(key, ex.item, section, exiting = true),
                    )
                }
            }
            result += LibraryDisplaySection(section, section.type, section.displayTitle, entries)
        }

        for ((type, list) in exitingBySection) {
            if (type in seenTypes) continue
            val sorted = list.sortedBy { it.index }
            val entries = sorted.map { ex ->
                LibraryDisplayEntry(librarySectionItemKey(type, ex.item), ex.item, section = null, exiting = true)
            }
            result += LibraryDisplaySection(null, type, sorted.first().sectionTitle, entries)
        }

        return result
    }
}
