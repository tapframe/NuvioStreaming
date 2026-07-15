package com.nuvio.app.features.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.logging.InAppLogLevel
import com.nuvio.app.core.logging.InAppLogger
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.settings_advanced_debugging_clear_logs
import nuvio.composeapp.generated.resources.settings_advanced_debugging_clear_logs_description
import nuvio.composeapp.generated.resources.settings_advanced_debugging_copy_logs
import nuvio.composeapp.generated.resources.settings_advanced_debugging_copy_logs_description
import nuvio.composeapp.generated.resources.settings_advanced_debugging_empty
import nuvio.composeapp.generated.resources.settings_advanced_debugging_filter_all
import nuvio.composeapp.generated.resources.settings_advanced_debugging_filter_category
import nuvio.composeapp.generated.resources.settings_advanced_debugging_filter_level
import nuvio.composeapp.generated.resources.settings_advanced_debugging_log_viewer_description
import nuvio.composeapp.generated.resources.settings_advanced_debugging_no_filter_matches
import nuvio.composeapp.generated.resources.settings_advanced_debugging_showing_logs
import nuvio.composeapp.generated.resources.settings_advanced_section_debugging
import org.jetbrains.compose.resources.stringResource

private const val ALL_FILTER_VALUE = "__all__"
private const val MAX_DISPLAYED_LOG_LINES = 500

internal fun LazyListScope.debugLogsSettingsContent(
    isTablet: Boolean,
) {
    item {
        DebugLogsSection(isTablet = isTablet)
    }
}

@Composable
private fun DebugLogsSection(isTablet: Boolean) {
    val clipboardManager = LocalClipboardManager.current
    val logEntries by InAppLogger.entries.collectAsState()
    var selectedCategory by rememberSaveable { mutableStateOf(ALL_FILTER_VALUE) }
    var selectedLevel by rememberSaveable { mutableStateOf(ALL_FILTER_VALUE) }

    val categoryOptions = buildList {
        add(ALL_FILTER_VALUE)
        addAll(logEntries.map { it.category }.distinct().sorted())
        if (selectedCategory != ALL_FILTER_VALUE && selectedCategory !in this) {
            add(selectedCategory)
        }
    }
    val levelOptions = buildList {
        add(ALL_FILTER_VALUE)
        addAll(InAppLogLevel.values().map { it.label })
    }
    val filteredEntries = logEntries.filter { entry ->
        (selectedCategory == ALL_FILTER_VALUE || entry.category == selectedCategory) &&
            (selectedLevel == ALL_FILTER_VALUE || entry.level.label == selectedLevel)
    }
    val displayedEntries = filteredEntries.takeLast(MAX_DISPLAYED_LOG_LINES)
    val logText = displayedEntries.joinToString(separator = "\n") { it.line }
    val viewerText = when {
        logEntries.isEmpty() -> stringResource(Res.string.settings_advanced_debugging_empty)
        filteredEntries.isEmpty() -> stringResource(Res.string.settings_advanced_debugging_no_filter_matches)
        else -> logText
    }

    SettingsSection(
        title = stringResource(Res.string.settings_advanced_section_debugging),
        isTablet = isTablet,
    ) {
        SettingsGroup(isTablet = isTablet) {
            DebugLogFilterPanel(
                categoryOptions = categoryOptions,
                selectedCategory = selectedCategory,
                onCategorySelected = { selectedCategory = it },
                levelOptions = levelOptions,
                selectedLevel = selectedLevel,
                onLevelSelected = { selectedLevel = it },
                isTablet = isTablet,
            )
            SettingsGroupDivider(isTablet = isTablet)
            SettingsNavigationRow(
                title = stringResource(Res.string.settings_advanced_debugging_copy_logs),
                description = stringResource(
                    Res.string.settings_advanced_debugging_copy_logs_description,
                    displayedEntries.size,
                ),
                enabled = displayedEntries.isNotEmpty(),
                isTablet = isTablet,
                onClick = {
                    clipboardManager.setText(AnnotatedString(logText))
                },
            )
            SettingsGroupDivider(isTablet = isTablet)
            SettingsNavigationRow(
                title = stringResource(Res.string.settings_advanced_debugging_clear_logs),
                description = stringResource(Res.string.settings_advanced_debugging_clear_logs_description),
                enabled = logEntries.isNotEmpty(),
                isTablet = isTablet,
                onClick = InAppLogger::clear,
            )
            SettingsGroupDivider(isTablet = isTablet)
            DebugLogTextPanel(
                text = viewerText,
                isEmpty = logEntries.isEmpty() || filteredEntries.isEmpty(),
                displayedCount = displayedEntries.size,
                filteredCount = filteredEntries.size,
                retainedCount = logEntries.size,
                retainedLimit = InAppLogger.maxRetainedEntries,
                isTablet = isTablet,
            )
        }
    }
}

