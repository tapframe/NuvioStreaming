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
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioNetworkOfflineCard
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioStatusModal
import com.nuvio.app.core.ui.NuvioToastController
import com.nuvio.app.core.ui.NuvioViewAllPillSize
import com.nuvio.app.core.ui.NuvioShelfSection
import com.nuvio.app.features.home.components.HomeEmptyStateCard
import com.nuvio.app.features.home.components.HomePosterCard
import com.nuvio.app.features.home.components.HomeSkeletonRow
import com.nuvio.app.features.profiles.ProfileRepository
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource

private data class LibraryRemovalTarget(
    val item: LibraryItem,
    val listKey: String? = null,
    val listTitle: String? = null,
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
    var pendingRemovalTarget by remember { mutableStateOf<LibraryRemovalTarget?>(null) }
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
                librarySections(
                    sections = uiState.sections,
                    onPosterClick = onPosterClick,
                    onSectionViewAllClick = onSectionViewAllClick,
                    onPosterLongClick = { item, section ->
                        pendingRemovalTarget = if (isTraktSource) {
                            LibraryRemovalTarget(
                                item = item,
                                listKey = section.type,
                                listTitle = section.displayTitle,
                            )
                        } else {
                            LibraryRemovalTarget(item = item)
                        }
                    },
                )
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

private fun LazyListScope.librarySections(
    sections: List<LibrarySection>,
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
            HomePosterCard(
                item = item.toMetaPreview(),
                onClick = onPosterClick?.let { { it(item) } },
                onLongClick = { onPosterLongClick(item, section) },
            )
        }
    }
}

private const val LIBRARY_SECTION_PREVIEW_LIMIT = 18
