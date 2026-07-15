package com.nuvio.app.features.livetv

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.NuvioModalBottomSheet
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.dismissNuvioBottomSheet
import com.nuvio.app.core.ui.nuvio
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.live_tv_categories
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun LiveTvFilterPanelRow(
    groups: List<String>,
    selectedGroup: String?,
    favoritesOnly: Boolean,
    allLabel: String,
    favoritesLabel: String,
    categoryLabel: String,
    onAllSelected: () -> Unit,
    onFavoritesSelected: () -> Unit,
    onGroupSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LiveTvPanelFilterChip(
            label = allLabel,
            selected = selectedGroup.isNullOrBlank() && !favoritesOnly,
            onClick = onAllSelected,
        )
        LiveTvPanelFilterChip(
            label = favoritesLabel,
            selected = favoritesOnly,
            onClick = onFavoritesSelected,
        )
        if (groups.isNotEmpty()) {
            LiveTvCategoryPanelChip(
                label = selectedGroup?.takeIf { it.isNotBlank() && !favoritesOnly } ?: categoryLabel,
                selectedGroup = selectedGroup?.takeIf { it.isNotBlank() && !favoritesOnly },
                favoritesOnly = favoritesOnly,
                groups = groups,
                categoryTitle = categoryLabel,
                allLabel = allLabel,
                favoritesLabel = favoritesLabel,
                onAllSelected = onAllSelected,
                onFavoritesSelected = onFavoritesSelected,
                onGroupSelected = onGroupSelected,
            )
        }
    }
}

@Composable
private fun LiveTvPanelFilterChip(
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
                if (selected) {
                    Modifier
                } else {
                    Modifier.border(
                        width = NuvioTokens.Border.thin,
                        color = tokens.colors.borderSubtle,
                        shape = tokens.shapes.chip,
                    )
                },
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LiveTvCategoryPanelChip(
    label: String,
    selectedGroup: String?,
    favoritesOnly: Boolean,
    groups: List<String>,
    categoryTitle: String,
    allLabel: String,
    favoritesLabel: String,
    onAllSelected: () -> Unit,
    onFavoritesSelected: () -> Unit,
    onGroupSelected: (String) -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    var isSheetVisible by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val coroutineScope = rememberCoroutineScope()
    val selected = selectedGroup != null
    val shape = tokens.shapes.chip

    Row(
        modifier = Modifier
            .clip(shape)
            .background(if (selected) tokens.colors.overlaySelected else tokens.colors.surface)
            .border(
                width = if (selected) 0.dp else NuvioTokens.Border.thin,
                color = if (selected) Color.Transparent else tokens.colors.borderSubtle,
                shape = shape,
            )
            .clickable { isSheetVisible = true }
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

    if (isSheetVisible) {
        LiveTvCategoryOptionsSheet(
            title = categoryTitle,
            groups = groups,
            selectedGroup = selectedGroup,
            favoritesOnly = favoritesOnly,
            allLabel = allLabel,
            favoritesLabel = favoritesLabel,
            sheetState = sheetState,
            onDismiss = {
                coroutineScope.launch {
                    dismissNuvioBottomSheet(
                        sheetState = sheetState,
                        onDismiss = { isSheetVisible = false },
                    )
                }
            },
            onAllSelected = {
                onAllSelected()
                coroutineScope.launch {
                    dismissNuvioBottomSheet(
                        sheetState = sheetState,
                        onDismiss = { isSheetVisible = false },
                    )
                }
            },
            onFavoritesSelected = {
                onFavoritesSelected()
                coroutineScope.launch {
                    dismissNuvioBottomSheet(
                        sheetState = sheetState,
                        onDismiss = { isSheetVisible = false },
                    )
                }
            },
            onGroupSelected = { group ->
                onGroupSelected(group)
                coroutineScope.launch {
                    dismissNuvioBottomSheet(
                        sheetState = sheetState,
                        onDismiss = { isSheetVisible = false },
                    )
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LiveTvCategoryOptionsSheet(
    title: String,
    groups: List<String>,
    selectedGroup: String?,
    favoritesOnly: Boolean,
    allLabel: String,
    favoritesLabel: String,
    sheetState: SheetState,
    onDismiss: () -> Unit,
    onAllSelected: () -> Unit,
    onFavoritesSelected: () -> Unit,
    onGroupSelected: (String) -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    NuvioModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = Modifier.widthIn(max = 520.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = tokens.spacing.screenHorizontal),
        ) {
            Text(
                text = title,
                modifier = Modifier.padding(
                    horizontal = tokens.spacing.screenHorizontal,
                    vertical = NuvioTokens.Space.s14,
                ),
                style = MaterialTheme.typography.titleLarge,
                color = tokens.colors.textPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            LiveTvFilterSheetDivider()
            LiveTvFilterSheetRow(
                title = allLabel,
                icon = Icons.Rounded.Tv,
                selected = selectedGroup.isNullOrBlank() && !favoritesOnly,
                onClick = onAllSelected,
            )
            LiveTvFilterSheetDivider()
            LiveTvFilterSheetRow(
                title = favoritesLabel,
                icon = Icons.Rounded.Star,
                selected = favoritesOnly,
                onClick = onFavoritesSelected,
            )
            LiveTvFilterSheetDivider()
            Text(
                text = stringResource(Res.string.live_tv_categories),
                modifier = Modifier.padding(
                    horizontal = tokens.spacing.screenHorizontal,
                    vertical = NuvioTokens.Space.s10,
                ),
                style = MaterialTheme.typography.labelLarge,
                color = tokens.colors.textMuted,
                fontWeight = FontWeight.SemiBold,
            )
            LiveTvFilterSheetDivider()
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 420.dp),
            ) {
                items(
                    items = groups,
                    key = { group -> group },
                ) { group ->
                    LiveTvFilterSheetRow(
                        title = group,
                        selected = group == selectedGroup,
                        onClick = { onGroupSelected(group) },
                    )
                    if (group != groups.lastOrNull()) {
                        LiveTvFilterSheetDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun LiveTvFilterSheetRow(
    title: String,
    selected: Boolean,
    onClick: () -> Unit,
    icon: ImageVector? = null,
) {
    val tokens = MaterialTheme.nuvio
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = tokens.spacing.screenHorizontal, vertical = NuvioTokens.Space.s12),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
    ) {
        icon?.let {
            Icon(
                imageVector = it,
                contentDescription = null,
                modifier = Modifier.size(NuvioTokens.Icon.md),
                tint = tokens.colors.textSecondary,
            )
        }
        Text(
            text = title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyLarge,
            color = tokens.colors.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                modifier = Modifier.size(NuvioTokens.Icon.md),
                tint = tokens.colors.accent,
            )
        }
    }
}

@Composable
private fun LiveTvFilterSheetDivider() {
    HorizontalDivider(color = MaterialTheme.nuvio.colors.borderSubtle.copy(alpha = 0.7f))
}
