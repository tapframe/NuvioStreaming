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
import androidx.compose.ui.platform.LocalDensity
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
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val compactLayout = SubtitleModalLayoutMetrics.usesCompactLayout(maxWidth, maxHeight)
            val titleStyle = if (compactLayout) {
                MaterialTheme.typography.headlineSmall
            } else {
                MaterialTheme.typography.headlineMedium
            }
            val titleLineHeight = with(LocalDensity.current) { titleStyle.lineHeight.toDp() }
            val layout = SubtitleModalLayoutMetrics.from(maxWidth, maxHeight, titleLineHeight)
            val railMaxHeight = layout.railMaxHeight(maxHeight)

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(
                        start = layout.horizontalPadding,
                        end = layout.horizontalPadding,
                        top = layout.topPadding,
                        bottom = layout.bottomPadding,
                    ),
            ) {
                Column(
                    modifier = Modifier.align(Alignment.BottomStart),
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    Text(
                        text = stringResource(Res.string.compose_player_subtitles),
                        color = Color.White,
                        style = titleStyle,
                        modifier = Modifier.padding(bottom = layout.titleBottomPadding),
                    )

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(layout.railGap),
                        verticalAlignment = Alignment.Top,
                    ) {
                        SubtitleRail(
                            title = stringResource(Res.string.compose_player_languages),
                            width = layout.languageRailWidth,
                            isCompact = layout.isCompact,
                        ) {
                            LazyColumn(
                                modifier = Modifier.heightIn(max = railMaxHeight),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                                contentPadding = PaddingValues(vertical = if (layout.isCompact) 4.dp else 8.dp),
                            ) {
                                items(languageItems, key = { it.key }) { item ->
                                    SubtitleLanguageRow(
                                        item = item,
                                        selected = item.key == activeLanguageKey,
                                        isCompact = layout.isCompact,
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
                                width = layout.subtitleRailWidth,
                                isCompact = layout.isCompact,
                            ) {
                                when {
                                    options.isEmpty() && isLoadingAddonSubtitles -> {
                                        PlayerModalLoading(modifier = Modifier.padding(vertical = 24.dp))
                                    }

                                    options.isEmpty() -> {
                                        SubtitleRailEmptyState(
                                            text = stringResource(Res.string.compose_player_fetch_subtitles),
                                            isCompact = layout.isCompact,
                                            onClick = onFetchAddonSubtitles,
                                        )
                                    }

                                    else -> {
                                        LazyColumn(
                                            modifier = Modifier.heightIn(max = railMaxHeight),
                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                            contentPadding = PaddingValues(
                                                vertical = if (layout.isCompact) 4.dp else 8.dp,
                                            ),
                                        ) {
                                            items(options, key = { it.id }) { option ->
                                                SubtitleOptionRow(
                                                    option = option,
                                                    selected = option.id == selectedOptionId,
                                                    isCompact = layout.isCompact,
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
                                width = layout.styleRailWidth,
                                isCompact = layout.isCompact,
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
                                        isCompact = layout.isCompact || railMaxHeight < 420.dp,
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
}

@Composable
private fun SubtitleRail(
    title: String,
    width: Dp,
    isCompact: Boolean,
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
            style = if (isCompact) MaterialTheme.typography.labelMedium else MaterialTheme.typography.labelLarge,
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
    isCompact: Boolean,
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
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) tokens.colors.accent else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(
                horizontal = if (isCompact) 8.dp else 10.dp,
                vertical = if (isCompact) 6.dp else 8.dp,
            ),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f, fill = false),
            color = if (selected) tokens.colors.onAccent else Color.White,
            style = if (isCompact) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge,
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
    isCompact: Boolean,
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
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) tokens.colors.accent else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(
                horizontal = if (isCompact) 10.dp else 12.dp,
                vertical = if (isCompact) 7.dp else 9.dp,
            ),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(if (isCompact) 4.dp else 6.dp),
        ) {
            SubtitleSourceChip(label = sourceLabel, selected = selected)
            Text(
                text = title,
                color = if (selected) tokens.colors.onAccent else Color.White,
                style = if (isCompact) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge,
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
    isCompact: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
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
            style = if (isCompact) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge,
        )
    }
}

internal data class SubtitleModalLayoutMetrics(
    val isCompact: Boolean,
    val horizontalPadding: Dp,
    val topPadding: Dp,
    val bottomPadding: Dp,
    val titleReservedHeight: Dp,
    val titleBottomPadding: Dp,
    val railGap: Dp,
    val languageRailWidth: Dp,
    val subtitleRailWidth: Dp,
    val styleRailWidth: Dp,
) {
    val totalRailWidth: Dp
        get() = languageRailWidth + subtitleRailWidth + styleRailWidth + railGap * 2

    fun railMaxHeight(maxHeight: Dp): Dp = (
        maxHeight - topPadding - bottomPadding - titleReservedHeight
        ).coerceAtLeast(120.dp)

    companion object {
        fun usesCompactLayout(maxWidth: Dp, maxHeight: Dp): Boolean =
            maxWidth < 960.dp || maxHeight < 500.dp

        fun from(
            maxWidth: Dp,
            maxHeight: Dp,
            titleLineHeight: Dp,
        ): SubtitleModalLayoutMetrics {
            val isCompact = usesCompactLayout(maxWidth, maxHeight)
            if (!isCompact) {
                val titleBottomPadding = 12.dp
                return SubtitleModalLayoutMetrics(
                    isCompact = false,
                    horizontalPadding = 52.dp,
                    topPadding = 36.dp,
                    bottomPadding = 76.dp,
                    titleReservedHeight = titleLineHeight + titleBottomPadding,
                    titleBottomPadding = titleBottomPadding,
                    railGap = 14.dp,
                    languageRailWidth = 200.dp,
                    subtitleRailWidth = 300.dp,
                    styleRailWidth = 280.dp,
                )
            }

            val horizontalPadding = 32.dp
            val railGap = 10.dp
            val availableWidth = (maxWidth - horizontalPadding * 2).coerceAtLeast(0.dp)
            val languageWidth = (availableWidth * 0.2f).coerceIn(132.dp, 168.dp)
            val subtitleWidth = (availableWidth * 0.34f).coerceIn(210.dp, 260.dp)
            val remainingStyleWidth = availableWidth - languageWidth - subtitleWidth - railGap * 2
            val titleBottomPadding = 8.dp

            return SubtitleModalLayoutMetrics(
                isCompact = true,
                horizontalPadding = horizontalPadding,
                topPadding = 24.dp,
                bottomPadding = 60.dp,
                titleReservedHeight = titleLineHeight + titleBottomPadding,
                titleBottomPadding = titleBottomPadding,
                railGap = railGap,
                languageRailWidth = languageWidth,
                subtitleRailWidth = subtitleWidth,
                styleRailWidth = remainingStyleWidth.coerceIn(210.dp, 260.dp),
            )
        }
    }
}
