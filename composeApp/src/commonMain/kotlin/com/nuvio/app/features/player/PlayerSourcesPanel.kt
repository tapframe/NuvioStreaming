package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.streams.StreamBadge
import com.nuvio.app.features.streams.StreamBadgeImage
import com.nuvio.app.features.streams.StreamBadgePlacement
import com.nuvio.app.features.streams.StreamBadgeSettingsRepository
import com.nuvio.app.features.streams.StreamFileSizeBadge
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.StreamsUiState
import com.nuvio.app.features.streams.isSelectableForPlayback
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
fun PlayerSourcesPanel(
    visible: Boolean,
    streamsUiState: StreamsUiState,
    currentStreamUrl: String?,
    currentStreamName: String?,
    onFilterSelected: (String?) -> Unit,
    onStreamSelected: (StreamItem) -> Unit,
    onReload: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    val debridSettings by remember {
        DebridSettingsRepository.ensureLoaded()
        DebridSettingsRepository.uiState
    }.collectAsStateWithLifecycle()
    val streamBadgeSettings by remember {
        StreamBadgeSettingsRepository.ensureLoaded()
        StreamBadgeSettingsRepository.uiState
    }.collectAsStateWithLifecycle()

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(NuvioTokens.Motion.normalMillis)),
        exit = fadeOut(tween(NuvioTokens.Motion.normalMillis)),
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() },
                    onClick = onDismiss,
                )
                .background(tokens.colors.overlayScrim.copy(alpha = tokens.opacity.medium)),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = slideInVertically(tween(NuvioTokens.Motion.sheetEnterMillis)) { it / 3 } +
                    fadeIn(tween(NuvioTokens.Motion.sheetEnterMillis)),
                exit = slideOutVertically(tween(NuvioTokens.Motion.sheetExitMillis)) { it / 3 } +
                    fadeOut(tween(NuvioTokens.Motion.sheetExitMillis)),
            ) {
                Box(
                    modifier = Modifier
                        .widthIn(max = tokens.components.playerPanelMaxWidth)
                        .fillMaxWidth(0.92f)
                        .heightIn(max = tokens.components.dialogMaxWidth + NuvioTokens.Space.s40)
                        .clip(tokens.shapes.playerPanel)
                        .background(tokens.colors.surfaceSheet)
                        .border(tokens.borders.thin, tokens.colors.borderDefault, tokens.shapes.playerPanel)
                        .clickable(
                            indication = null,
                            interactionSource = remember { MutableInteractionSource() },
                            onClick = {},
                        ),
                ) {
                    Column {
                        // Header
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = tokens.spacing.sheetPadding, vertical = tokens.spacing.cardPadding),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = stringResource(Res.string.compose_player_panel_sources),
                                color = tokens.colors.textPrimary,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap)) {
                                PanelChipButton(
                                    label = stringResource(Res.string.compose_action_reload),
                                    icon = Icons.Rounded.Refresh,
                                    onClick = onReload,
                                )
                                PanelChipButton(
                                    label = stringResource(Res.string.action_close),
                                    onClick = onDismiss,
                                )
                            }
                        }

                        // Addon filter chips
                        val addonNames = remember(streamsUiState.groups) {
                            streamsUiState.groups.map { it.addonName }.distinct()
                        }
                        if (addonNames.size > 1) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState())
                                    .padding(horizontal = tokens.spacing.sheetPadding)
                                    .padding(bottom = tokens.spacing.listGap),
                                horizontalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap),
                            ) {
                                AddonFilterChip(
                                    label = stringResource(Res.string.collections_tab_all),
                                    isSelected = streamsUiState.selectedFilter == null,
                                    onClick = { onFilterSelected(null) },
                                )
                                addonNames.forEach { addon ->
                                    val group = streamsUiState.groups.firstOrNull { it.addonName == addon }
                                    AddonFilterChip(
                                        label = addon,
                                        isSelected = streamsUiState.selectedFilter == group?.addonId,
                                        isLoading = group?.isLoading == true,
                                        hasError = group?.error != null,
                                        onClick = { onFilterSelected(group?.addonId) },
                                    )
                                }
                            }
                        }

                        // Content
                        when {
                            streamsUiState.isAnyLoading && streamsUiState.allStreams.isEmpty() -> {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = NuvioTokens.Space.s40),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(
                                        color = tokens.colors.accent,
                                        strokeWidth = tokens.borders.medium,
                                        modifier = Modifier.size(tokens.icons.lg + NuvioTokens.Space.s4),
                                    )
                                }
                            }

                            streamsUiState.allStreams.isEmpty() -> {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = NuvioTokens.Space.s40),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = stringResource(Res.string.compose_player_no_streams_found),
                                        color = tokens.colors.textMuted,
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                }
                            }

                            else -> {
                                val streams = streamsUiState.filteredGroups.flatMap { it.streams }
                                LazyColumn(
                                    modifier = Modifier.padding(horizontal = tokens.spacing.cardPadding),
                                    verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s6),
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = tokens.spacing.cardPadding),
                                ) {
                                    itemsIndexed(
                                        items = streams,
                                        key = { index, stream -> "${stream.addonId}::${index}::${stream.url ?: stream.infoHash ?: stream.clientResolve?.infoHash ?: stream.name}" },
                                    ) { _, stream ->
                                        val isCurrent = isCurrentStream(
                                            stream = stream,
                                            currentUrl = currentStreamUrl,
                                            currentName = currentStreamName,
                                        )
                                        SourceStreamRow(
                                            stream = stream,
                                            isCurrent = isCurrent,
                                            enabled = stream.isSelectableForPlayback(debridSettings.canResolvePlayableLinks),
                                            showFileSizeBadges = streamBadgeSettings.showFileSizeBadges,
                                            badgePlacement = streamBadgeSettings.badgePlacement,
                                            onClick = { onStreamSelected(stream) },
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
}

@Composable
private fun SourceStreamRow(
    stream: StreamItem,
    isCurrent: Boolean,
    enabled: Boolean,
    showFileSizeBadges: Boolean,
    badgePlacement: StreamBadgePlacement,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val cardShape = tokens.shapes.compactCard
    val badgeImages = stream.badges.filter { it.imageURL.isNotBlank() }
    val hasBadgeMetadata = badgeImages.isNotEmpty() || (showFileSizeBadges && stream.behaviorHints.videoSize != null)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = NuvioTokens.Space.s64 + NuvioTokens.Space.s4)
            .shadow(
                elevation = tokens.elevation.raised,
                shape = cardShape,
                ambientColor = tokens.colors.overlayScrim.copy(alpha = tokens.opacity.subtle),
                spotColor = tokens.colors.overlayScrim.copy(alpha = tokens.opacity.subtle),
            )
            .clip(cardShape)
            .background(
                if (isCurrent) tokens.colors.overlaySelected else tokens.colors.surfaceCard,
            )
            .then(
                if (isCurrent) {
                    Modifier.border(tokens.borders.thin, tokens.colors.borderSelected, cardShape)
                } else {
                    Modifier
                },
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(tokens.spacing.cardPaddingCompact),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(tokens.spacing.listGap),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            if (hasBadgeMetadata && badgePlacement == StreamBadgePlacement.TOP) {
                SourceStreamBadgeRow(
                    badgeImages = badgeImages,
                    stream = stream,
                    showFileSizeBadges = showFileSizeBadges,
                )
                Spacer(modifier = Modifier.height(NuvioTokens.Space.s6))
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap),
            ) {
                Text(
                    text = stream.streamLabel,
                    color = tokens.colors.textPrimary,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = NuvioTokens.LetterSpacing.none,
                    ),
                    modifier = Modifier.weight(1f),
                )
                if (isCurrent) {
                    Box(
                        modifier = Modifier
                            .clip(tokens.shapes.chip)
                            .background(tokens.colors.accent)
                            .padding(horizontal = NuvioTokens.Space.s8, vertical = NuvioTokens.Space.s3),
                    ) {
                        Text(
                            text = stringResource(Res.string.compose_player_playing),
                            color = tokens.colors.onAccent,
                            fontSize = NuvioTokens.Type.labelXs,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            val subtitle = stream.streamSubtitle
            if (!subtitle.isNullOrBlank() && subtitle != stream.streamLabel) {
                Spacer(modifier = Modifier.height(NuvioTokens.Space.s2))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.colors.textSecondary,
                )
            }

            Spacer(modifier = Modifier.height(NuvioTokens.Space.s6))
            if (badgePlacement == StreamBadgePlacement.BOTTOM) {
                SourceStreamBadgeRow(
                    badgeImages = badgeImages,
                    stream = stream,
                    showFileSizeBadges = showFileSizeBadges,
                ) {
                    Text(
                        text = stream.addonName,
                        modifier = if (hasBadgeMetadata) Modifier.padding(start = NuvioTokens.Space.s4) else Modifier,
                        color = tokens.colors.textMuted,
                        fontSize = NuvioTokens.Type.labelXs,
                        fontStyle = FontStyle.Italic,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            } else {
                Text(
                    text = stream.addonName,
                    color = tokens.colors.textMuted,
                    fontSize = NuvioTokens.Type.labelXs,
                    fontStyle = FontStyle.Italic,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun SourceStreamBadgeRow(
    badgeImages: List<StreamBadge>,
    stream: StreamItem,
    showFileSizeBadges: Boolean,
    modifier: Modifier = Modifier,
    trailingContent: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s4),
    ) {
        badgeImages.forEach { badge ->
            StreamBadgeImage(badge = badge)
        }
        if (showFileSizeBadges) {
            StreamFileSizeBadge(stream = stream)
        }
        trailingContent()
    }
}

@Composable
internal fun AddonFilterChip(
    label: String,
    isSelected: Boolean,
    isLoading: Boolean = false,
    hasError: Boolean = false,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    Box(
        modifier = Modifier
            .clip(tokens.shapes.chip)
            .background(
                when {
                    isSelected -> tokens.colors.overlaySelected
                    else -> tokens.colors.surfacePopover
                },
            )
            .then(
                if (isSelected) {
                    Modifier.border(tokens.borders.thin, tokens.colors.borderSelected, tokens.shapes.chip)
                } else {
                    Modifier.border(tokens.borders.thin, tokens.colors.borderSubtle, tokens.shapes.chip)
                },
            )
            .clickable(onClick = onClick)
            .padding(horizontal = NuvioTokens.Space.s14, vertical = NuvioTokens.Space.s8),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s6),
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    color = tokens.colors.accent,
                    strokeWidth = tokens.borders.thin + NuvioTokens.Space.hairline,
                    modifier = Modifier.size(NuvioTokens.Icon.xs),
                )
            }
            Text(
                text = label,
                color = when {
                    hasError -> tokens.colors.danger
                    isSelected -> tokens.colors.textPrimary
                    else -> tokens.colors.textMuted
                },
                fontSize = NuvioTokens.Type.labelSm,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
    }
}

@Composable
internal fun PanelChipButton(
    label: String,
    onClick: () -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    val tokens = MaterialTheme.nuvio

    Box(
        modifier = Modifier
            .clip(tokens.shapes.compactCard)
            .background(tokens.colors.surfacePopover)
            .border(tokens.borders.thin, tokens.colors.borderSubtle, tokens.shapes.compactCard)
            .clickable(onClick = onClick)
            .padding(horizontal = NuvioTokens.Space.s12, vertical = NuvioTokens.Space.s6),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s4),
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = tokens.colors.textMuted,
                    modifier = Modifier.size(NuvioTokens.Space.s14),
                )
            }
            Text(
                text = label,
                color = tokens.colors.textMuted,
                fontSize = NuvioTokens.Type.labelSm,
            )
        }
    }
}

private fun isCurrentStream(
    stream: StreamItem,
    currentUrl: String?,
    currentName: String?,
): Boolean {
    if (currentUrl != null && stream.playableDirectUrl == currentUrl) return true
    if (currentName != null && stream.streamLabel.equals(currentName, ignoreCase = true) &&
        stream.playableDirectUrl == currentUrl
    ) return true
    return false
}
