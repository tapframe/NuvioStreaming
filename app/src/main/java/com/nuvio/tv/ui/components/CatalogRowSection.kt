package com.nuvio.tv.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.nuvio.tv.domain.model.CatalogRow
import com.nuvio.tv.ui.theme.NuvioColors

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun CatalogRowSection(
    catalogRow: CatalogRow,
    onItemClick: (String, String, String) -> Unit,
    onLoadMore: () -> Unit,
    modifier: Modifier = Modifier,
    initialScrollIndex: Int = 0,
    focusedItemIndex: Int = -1,
    onItemFocused: (itemIndex: Int) -> Unit = {}
) {
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = initialScrollIndex
    )

    // Restore scroll position if needed
    LaunchedEffect(initialScrollIndex) {
        if (initialScrollIndex > 0) {
            listState.scrollToItem(initialScrollIndex)
        }
    }

    // Track which item has focus
    var currentFocusedIndex by remember { mutableStateOf(-1) }
    val itemFocusRequester = remember { FocusRequester() }

    // Restore focus to specific item if requested
    LaunchedEffect(focusedItemIndex) {
        if (focusedItemIndex >= 0 && focusedItemIndex < catalogRow.items.size) {
            kotlinx.coroutines.delay(100)  // Wait for composition
            try {
                itemFocusRequester.requestFocus()
            } catch (e: IllegalStateException) {
                // Item not yet composed, ignore
            }
        }
    }

    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleItem = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = listState.layoutInfo.totalItemsCount
            lastVisibleItem >= totalItems - 5 && catalogRow.hasMore && !catalogRow.isLoading
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) {
            onLoadMore()
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 48.dp, end = 48.dp, bottom = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = catalogRow.catalogName,
                    style = MaterialTheme.typography.headlineMedium,
                    color = NuvioColors.TextPrimary
                )
                Text(
                    text = "from ${catalogRow.addonName}",
                    style = MaterialTheme.typography.labelMedium,
                    color = NuvioColors.TextTertiary
                )
            }
        }

        LazyRow(
            state = listState,
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            itemsIndexed(
                items = catalogRow.items,
                key = { _, item -> "${catalogRow.type}_${catalogRow.catalogId}_${item.id}" }
            ) { index, item ->
                ContentCard(
                    item = item,
                    onClick = { onItemClick(item.id, item.type.toApiString(), catalogRow.addonBaseUrl) },
                    modifier = Modifier.onFocusChanged { focusState ->
                        if (focusState.isFocused) {
                            currentFocusedIndex = index
                            onItemFocused(index)
                        }
                    },
                    focusRequester = if (index == focusedItemIndex) itemFocusRequester else null
                )
            }

            if (catalogRow.isLoading) {

                item {

                    Box(
                        modifier = Modifier
                            .width(150.dp)
                            .height(225.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        LoadingIndicator()
                    }
                }

            }
        }
    }
}
