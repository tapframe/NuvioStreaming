package com.nuvio.app.features.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Style
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.features.streams.STREAM_BADGE_IMPORT_LIMIT
import com.nuvio.app.features.streams.StreamBadgeChip
import com.nuvio.app.features.streams.StreamBadgeChipSize
import com.nuvio.app.features.streams.StreamBadgeFilter
import com.nuvio.app.features.streams.StreamBadgeImport
import com.nuvio.app.features.streams.StreamBadgeImportResult
import com.nuvio.app.features.streams.StreamBadgeRules
import com.nuvio.app.features.streams.StreamBadgeSettingsRepository
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_cancel
import nuvio.composeapp.generated.resources.action_close
import nuvio.composeapp.generated.resources.action_delete
import nuvio.composeapp.generated.resources.action_import
import nuvio.composeapp.generated.resources.settings_fusion_badge_group_title
import nuvio.composeapp.generated.resources.settings_fusion_badge_other_group_title
import nuvio.composeapp.generated.resources.settings_fusion_badge_preview_action
import nuvio.composeapp.generated.resources.settings_fusion_badge_preview_count
import nuvio.composeapp.generated.resources.settings_fusion_badge_preview_empty
import nuvio.composeapp.generated.resources.settings_fusion_badge_preview_title
import nuvio.composeapp.generated.resources.settings_fusion_badge_url_active
import nuvio.composeapp.generated.resources.settings_fusion_badge_url_inactive
import nuvio.composeapp.generated.resources.settings_fusion_badge_url_label
import nuvio.composeapp.generated.resources.settings_fusion_badge_url_status_summary
import nuvio.composeapp.generated.resources.settings_fusion_badge_urls_imported
import nuvio.composeapp.generated.resources.settings_fusion_badges_empty
import nuvio.composeapp.generated.resources.settings_fusion_badges_summary
import nuvio.composeapp.generated.resources.settings_stream_badge_urls_description
import nuvio.composeapp.generated.resources.settings_stream_badge_urls_title
import nuvio.composeapp.generated.resources.settings_stream_badges_section
import nuvio.composeapp.generated.resources.settings_stream_size_badges_description
import nuvio.composeapp.generated.resources.settings_stream_size_badges_title
import org.jetbrains.compose.resources.stringResource

internal fun LazyListScope.streamsSettingsContent(isTablet: Boolean) {
    item {
        val currentSettings by remember {
            StreamBadgeSettingsRepository.ensureLoaded()
            StreamBadgeSettingsRepository.uiState
        }.collectAsStateWithLifecycle()
        val currentRules = currentSettings.rules
        var showBadgeImportDialog by rememberSaveable { mutableStateOf(false) }

        SettingsSection(
            title = stringResource(Res.string.settings_stream_badges_section),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_stream_size_badges_title),
                    description = stringResource(Res.string.settings_stream_size_badges_description),
                    checked = currentSettings.showFileSizeBadges,
                    isTablet = isTablet,
                    onCheckedChange = StreamBadgeSettingsRepository::setShowFileSizeBadges,
                )
                SettingsNavigationRow(
                    title = stringResource(Res.string.settings_stream_badge_urls_title),
                    description = badgeRulesPreview(currentRules),
                    icon = Icons.Rounded.Style,
                    isTablet = isTablet,
                    onClick = { showBadgeImportDialog = true },
                )
            }
        }

        if (showBadgeImportDialog) {
            BadgeUrlManagerDialog(
                currentRules = currentRules,
                onDismiss = { showBadgeImportDialog = false },
            )
        }
    }
}

@Composable
private fun badgeRulesPreview(rules: StreamBadgeRules): String {
    val normalizedRules = rules.normalized()
    return if (normalizedRules.hasImport) {
        stringResource(
            Res.string.settings_fusion_badges_summary,
            normalizedRules.imports.size,
            STREAM_BADGE_IMPORT_LIMIT,
            normalizedRules.enabledFilterCount,
        )
    } else {
        stringResource(Res.string.settings_fusion_badges_empty)
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun BadgeUrlManagerDialog(
    currentRules: StreamBadgeRules,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val imports = currentRules.normalized().imports
    var draftUrl by rememberSaveable { mutableStateOf("") }
    var errorMessage by rememberSaveable { mutableStateOf<String?>(null) }
    var isImporting by rememberSaveable { mutableStateOf(false) }
    var previewImport by remember { mutableStateOf<StreamBadgeImport?>(null) }

    BasicAlertDialog(onDismissRequest = onDismiss) {
        SettingsDialogSurface(title = stringResource(Res.string.settings_stream_badge_urls_title)) {
            Text(
                text = stringResource(Res.string.settings_stream_badge_urls_description, STREAM_BADGE_IMPORT_LIMIT),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = draftUrl,
                onValueChange = {
                    draftUrl = it
                    errorMessage = null
                },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(Res.string.settings_fusion_badge_url_label)) },
                singleLine = false,
                minLines = 2,
                maxLines = 4,
                enabled = !isImporting,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.75f),
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f),
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    disabledContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(
                        Res.string.settings_fusion_badge_urls_imported,
                        imports.size,
                        STREAM_BADGE_IMPORT_LIMIT,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    enabled = !isImporting && draftUrl.isNotBlank(),
                    onClick = {
                        scope.launch {
                            isImporting = true
                            errorMessage = null
                            when (val result = StreamBadgeSettingsRepository.importStreamBadgeRulesFromUrl(draftUrl)) {
                                is StreamBadgeImportResult.Success -> {
                                    draftUrl = ""
                                    isImporting = false
                                }
                                is StreamBadgeImportResult.Error -> {
                                    errorMessage = result.message
                                    isImporting = false
                                }
                            }
                        }
                    },
                ) {
                    if (isImporting) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text(text = stringResource(Res.string.action_import), maxLines = 1)
                    }
                }
            }
            errorMessage?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            if (imports.isEmpty()) {
                Text(
                    text = stringResource(Res.string.settings_fusion_badges_empty),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 300.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(
                        items = imports,
                        key = { import -> import.sourceUrl },
                    ) { import ->
                        BadgeUrlRow(
                            import = import,
                            showActiveChoice = imports.size > 1,
                            enabled = !isImporting,
                            onActivate = {
                                StreamBadgeSettingsRepository.setActiveStreamBadgeRulesSource(import.sourceUrl)
                            },
                            onPreview = { previewImport = import },
                            onDelete = {
                                StreamBadgeSettingsRepository.deleteStreamBadgeRulesSource(import.sourceUrl)
                                if (previewImport?.sourceUrl.equals(import.sourceUrl, ignoreCase = true)) {
                                    previewImport = null
                                }
                            },
                        )
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    enabled = !isImporting,
                    onClick = onDismiss,
                ) {
                    Text(text = stringResource(Res.string.action_cancel), maxLines = 1)
                }
            }
        }
    }

    previewImport?.let { import ->
        BadgePreviewDialog(
            import = import,
            onDismiss = { previewImport = null },
        )
    }
}