@Composable
private fun DebugLogFilterPanel(
    categoryOptions: List<String>,
    selectedCategory: String,
    onCategorySelected: (String) -> Unit,
    levelOptions: List<String>,
    selectedLevel: String,
    onLevelSelected: (String) -> Unit,
    isTablet: Boolean,
) {
    Column(
        modifier = Modifier.padding(
            horizontal = if (isTablet) 20.dp else 16.dp,
            vertical = 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        DebugLogFilterRow(
            title = stringResource(Res.string.settings_advanced_debugging_filter_category),
            options = categoryOptions,
            selectedOption = selectedCategory,
            onSelected = onCategorySelected,
        )
        DebugLogFilterRow(
            title = stringResource(Res.string.settings_advanced_debugging_filter_level),
            options = levelOptions,
            selectedOption = selectedLevel,
            onSelected = onLevelSelected,
        )
    }
}

@Composable
private fun DebugLogFilterRow(
    title: String,
    options: List<String>,
    selectedOption: String,
    onSelected: (String) -> Unit,
) {
    val horizontalScrollState = rememberScrollState()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.SemiBold,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(horizontalScrollState),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { option ->
                DebugLogFilterChip(
                    label = option.toFilterLabel(),
                    selected = option == selectedOption,
                    onClick = { onSelected(option) },
                )
            }
        }
    }
}

@Composable
private fun DebugLogFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    Surface(
        color = if (selected) colorScheme.primaryContainer else colorScheme.surfaceVariant.copy(alpha = 0.45f),
        contentColor = if (selected) colorScheme.onPrimaryContainer else colorScheme.onSurfaceVariant,
        shape = RoundedCornerShape(999.dp),
        border = BorderStroke(
            1.dp,
            if (selected) colorScheme.primary.copy(alpha = 0.55f) else colorScheme.outlineVariant,
        ),
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
        )
    }
}

@Composable
private fun DebugLogTextPanel(
    text: String,
    isEmpty: Boolean,
    displayedCount: Int,
    filteredCount: Int,
    retainedCount: Int,
    retainedLimit: Int,
    isTablet: Boolean,
) {
    val verticalScrollState = rememberScrollState()
    val horizontalScrollState = rememberScrollState()

    SelectionContainer {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = if (isTablet) 320.dp else 260.dp, max = if (isTablet) 560.dp else 420.dp)
                .horizontalScroll(horizontalScrollState)
                .verticalScroll(verticalScrollState)
                .padding(horizontal = if (isTablet) 20.dp else 16.dp, vertical = 16.dp),
        ) {
            Text(
                text = text,
                modifier = Modifier.widthIn(min = if (isTablet) 920.dp else 760.dp),
                style = MaterialTheme.typography.bodySmall,
                color = if (isEmpty) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                fontFamily = FontFamily.Monospace,
                softWrap = false,
            )
        }
    }
    Spacer(modifier = Modifier.height(2.dp))
    Text(
        text = stringResource(
            Res.string.settings_advanced_debugging_showing_logs,
            displayedCount,
            filteredCount,
            retainedCount,
            retainedLimit,
        ),
        modifier = Modifier.padding(horizontal = if (isTablet) 20.dp else 16.dp, vertical = 0.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(modifier = Modifier.height(4.dp))
    Text(
        text = stringResource(Res.string.settings_advanced_debugging_log_viewer_description),
        modifier = Modifier.padding(horizontal = if (isTablet) 20.dp else 16.dp, vertical = 0.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(modifier = Modifier.height(16.dp))
}

@Composable
private fun String.toFilterLabel(): String =
    if (this == ALL_FILTER_VALUE) {
        stringResource(Res.string.settings_advanced_debugging_filter_all)
    } else {
        this
    }
