package com.nuvio.tv.ui.screens.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.nuvio.tv.domain.model.ContentType
import com.nuvio.tv.ui.components.ContentCard
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.theme.NuvioTheme

private enum class LibraryTab(val label: String, val type: ContentType) {
    Movies("Movies", ContentType.MOVIE),
    Series("Series", ContentType.SERIES)
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LibraryScreen(
    viewModel: LibraryViewModel = hiltViewModel(),
    onNavigateToDetail: (String, String, String?) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedTab by rememberSaveable { mutableStateOf(LibraryTab.Movies) }

    val filteredItems = uiState.items.filter {
        ContentType.fromString(it.type) == selectedTab.type
    }

    TvLazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(NuvioColors.Background),
        contentPadding = PaddingValues(vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        item {
            LibraryTabs(
                selectedTab = selectedTab,
                onTabSelected = { selectedTab = it }
            )
        }

        item {
            if (filteredItems.isEmpty()) {
                Text(
                    text = "No ${selectedTab.label.lowercase()} saved yet",
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioTheme.extendedColors.textSecondary,
                    modifier = Modifier.padding(start = 48.dp)
                )
            }
        }

        if (filteredItems.isNotEmpty()) {
            item {
                TvLazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 48.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(filteredItems, key = { it.id }) { item ->
                        ContentCard(
                            item = item.toMetaPreview(),
                            onClick = {
                                onNavigateToDetail(item.id, item.type, item.addonBaseUrl)
                            }
                        )
                    }
                }
            }
        }

        item { Spacer(modifier = Modifier.height(12.dp)) }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun LibraryTabs(
    selectedTab: LibraryTab,
    onTabSelected: (LibraryTab) -> Unit
) {
    TvLazyRow(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 48.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(LibraryTab.values().toList(), key = { it.name }) { tab ->
            var isFocused by remember { mutableStateOf(false) }
            val isSelected = tab == selectedTab

            Card(
                onClick = { onTabSelected(tab) },
                modifier = Modifier.onFocusChanged { isFocused = it.isFocused },
                shape = CardDefaults.shape(shape = RoundedCornerShape(20.dp)),
                colors = CardDefaults.colors(
                    containerColor = if (isSelected) NuvioColors.SurfaceVariant else NuvioColors.BackgroundCard,
                    focusedContainerColor = NuvioColors.Primary
                ),
                border = CardDefaults.border(
                    focusedBorder = Border(
                        border = BorderStroke(2.dp, NuvioColors.FocusRing),
                        shape = RoundedCornerShape(20.dp)
                    )
                ),
                scale = CardDefaults.scale(focusedScale = 1.0f)
            ) {
                Text(
                    text = tab.label,
                    style = MaterialTheme.typography.titleMedium,
                    color = when {
                        isFocused -> NuvioColors.OnPrimary
                        isSelected -> NuvioColors.TextPrimary
                        else -> NuvioTheme.extendedColors.textSecondary
                    },
                    modifier = Modifier.padding(vertical = 10.dp, horizontal = 20.dp)
                )
            }
        }
    }
}
