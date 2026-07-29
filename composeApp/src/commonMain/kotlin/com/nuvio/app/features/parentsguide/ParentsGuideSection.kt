package com.nuvio.app.features.parentsguide

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

@Composable
fun ParentsGuideSection(
    state: ParentsGuideUiState,
    showTimestamps: Boolean = true,
    hideSpoilersByDefault: Boolean = true,
    initiallyExpanded: Boolean = false,
    onRetry: () -> Unit,
    onContribute: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(initiallyExpanded) }
    var showSpoilers by remember { mutableStateOf(!hideSpoilersByDefault) }
    val expandedCategories = remember { mutableStateMapOf<ParentsGuideCategoryType, Boolean>() }
    val title = stringResource(Res.string.parents_guide_title)

    Column(modifier = modifier.fillMaxWidth().animateContentSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .sizeIn(minHeight = 48.dp)
                .clickable(role = Role.Button) { expanded = !expanded }
                .semantics { heading(); contentDescription = title }
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Icon(
                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = stringResource(if (expanded) Res.string.parents_guide_collapse else Res.string.parents_guide_expand),
            )
        }

        when (state) {
            is ParentsGuideUiState.Available -> state.data.guide.overallSummary?.takeIf(String::isNotBlank)?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            is ParentsGuideUiState.Unavailable -> if (!expanded) {
                Text(stringResource(Res.string.parents_guide_unavailable), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> Unit
        }

        AnimatedVisibility(expanded) {
            when (state) {
                ParentsGuideUiState.Loading -> LoadingGuide()
                is ParentsGuideUiState.Available -> Column {
                    if (state.data.guide.overallStatus == ParentsGuideStatus.PARTIAL) {
                        Text(
                            stringResource(Res.string.parents_guide_partial),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 8.dp),
                        )
                    }
                    if (state.isSeriesFallback) {
                        Text(stringResource(Res.string.parents_guide_series_fallback), style = MaterialTheme.typography.labelMedium)
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { showSpoilers = !showSpoilers }) {
                            Text(stringResource(if (showSpoilers) Res.string.parents_guide_hide_spoilers else Res.string.parents_guide_show_spoilers))
                        }
                    }
                    state.data.guide.categories.forEach { category ->
                        ParentsGuideCategoryRow(
                            category = category,
                            expanded = expandedCategories[category.category] == true,
                            showSpoilers = showSpoilers,
                            showTimestamps = showTimestamps,
                            onToggle = { expandedCategories[category.category] = expandedCategories[category.category] != true },
                        )
                    }
                    state.data.guide.sources.forEach { source ->
                        Text(
                            text = "${stringResource(Res.string.parents_guide_source)}: ${source.sourceName}${source.attributionText?.let { " — $it" }.orEmpty()}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    if (state.data.guide.categories.any { category -> category.scenes.any { it.startSeconds != null } }) {
                        Text(stringResource(Res.string.parents_guide_timestamp_disclaimer), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                    }
                }
                is ParentsGuideUiState.Unavailable -> UnavailableGuide(onContribute)
                is ParentsGuideUiState.Error -> Column(modifier = Modifier.padding(vertical = 8.dp)) {
                    Text(stringResource(Res.string.parents_guide_error), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = onRetry) { Text(stringResource(Res.string.parents_guide_retry)) }
                }
            }
        }
    }
}

@Composable
fun ParentsGuideCategoryRow(
    category: ParentsGuideCategory,
    expanded: Boolean,
    showSpoilers: Boolean,
    showTimestamps: Boolean,
    onToggle: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp).clickable(role = Role.Button, onClick = onToggle).padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(category.category.labelResource()), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            SeverityBadge(category.severity)
            Icon(if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, contentDescription = stringResource(if (expanded) Res.string.parents_guide_hide_scenes else Res.string.parents_guide_show_scenes))
        }
        AnimatedVisibility(expanded) {
            Column(modifier = Modifier.padding(start = 12.dp, bottom = 8.dp)) {
                category.summary?.takeIf(String::isNotBlank)?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 6.dp)) }
                visibleScenes(category.scenes, showSpoilers).forEach { scene ->
                    ParentsGuideSceneItem(scene, showTimestamps)
                }
                if (!showSpoilers && category.scenes.any { it.spoilerLevel != ParentsGuideSpoilerLevel.NONE }) {
                    Text(stringResource(Res.string.parents_guide_spoiler_hidden), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 4.dp))
                }
            }
        }
    }
}

@Composable
fun ParentsGuideSceneItem(scene: ParentsGuideScene, showTimestamp: Boolean) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        if (showTimestamp && scene.startSeconds != null) {
            Text(formatGuideTimestamp(scene.startSeconds), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        }
        Text("• ${scene.description}", style = MaterialTheme.typography.bodySmall)
        if (scene.verificationStatus == "moderator_verified") {
            Text(stringResource(Res.string.parents_guide_verified), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun SeverityBadge(severity: ParentsGuideSeverity) {
    val text = stringResource(severity.labelResource())
    val container = when (severity) {
        ParentsGuideSeverity.SEVERE -> MaterialTheme.colorScheme.errorContainer
        ParentsGuideSeverity.MODERATE -> MaterialTheme.colorScheme.tertiaryContainer
        ParentsGuideSeverity.MILD -> MaterialTheme.colorScheme.secondaryContainer
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    Box(modifier = Modifier.padding(end = 6.dp).background(container, RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 3.dp)) {
        Text(text, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun LoadingGuide() {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CircularProgressIndicator(modifier = Modifier.sizeIn(maxWidth = 20.dp, maxHeight = 20.dp))
        Text(stringResource(Res.string.parents_guide_loading), style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun UnavailableGuide(onContribute: () -> Unit) {
    Column(modifier = Modifier.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(Res.string.parents_guide_unavailable), style = MaterialTheme.typography.bodySmall)
        Button(onClick = onContribute) { Text(stringResource(Res.string.parents_guide_contribute)) }
    }
}

private fun ParentsGuideCategoryType.labelResource(): StringResource = when (this) {
    ParentsGuideCategoryType.SEX_NUDITY -> Res.string.parents_guide_sex_nudity
    ParentsGuideCategoryType.VIOLENCE_GORE -> Res.string.parents_guide_violence_gore
    ParentsGuideCategoryType.PROFANITY -> Res.string.parents_guide_profanity
    ParentsGuideCategoryType.ALCOHOL_DRUGS_SMOKING -> Res.string.parents_guide_alcohol_drugs_smoking
    ParentsGuideCategoryType.FRIGHTENING_INTENSE -> Res.string.parents_guide_frightening_intense
}

private fun ParentsGuideSeverity.labelResource(): StringResource = when (this) {
    ParentsGuideSeverity.NONE -> Res.string.parents_guide_severity_none
    ParentsGuideSeverity.MILD -> Res.string.parents_guide_severity_mild
    ParentsGuideSeverity.MODERATE -> Res.string.parents_guide_severity_moderate
    ParentsGuideSeverity.SEVERE -> Res.string.parents_guide_severity_severe
    ParentsGuideSeverity.UNKNOWN -> Res.string.parents_guide_severity_unknown
}