@Composable
private fun BadgeUrlRow(
    import: StreamBadgeImport,
    showActiveChoice: Boolean,
    enabled: Boolean,
    onActivate: () -> Unit,
    onPreview: () -> Unit,
    onDelete: () -> Unit,
) {
    val containerColor = if (import.isActive) {
        MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
    }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = containerColor,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (showActiveChoice) {
                    RadioButton(
                        selected = import.isActive,
                        onClick = onActivate,
                        enabled = enabled,
                    )
                }
                Text(
                    text = import.sourceUrl,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                val status = if (import.isActive) {
                    stringResource(Res.string.settings_fusion_badge_url_active)
                } else {
                    stringResource(Res.string.settings_fusion_badge_url_inactive)
                }
                Text(
                    text = stringResource(
                        Res.string.settings_fusion_badge_url_status_summary,
                        status,
                        import.enabledFilterCount,
                        import.groups.size,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                TextButton(
                    enabled = enabled,
                    onClick = onPreview,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Visibility,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = stringResource(Res.string.settings_fusion_badge_preview_action), maxLines = 1)
                }
                IconButton(
                    enabled = enabled,
                    onClick = onDelete,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Delete,
                        contentDescription = stringResource(Res.string.action_delete),
                    )
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
private fun BadgePreviewDialog(
    import: StreamBadgeImport,
    onDismiss: () -> Unit,
) {
    val sections = badgePreviewSections(import)
    val badgeCount = sections.sumOf { it.filters.size }

    BasicAlertDialog(onDismissRequest = onDismiss) {
        SettingsDialogSurface(title = stringResource(Res.string.settings_fusion_badge_preview_title)) {
            Text(
                text = import.sourceUrl,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = stringResource(Res.string.settings_fusion_badge_preview_count, badgeCount),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (sections.isEmpty()) {
                Text(
                    text = stringResource(Res.string.settings_fusion_badge_preview_empty),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 460.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    items(
                        items = sections,
                        key = { section -> section.id },
                    ) { section ->
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = section.title,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                                fontWeight = FontWeight.SemiBold,
                            )
                            FlowRow(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                                verticalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                section.filters.forEach { filter ->
                                    StreamBadgeChip(
                                        imageURL = filter.imageURL,
                                        name = filter.name,
                                        tagColor = filter.tagColor,
                                        tagStyle = filter.tagStyle,
                                        borderColor = filter.borderColor,
                                        size = StreamBadgeChipSize.PREVIEW,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onDismiss) {
                    Text(text = stringResource(Res.string.action_close), maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun SettingsDialogSurface(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            content()
            Spacer(modifier = Modifier.height(2.dp))
        }
    }
}

private data class BadgePreviewSection(
    val id: String,
    val title: String,
    val filters: List<StreamBadgeFilter>,
)

@Composable
private fun badgePreviewSections(import: StreamBadgeImport): List<BadgePreviewSection> {
    val filters = import.filters.filter { it.imageURL.isNotBlank() }
    if (filters.isEmpty()) return emptyList()

    val filtersByGroupId = filters.groupBy { it.groupId }
    val usedGroupIds = mutableSetOf<String>()
    val sections = mutableListOf<BadgePreviewSection>()
    import.groups.forEachIndexed { index, group ->
        val groupFilters = filtersByGroupId[group.id].orEmpty()
        if (groupFilters.isNotEmpty()) {
            usedGroupIds += group.id
            val fallbackTitle = stringResource(Res.string.settings_fusion_badge_group_title, index + 1)
            sections += BadgePreviewSection(
                id = group.id.ifBlank { "group-$index" },
                title = group.name.ifBlank { fallbackTitle },
                filters = groupFilters,
            )
        }
    }

    val ungroupedFilters = filters.filter { it.groupId !in usedGroupIds }
    if (ungroupedFilters.isNotEmpty()) {
        sections += BadgePreviewSection(
            id = "other",
            title = stringResource(Res.string.settings_fusion_badge_other_group_title),
            filters = ungroupedFilters,
        )
    }
    return sections
}
