package com.nuvio.tv.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.ExperimentalTvMaterial3Api
import com.nuvio.tv.ui.components.CatalogRowSection
import com.nuvio.tv.ui.components.ContinueWatchingSection
import com.nuvio.tv.ui.components.ErrorState
import com.nuvio.tv.ui.components.LoadingIndicator
import com.nuvio.tv.ui.theme.NuvioColors

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: HomeViewModel = hiltViewModel(),
    onNavigateToDetail: (String, String, String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusState by viewModel.focusState.collectAsState()

    val columnListState = rememberLazyListState(
        initialFirstVisibleItemIndex = focusState.verticalScrollIndex,
        initialFirstVisibleItemScrollOffset = focusState.verticalScrollOffset
    )

    // Restore scroll position when state is available
    LaunchedEffect(focusState.verticalScrollIndex, focusState.verticalScrollOffset) {
        if (focusState.verticalScrollIndex > 0 || focusState.verticalScrollOffset > 0) {
            columnListState.scrollToItem(
                focusState.verticalScrollIndex,
                focusState.verticalScrollOffset
            )
        }
    }

    // Track which row and item have focus
    var currentFocusedRowIndex by remember { mutableStateOf(focusState.focusedRowIndex) }
    var currentFocusedItemIndex by remember { mutableStateOf(focusState.focusedItemIndex) }
    val catalogRowScrollStates = remember { mutableMapOf<String, Int>() }

    // Save scroll position when leaving screen
    DisposableEffect(Unit) {
        onDispose {
            viewModel.saveFocusState(
                verticalScrollIndex = columnListState.firstVisibleItemIndex,
                verticalScrollOffset = columnListState.firstVisibleItemScrollOffset,
                focusedRowIndex = currentFocusedRowIndex,
                focusedItemIndex = currentFocusedItemIndex,
                catalogRowScrollStates = catalogRowScrollStates.toMap()
            )
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(NuvioColors.Background)
    ) {
        when {
            uiState.isLoading && uiState.catalogRows.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    LoadingIndicator()
                }
            }
            uiState.error != null && uiState.catalogRows.isEmpty() -> {
                ErrorState(
                    message = uiState.error ?: "An error occurred",
                    onRetry = { viewModel.onEvent(HomeEvent.OnRetry) }
                )
            }
            else -> {
                LazyColumn(
                    state = columnListState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(vertical = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(32.dp)
                ) {
                    // Continue Watching section at the top
                    if (uiState.continueWatchingItems.isNotEmpty()) {
                        item(key = "continue_watching") {
                            ContinueWatchingSection(
                                items = uiState.continueWatchingItems,
                                onItemClick = { progress ->
                                    onNavigateToDetail(
                                        progress.contentId,
                                        progress.contentType,
                                        ""  // No specific addon
                                    )
                                }
                            )
                        }
                    }
                    
                    itemsIndexed(
                        items = uiState.catalogRows,
                        key = { _, item -> "${item.addonId}_${item.type}_${item.catalogId}" }
                    ) { index, catalogRow ->
                        val catalogKey = "${catalogRow.addonId}_${catalogRow.type.toApiString()}_${catalogRow.catalogId}"
                        val shouldRestoreFocus = index == focusState.focusedRowIndex
                        val focusedItemIndex = if (shouldRestoreFocus) focusState.focusedItemIndex else -1

                        CatalogRowSection(
                            catalogRow = catalogRow,
                            onItemClick = { id, type, addonBaseUrl ->
                                onNavigateToDetail(id, type, addonBaseUrl)
                            },
                            onLoadMore = {
                                viewModel.onEvent(
                                    HomeEvent.OnLoadMoreCatalog(
                                        catalogId = catalogRow.catalogId,
                                        addonId = catalogRow.addonId,
                                        type = catalogRow.type.toApiString()
                                    )
                                )
                            },
                            initialScrollIndex = focusState.catalogRowScrollStates[catalogKey] ?: 0,
                            focusedItemIndex = focusedItemIndex,
                            onItemFocused = { itemIndex ->
                                currentFocusedRowIndex = index
                                currentFocusedItemIndex = itemIndex
                                catalogRowScrollStates[catalogKey] = itemIndex
                            }
                        )
                    }
                }
            }
        }
    }
}
