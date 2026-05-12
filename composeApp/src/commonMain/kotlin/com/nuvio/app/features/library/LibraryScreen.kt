package com.nuvio.app.features.library

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.network.NetworkCondition
import com.nuvio.app.core.network.NetworkStatusRepository
import com.nuvio.app.core.ui.NuvioPosterActionSheet
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioNetworkOfflineCard
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioToastController
import com.nuvio.app.core.ui.NuvioViewAllPillSize
import com.nuvio.app.core.ui.NuvioShelfSection
import com.nuvio.app.features.home.components.HomeEmptyStateCard
import com.nuvio.app.features.home.components.HomePosterCard
import com.nuvio.app.features.home.components.HomeSkeletonRow
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watching.application.WatchingActions
import com.nuvio.app.features.watching.application.WatchingState
import kotlinx.coroutines.launch

private data class LibraryActionTarget(
    val item: LibraryItem,
    val section: LibrarySection,
)

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
    val networkStatusUiState by NetworkStatusRepository.uiState.collectAsStateWithLifecycle()
    val watchedUiState by remember {
        WatchedRepository.ensureLoaded()
        WatchedRepository.uiState
    }.collectAsStateWithLifecycle()
    var actionTarget by remember { mutableStateOf<LibraryActionTarget?>(null) }
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
                    title = if (isTraktSource) "Trakt Library" else "Library",
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                Spacer(modifier = Modifier.height(6.dp))
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
                            title = if (isTraktSource) "Couldn't load Trakt library" else "Couldn't load library",
                            message = uiState.errorMessage.orEmpty(),
                            actionLabel = "Retry",
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
                            title = if (isTraktSource) "Your Trakt library is empty" else "Your library is empty",
                            message = if (isTraktSource) {
                                "Connect Trakt and save titles to your watchlist or personal lists."
                            } else {
                                "Saved titles will appear here after you tap Save on a details screen."
                            },
                        )
                    }
                }
            }

            else -> {
                librarySections(
                    sections = uiState.sections,
                    watchedKeys = watchedUiState.watchedKeys,
                    onPosterClick = onPosterClick,
                    onSectionViewAllClick = onSectionViewAllClick,
                    onPosterLongClick = { item, section ->
                        actionTarget = LibraryActionTarget(item = item, section = section)
                    },
                )
            }
        }
    }

    // Action sheet — same UI as home screen poster long-press
    val target = actionTarget
    if (target != null) {
        val preview = target.item.toMetaPreview()
        NuvioPosterActionSheet(
            item = preview,
            isSaved = LibraryRepository.isSaved(preview.id, preview.type),
            isWatched = WatchingState.isPosterWatched(
                watchedKeys = watchedUiState.watchedKeys,
                item = preview,
            ),
            onDismiss = { actionTarget = null },
            onToggleLibrary = {
                actionTarget = null
                val libraryItem = target.item
                if (isTraktSource) {
                    coroutineScope.launch {
                        runCatching {
                            LibraryRepository.removeFromList(
                                libraryItem,
                                target.section.type,
                            )
                        }.onFailure { error ->
                            NuvioToastController.show(
                                error.message ?: "Failed to update Trakt list",
                            )
                        }
                    }
                } else {
                    LibraryRepository.toggleSaved(libraryItem)
                }
            },
            onToggleWatched = {
                actionTarget = null
                coroutineScope.launch {
                    WatchingActions.togglePosterWatched(preview)
                }
            },
        )
    }
}

private fun LazyListScope.librarySections(
    sections: List<LibrarySection>,
    watchedKeys: Set<String>,
    onPosterClick: ((LibraryItem) -> Unit)?,
    onSectionViewAllClick: ((LibrarySection) -> Unit)?,
    onPosterLongClick: (LibraryItem, LibrarySection) -> Unit,
) {
    items(
        items = sections,
        key = { section -> section.type },
    ) { section ->
        val previewItems = section.items.take(LIBRARY_SECTION_PREVIEW_LIMIT)
        NuvioShelfSection(
            title = section.displayTitle,
            entries = previewItems,
            headerHorizontalPadding = 16.dp,
            rowContentPadding = PaddingValues(horizontal = 16.dp),
            onViewAllClick = if (section.items.size > LIBRARY_SECTION_PREVIEW_LIMIT) {
                onSectionViewAllClick?.let { { it(section) } }
            } else {
                null
            },
            viewAllPillSize = NuvioViewAllPillSize.Compact,
            key = { item -> "${item.type}:${item.id}" },
        ) { item ->
            val preview = item.toMetaPreview()
            HomePosterCard(
                item = preview,
                isWatched = WatchingState.isPosterWatched(
                    watchedKeys = watchedKeys,
                    item = preview,
                ),
                onClick = onPosterClick?.let { { it(item) } },
                onLongClick = { onPosterLongClick(item, section) },
            )
        }
    }
}

private const val LIBRARY_SECTION_PREVIEW_LIMIT = 18
