package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvio
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.addon_title
import nuvio.composeapp.generated.resources.compose_player_built_in
import nuvio.composeapp.generated.resources.compose_player_fetch_subtitles
import nuvio.composeapp.generated.resources.compose_player_languages
import nuvio.composeapp.generated.resources.compose_player_none
import nuvio.composeapp.generated.resources.compose_player_style
import nuvio.composeapp.generated.resources.compose_player_subtitles
import nuvio.composeapp.generated.resources.settings_playback_option_forced
import nuvio.composeapp.generated.resources.subtitle_language_unknown
import org.jetbrains.compose.resources.stringResource

@Composable
fun SubtitleModal(
    visible: Boolean,
    subtitleTracks: List<SubtitleTrack>,
    selectedSubtitleIndex: Int,
    addonSubtitles: List<AddonSubtitle>,
    selectedAddonSubtitleId: String?,
    isLoadingAddonSubtitles: Boolean,
    preferredSubtitleLanguage: String,
    secondaryPreferredSubtitleLanguage: String?,
    subtitleStyle: SubtitleStyleState,
    subtitleDelayMs: Int,
    selectedAddonSubtitle: AddonSubtitle?,
    subtitleAutoSyncState: SubtitleAutoSyncUiState,
    onBuiltInTrackSelected: (Int) -> Unit,
    onAddonSubtitleSelected: (AddonSubtitle) -> Unit,
    onFetchAddonSubtitles: () -> Unit,
    onStyleChanged: (SubtitleStyleState) -> Unit,
    onSubtitleDelayChanged: (Int) -> Unit,
    onSubtitleDelayReset: () -> Unit,
    onAutoSyncCapture: () -> Unit,
    onAutoSyncCueSelected: (SubtitleSyncCue) -> Unit,
    onAutoSyncReload: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val effectiveSelectedAddonSubtitle = selectedAddonSubtitle ?: addonSubtitles.firstOrNull { subtitle ->
        subtitle.id == selectedAddonSubtitleId || subtitle.url == selectedAddonSubtitleId
    }
    val playbackLanguageKey = selectedSubtitleLanguageKey(
        subtitleTracks = subtitleTracks,
        selectedSubtitleIndex = selectedSubtitleIndex,
        selectedAddonSubtitle = effectiveSelectedAddonSubtitle,
    )
    val playbackOptionId = selectedSubtitleOptionId(
        subtitleTracks = subtitleTracks,
        selectedSubtitleIndex = selectedSubtitleIndex,
        selectedAddonSubtitle = effectiveSelectedAddonSubtitle,
    )
    val languageItems = remember(
        subtitleTracks,
        addonSubtitles,
        preferredSubtitleLanguage,
        secondaryPreferredSubtitleLanguage,
        subtitleStyle.showOnlyPreferredLanguages,
        playbackLanguageKey,
    ) {
        buildSubtitleLanguageItems(
            subtitleTracks = subtitleTracks,
            addonSubtitles = addonSubtitles,
            preferredLanguage = preferredSubtitleLanguage,
            secondaryPreferredLanguage = secondaryPreferredSubtitleLanguage,
            showOnlyPreferredLanguages = subtitleStyle.showOnlyPreferredLanguages,
            selectedLanguageKey = playbackLanguageKey,
        )
    }
    var activeLanguageKey by remember(visible) {
        mutableStateOf(
            playbackLanguageKey.takeIf { key -> languageItems.any { it.key == key } }
                ?: languageItems.firstOrNull { it.key != SubtitleOffLanguageKey }?.key
                ?: SubtitleOffLanguageKey,
        )
    }
    var pendingOptionId by remember(visible) { mutableStateOf<String?>(playbackOptionId) }
    val options = remember(activeLanguageKey, subtitleTracks, addonSubtitles) {
        buildSubtitleSelectionOptions(activeLanguageKey, subtitleTracks, addonSubtitles)
    }
    val selectedOptionId = pendingOptionId ?: playbackOptionId
    val styleVisible = activeLanguageKey != SubtitleOffLanguageKey &&
        selectedOptionId != null && options.any { it.id == selectedOptionId }

    LaunchedEffect(languageItems) {
        if (languageItems.none { it.key == activeLanguageKey }) {
            activeLanguageKey = playbackLanguageKey.takeIf { key -> languageItems.any { it.key == key } }
                ?: languageItems.firstOrNull { it.key != SubtitleOffLanguageKey }?.key
                ?: SubtitleOffLanguageKey
        }
    }

    LaunchedEffect(playbackLanguageKey, playbackOptionId) {
        if (playbackOptionId != null || playbackLanguageKey == SubtitleOffLanguageKey) {
            activeLanguageKey = playbackLanguageKey
            pendingOptionId = playbackOptionId
        }
    }

    PlayerOverlayScaffold(
        visible = visible,
        onDismiss = onDismiss,
        modifier = modifier,
        contentPadding = PaddingValues(start = 52.dp, end = 52.dp, top = 36.dp, bottom = 76.dp),
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val railMaxHeight = (maxHeight - 72.dp).coerceAtLeast(120.dp)

            Column(
                modifier = Modifier.align(Alignment.BottomStart),
                verticalArrangement = Arrangement.Bottom,
            ) {
                Text(
                    text = stringResource(Res.string.compose_player_subtitles),
                    color = Color.White,
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.padding(bottom = 12.dp),
                )

                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    SubtitleRail(
                        title = stringResource(Res.string.compose_player_languages),
                        width = 200.dp,
                    ) {
                        LazyColumn(
                            modifier = Modifier.heightIn(max = railMaxHeight),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                            contentPadding = PaddingValues(vertical = 8.dp),
                        ) {
                            items(languageItems, key = { it.key }) { item ->
                                SubtitleLanguageRow(
                                    item = item,
                                    selected = item.key == activeLanguageKey,
                                    onClick = {
                                        activeLanguageKey = item.key
                                        val availableOptions = buildSubtitleSelectionOptions(
                                            item.key,
                                            subtitleTracks,
                                            addonSubtitles,
                                        )
                                        pendingOptionId = playbackOptionId?.takeIf { id ->
                                            availableOptions.any { it.id == id }
                                        }
                                        if (item.key == SubtitleOffLanguageKey) {
                                            onBuiltInTrackSelected(-1)
                                        }
                                    },
                                )
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = activeLanguageKey != SubtitleOffLanguageKey,
                        enter = fadeIn(),
                        exit = fadeOut(),
                    ) {
                        SubtitleRail(
                            title = stringResource(Res.string.compose_player_subtitles),
                            width = 300.dp,
                        ) {
                            when {
                                options.isEmpty() && isLoadingAddonSubtitles -> {
                                    PlayerModalLoading(modifier = Modifier.padding(vertical = 24.dp))
                                }

                                options.isEmpty() -> {
                                    SubtitleRailEmptyState(
                                        text = stringResource(Res.string.compose_player_fetch_subtitles),
                                        onClick = onFetchAddonSubtitles,
                                    )
                                }

                                else -> {
                                    LazyColumn(
                                        modifier = Modifier.heightIn(max = railMaxHeight),
                                        verticalArrangement = Arrangement.spacedBy(4.dp),
                                        contentPadding = PaddingValues(vertical = 8.dp),
                                    ) {
                                        items(options, key = { it.id }) { option ->
                                            SubtitleOptionRow(
                                                option = option,
                                                selected = option.id == selectedOptionId,
                                                onClick = {
                                                    pendingOptionId = option.id
                                                    when (option) {
                                                        is SubtitleSelectionOption.BuiltIn -> {
                                                            onBuiltInTrackSelected(option.track.index)
                                                        }

                                                        is SubtitleSelectionOption.Addon -> {
                                                            onAddonSubtitleSelected(option.subtitle)
                                                        }
                                                    }
                                                },
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = styleVisible,
                        enter = fadeIn(),
                        exit = fadeOut(),
                    ) {
                        SubtitleRail(
                            title = stringResource(Res.string.compose_player_style),
                            width = 280.dp,
                        ) {
                            Column(
                                modifier = Modifier
                                    .heightIn(max = railMaxHeight)
                                    .verticalScroll(rememberScrollState()),
                            ) {
                                SubtitleStylePanel(
                                    style = subtitleStyle,
                                    subtitleDelayMs = subtitleDelayMs,
                                    selectedAddonSubtitle = effectiveSelectedAddonSubtitle,
                                    subtitleAutoSyncState = subtitleAutoSyncState,
                                    isCompact = railMaxHeight < 420.dp,
                                    showHeader = false,
                                    onStyleChanged = onStyleChanged,
                                    onSubtitleDelayChanged = onSubtitleDelayChanged,
                                    onSubtitleDelayReset = onSubtitleDelayReset,
                                    onAutoSyncCapture = onAutoSyncCapture,
                                    onAutoSyncCueSelected = onAutoSyncCueSelected,
                                    onAutoSyncReload = onAutoSyncReload,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SubtitleRail(
    title: String,
    width: Dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    Column(
        modifier = Modifier.width(width),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = title,
            color = tokens.colors.textMuted,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        content()
    }
}

@Composable
private fun SubtitleLanguageRow(
    item: SubtitleLanguageItem,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val label = when (item.key) {
        SubtitleOffLanguageKey -> stringResource(Res.string.compose_player_none)
        SubtitleUnknownLanguageKey -> stringResource(Res.string.subtitle_language_unknown)
        else -> languageLabelForCode(item.key)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) tokens.colors.accent else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f, fill = false),
            color = if (selected) tokens.colors.onAccent else Color.White,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (item.count > 0) {
            Text(
                text = item.count.toString(),
                modifier = Modifier
                    .padding(start = 6.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        if (selected) Color.White.copy(alpha = 0.18f)
                        else tokens.colors.accent.copy(alpha = 0.85f),
                    )
                    .padding(horizontal = 8.dp, vertical = 3.dp),
                color = tokens.colors.onAccent,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun SubtitleOptionRow(
    option: SubtitleSelectionOption,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val sourceLabel: String
    val title: String
    val metadata: String?

    when (option) {
        is SubtitleSelectionOption.BuiltIn -> {
            sourceLabel = stringResource(Res.string.compose_player_built_in)
            title = localizedTrackDisplayName(
                option.track.label,
                option.track.language,
                option.track.index,
            )
            metadata = if (option.track.isForced) {
                stringResource(Res.string.settings_playback_option_forced)
            } else {
                null
            }
        }

        is SubtitleSelectionOption.Addon -> {
            sourceLabel = option.subtitle.addonName ?: stringResource(Res.string.addon_title)
            title = languageLabelForCode(option.subtitle.language)
            metadata = option.subtitle.display.takeIf { it.isNotBlank() && it != title }
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) tokens.colors.accent else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            SubtitleSourceChip(label = sourceLabel, selected = selected)
            Text(
                text = title,
                color = if (selected) tokens.colors.onAccent else Color.White,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            metadata?.let {
                Text(
                    text = it,
                    color = if (selected) tokens.colors.onAccent.copy(alpha = 0.72f) else tokens.colors.textMuted,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = tokens.colors.onAccent,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .size(20.dp),
            )
        }
    }
}

@Composable
private fun SubtitleSourceChip(
    label: String,
    selected: Boolean,
) {
    val tokens = MaterialTheme.nuvio
    val shape = RoundedCornerShape(999.dp)

    Box(
        modifier = Modifier
            .clip(shape)
            .background(
                if (selected) tokens.colors.onAccent.copy(alpha = 0.14f)
                else Color.White.copy(alpha = 0.08f),
            )
            .then(
                if (selected) {
                    Modifier.border(1.dp, tokens.colors.onAccent.copy(alpha = 0.22f), shape)
                } else {
                    Modifier
                },
            )
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = label,
            color = if (selected) tokens.colors.onAccent.copy(alpha = 0.9f) else Color.White.copy(alpha = 0.78f),
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SubtitleRailEmptyState(
    text: String,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.CloudDownload,
            contentDescription = null,
            tint = tokens.colors.textMuted,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = text,
            color = tokens.colors.textMuted,
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}
