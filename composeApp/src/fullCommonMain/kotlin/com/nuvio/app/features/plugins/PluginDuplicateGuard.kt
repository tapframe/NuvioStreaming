package com.nuvio.app.features.plugins

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.NuvioPrimaryButton
import kotlinx.coroutines.delay
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.plugin_duplicates_disable
import nuvio.composeapp.generated.resources.plugin_duplicates_later
import nuvio.composeapp.generated.resources.plugin_duplicates_subtitle
import nuvio.composeapp.generated.resources.plugin_duplicates_title
import org.jetbrains.compose.resources.stringResource

/**
 * Detects scrapers that share the same `name` (case-insensitive) or `filename`
 * across repositories and shows a dialog inviting the user to disable the
 * duplicates. Reappears whenever a previously-disabled scraper id becomes
 * enabled again (so toggling a repository off then on resurfaces the prompt).
 */
@Composable
internal fun PluginDuplicateGuard(uiState: PluginsUiState) {
    val repoNameByUrl = remember(uiState.repositories) {
        uiState.repositories.associate { it.manifestUrl to it.name }
    }

    val currentEnabledIds = remember(uiState.scrapers) {
        uiState.scrapers.asSequence()
            .filter { it.enabled }
            .map { it.id }
            .toSet()
    }

    var dismissedSnapshot by remember { mutableStateOf<Set<String>?>(null) }

    LaunchedEffect(currentEnabledIds) {
        val snapshot = dismissedSnapshot
        if (snapshot != null && (currentEnabledIds - snapshot).isNotEmpty()) {
            dismissedSnapshot = null
        }
    }

    val rawGroups = remember(uiState.scrapers, repoNameByUrl) {
        computeDuplicateGroups(uiState.scrapers, repoNameByUrl)
    }

    var stableGroups by remember { mutableStateOf<List<DuplicateGroup>>(emptyList()) }
    LaunchedEffect(rawGroups) {
        if (rawGroups.isEmpty()) {
            stableGroups = emptyList()
        } else {
            // Debounce so refresh emits coalesce into a single comprehensive check.
            delay(500)
            stableGroups = rawGroups
        }
    }

    val showDialog = stableGroups.isNotEmpty() && dismissedSnapshot == null
    if (!showDialog) return

    DuplicateResolutionDialog(
        groups = stableGroups,
        onConfirm = {
            stableGroups.forEach { group ->
                group.duplicates.forEach { duplicate ->
                    PluginRepository.toggleScraper(duplicate.id, false)
                }
            }
        },
        onDismiss = { dismissedSnapshot = currentEnabledIds },
    )
}

internal data class DuplicateGroup(
    val keep: DuplicateEntry,
    val duplicates: List<DuplicateEntry>,
) {
    val totalToDisable: Int get() = duplicates.size
}

internal data class DuplicateEntry(
    val id: String,
    val name: String,
    val filename: String,
    val repositoryName: String,
)

internal fun computeDuplicateGroups(
    scrapers: List<PluginScraper>,
    repoNameByUrl: Map<String, String>,
): List<DuplicateGroup> {
    val enabled = scrapers.filter { it.enabled }
    if (enabled.size < 2) return emptyList()

    val n = enabled.size
    val parent = IntArray(n) { it }
    fun find(x: Int): Int {
        var r = x
        while (parent[r] != r) r = parent[r]
        parent[x] = r
        return r
    }
    fun union(a: Int, b: Int) {
        val ra = find(a)
        val rb = find(b)
        if (ra != rb) parent[ra] = rb
    }

    for (i in 0 until n) {
        for (j in i + 1 until n) {
            val a = enabled[i]
            val b = enabled[j]
            val nameEq = a.name.isNotBlank() && a.name.equals(b.name, ignoreCase = true)
            val fileEq = a.filename.isNotBlank() && a.filename.equals(b.filename, ignoreCase = true)
            if (nameEq || fileEq) union(i, j)
        }
    }

    return enabled.indices
        .groupBy { find(it) }
        .values
        .filter { it.size > 1 }
        .map { idxs ->
            val members = idxs.map { enabled[it] }.sortedBy { it.id }
            DuplicateGroup(
                keep = members.first().toDuplicateEntry(repoNameByUrl),
                duplicates = members.drop(1).map { it.toDuplicateEntry(repoNameByUrl) },
            )
        }
}

private fun PluginScraper.toDuplicateEntry(repoNameByUrl: Map<String, String>) =
    DuplicateEntry(
        id = id,
        name = name,
        filename = filename,
        repositoryName = repoNameByUrl[repositoryUrl].orEmpty(),
    )

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DuplicateResolutionDialog(
    groups: List<DuplicateGroup>,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val totalToDisable = groups.sumOf { it.totalToDisable }
    val bodySmallSize = MaterialTheme.typography.bodySmall.fontSize
    val onSurfaceVariant = MaterialTheme.colorScheme.onSurfaceVariant

    BasicAlertDialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(24.dp),
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text(
                    text = stringResource(Res.string.plugin_duplicates_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(Res.string.plugin_duplicates_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(16.dp))

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 320.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    groups.forEachIndexed { index, group ->
                        if (index > 0) Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = buildAnnotatedString {
                                append(group.keep.name)
                                if (group.keep.repositoryName.isNotBlank()) {
                                    withStyle(
                                        SpanStyle(
                                            color = onSurfaceVariant,
                                            fontSize = bodySmallSize,
                                        ),
                                    ) {
                                        append(" - ${group.keep.repositoryName}")
                                    }
                                }
                            },
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        group.duplicates.forEach { duplicate ->
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = buildAnnotatedString {
                                    append("- ${duplicate.name}")
                                    if (duplicate.repositoryName.isNotBlank()) {
                                        withStyle(SpanStyle(color = onSurfaceVariant)) {
                                            append(" - ${duplicate.repositoryName}")
                                        }
                                    }
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(stringResource(Res.string.plugin_duplicates_later))
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    NuvioPrimaryButton(
                        text = stringResource(Res.string.plugin_duplicates_disable, totalToDisable),
                        onClick = onConfirm,
                    )
                }
            }
        }
    }
}
