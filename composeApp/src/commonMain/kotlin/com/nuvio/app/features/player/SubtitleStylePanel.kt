package com.nuvio.app.features.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
fun SubtitleStylePanel(
    style: SubtitleStyleState,
    subtitleDelayMs: Int,
    selectedAddonSubtitle: AddonSubtitle?,
    subtitleAutoSyncState: SubtitleAutoSyncUiState,
    isCompact: Boolean,
    onStyleChanged: (SubtitleStyleState) -> Unit,
    onSubtitleDelayChanged: (Int) -> Unit,
    onSubtitleDelayReset: () -> Unit,
    onAutoSyncCapture: () -> Unit,
    onAutoSyncCueSelected: (SubtitleSyncCue) -> Unit,
    onAutoSyncReload: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    val sectionPadding = if (isCompact) 12.dp else 16.dp
    val gap = if (isCompact) 12.dp else 16.dp

    Column(
        verticalArrangement = Arrangement.spacedBy(gap),
    ) {
        StyleControlsCard(
            style = style,
            subtitleDelayMs = subtitleDelayMs,
            selectedAddonSubtitle = selectedAddonSubtitle,
            subtitleAutoSyncState = subtitleAutoSyncState,
            isCompact = isCompact,
            sectionPadding = sectionPadding,
            colorScheme = colorScheme,
            onStyleChanged = onStyleChanged,
            onSubtitleDelayChanged = onSubtitleDelayChanged,
            onSubtitleDelayReset = onSubtitleDelayReset,
            onAutoSyncCapture = onAutoSyncCapture,
            onAutoSyncCueSelected = onAutoSyncCueSelected,
            onAutoSyncReload = onAutoSyncReload,
        )
    }
}

@Composable
private fun StyleControlsCard(
    style: SubtitleStyleState,
    subtitleDelayMs: Int,
    selectedAddonSubtitle: AddonSubtitle?,
    subtitleAutoSyncState: SubtitleAutoSyncUiState,
    isCompact: Boolean,
    sectionPadding: androidx.compose.ui.unit.Dp,
    colorScheme: androidx.compose.material3.ColorScheme,
    onStyleChanged: (SubtitleStyleState) -> Unit,
    onSubtitleDelayChanged: (Int) -> Unit,
    onSubtitleDelayReset: () -> Unit,
    onAutoSyncCapture: () -> Unit,
    onAutoSyncCueSelected: (SubtitleSyncCue) -> Unit,
    onAutoSyncReload: () -> Unit,
) {
    val btnSize = if (isCompact) 28.dp else 32.dp
    val btnRadius = if (isCompact) 14.dp else 16.dp

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .padding(sectionPadding),
        verticalArrangement = Arrangement.spacedBy(if (isCompact) 12.dp else 16.dp),
    ) {
        SectionHeader(
            icon = Icons.Rounded.Tune,
            label = stringResource(Res.string.compose_player_style),
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_subtitle_delay),
                color = colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            StepperControl(
                value = formatSubtitleDelay(subtitleDelayMs),
                onMinus = {
                    onSubtitleDelayChanged((subtitleDelayMs - SUBTITLE_DELAY_STEP_MS).coerceAtLeast(SUBTITLE_DELAY_MIN_MS))
                },
                onPlus = {
                    onSubtitleDelayChanged((subtitleDelayMs + SUBTITLE_DELAY_STEP_MS).coerceAtMost(SUBTITLE_DELAY_MAX_MS))
                },
                buttonSize = btnSize,
                buttonRadius = btnRadius,
                minWidth = 72.dp,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            SmallActionPill(
                text = stringResource(Res.string.compose_player_reset),
                onClick = onSubtitleDelayReset,
            )
        }

        AutoSyncControls(
            selectedAddonSubtitle = selectedAddonSubtitle,
            state = subtitleAutoSyncState,
            isCompact = isCompact,
            onCapture = onAutoSyncCapture,
            onCueSelected = onAutoSyncCueSelected,
            onReload = onAutoSyncReload,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_font_size),
                color = colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            StepperControl(
                value = stringResource(Res.string.compose_player_font_size_value, style.fontSizeSp),
                onMinus = {
                    onStyleChanged(style.copy(fontSizeSp = (style.fontSizeSp - 2).coerceAtLeast(12)))
                },
                onPlus = {
                    onStyleChanged(style.copy(fontSizeSp = (style.fontSizeSp + 2).coerceAtMost(40)))
                },
                buttonSize = btnSize,
                buttonRadius = btnRadius,
                minWidth = 58.dp,
                minusIcon = Icons.Rounded.KeyboardArrowDown,
                plusIcon = Icons.Rounded.KeyboardArrowUp,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_outline),
                color = colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        if (style.outlineEnabled) colorScheme.primaryContainer
                        else colorScheme.surface.copy(alpha = 0.8f)
                    )
                    .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.8f), RoundedCornerShape(10.dp))
                    .clickable { onStyleChanged(style.copy(outlineEnabled = !style.outlineEnabled)) }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
            ) {
                Text(
                    text = if (style.outlineEnabled) stringResource(Res.string.compose_action_on)
                    else stringResource(Res.string.compose_action_off),
                    color = if (style.outlineEnabled) colorScheme.onPrimaryContainer else colorScheme.onSurface,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                )
            }
        }

        ToggleRow(
            label = stringResource(Res.string.compose_player_bold),
            enabled = style.bold,
            onToggle = { onStyleChanged(style.copy(bold = !style.bold)) },
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_bottom_offset),
                color = colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            StepperControl(
                value = style.bottomOffset.toString(),
                onMinus = { onStyleChanged(style.copy(bottomOffset = (style.bottomOffset - 5).coerceAtLeast(0))) },
                onPlus = { onStyleChanged(style.copy(bottomOffset = (style.bottomOffset + 5).coerceAtMost(200))) },
                buttonSize = btnSize,
                buttonRadius = btnRadius,
                minWidth = 46.dp,
                minusIcon = Icons.Rounded.KeyboardArrowDown,
                plusIcon = Icons.Rounded.KeyboardArrowUp,
            )
        }

        ColorPickerRow(
            label = stringResource(Res.string.compose_player_color),
            colors = SubtitleColorSwatches,
            selectedColor = style.textColor,
            onColorSelected = { onStyleChanged(style.copy(textColor = it)) },
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val currentAlphaPercent = (style.textColor.alpha * 100f).roundToInt().coerceIn(0, 100)
            Text(
                text = stringResource(Res.string.compose_player_text_opacity),
                color = colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            StepperControl(
                value = "$currentAlphaPercent%",
                onMinus = {
                    val newAlpha = (currentAlphaPercent - 10).coerceAtLeast(0) / 100f
                    onStyleChanged(style.copy(textColor = style.textColor.copy(alpha = newAlpha)))
                },
                onPlus = {
                    val newAlpha = (currentAlphaPercent + 10).coerceAtMost(100) / 100f
                    onStyleChanged(style.copy(textColor = style.textColor.copy(alpha = newAlpha)))
                },
                buttonSize = btnSize,
                buttonRadius = btnRadius,
                minWidth = 58.dp,
            )
        }

        ColorPickerRow(
            label = stringResource(Res.string.compose_player_outline_color),
            colors = SubtitleColorSwatches,
            selectedColor = style.outlineColor,
            onColorSelected = { onStyleChanged(style.copy(outlineColor = it)) },
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(colorScheme.surface.copy(alpha = 0.82f))
                    .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.8f), RoundedCornerShape(8.dp))
                    .clickable { onStyleChanged(SubtitleStyleState.DEFAULT) }
                    .padding(horizontal = if (isCompact) 8.dp else 12.dp, vertical = if (isCompact) 6.dp else 8.dp),
            ) {
                Text(
                    text = stringResource(Res.string.compose_player_reset_defaults),
                    color = colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = if (isCompact) 12.sp else 14.sp,
                )
            }
        }
    }
}

@Composable
private fun AutoSyncControls(
    selectedAddonSubtitle: AddonSubtitle?,
    state: SubtitleAutoSyncUiState,
    isCompact: Boolean,
    onCapture: () -> Unit,
    onCueSelected: (SubtitleSyncCue) -> Unit,
    onReload: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    val capturedPositionMs = state.capturedPositionMs
    val nearestCues = if (capturedPositionMs == null) {
        emptyList()
    } else {
        state.cues.sortedBy { abs(it.startTimeMs - capturedPositionMs) }.take(5)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(colorScheme.surface.copy(alpha = 0.55f))
            .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
            .padding(if (isCompact) 10.dp else 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_auto_sync),
                color = colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SmallActionPill(
                    text = stringResource(Res.string.compose_player_reload),
                    enabled = selectedAddonSubtitle != null,
                    onClick = onReload,
                )
                SmallActionPill(
                    text = stringResource(Res.string.compose_player_capture_line),
                    enabled = selectedAddonSubtitle != null,
                    onClick = onCapture,
                )
            }
        }

        if (selectedAddonSubtitle == null) {
            Text(
                text = stringResource(Res.string.compose_player_select_addon_subtitle_first),
                color = colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
            return@Column
        }

        if (state.isLoading) {
            Text(
                text = stringResource(Res.string.compose_player_loading_lines),
                color = colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
            )
        }

        state.errorMessage?.let { message ->
            Text(
                text = message,
                color = colorScheme.error,
                fontSize = 12.sp,
            )
        }

        if (capturedPositionMs != null && nearestCues.isNotEmpty()) {
            nearestCues.forEach { cue ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(colorScheme.surfaceVariant.copy(alpha = 0.52f))
                        .clickable { onCueSelected(cue) }
                        .padding(horizontal = 8.dp, vertical = 7.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = formatCueTimestamp(cue.startTimeMs),
                        color = colorScheme.primary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = cue.text,
                        color = colorScheme.onSurface,
                        fontSize = 12.sp,
                        maxLines = 2,
                    )
                }
            }
        }
    }
}

@Composable
private fun ToggleRow(
    label: String,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            color = colorScheme.onSurfaceVariant,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
        SmallActionPill(
            text = if (enabled) stringResource(Res.string.compose_action_on)
            else stringResource(Res.string.compose_action_off),
            selected = enabled,
            onClick = onToggle,
        )
    }
}

@Composable
private fun ColorPickerRow(
    label: String,
    colors: List<Color>,
    selectedColor: Color,
    onColorSelected: (Color) -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = label,
            color = colorScheme.onSurfaceVariant,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            colors.forEach { color ->
                val isSelected = selectedColor == color
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(if (color.alpha == 0f) colorScheme.surface else color)
                        .border(
                            2.dp,
                            if (isSelected) colorScheme.primary else colorScheme.outlineVariant,
                            CircleShape,
                        )
                        .clickable { onColorSelected(color) },
                )
            }
        }
    }
}

@Composable
private fun SmallActionPill(
    text: String,
    enabled: Boolean = true,
    selected: Boolean = false,
    onClick: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(
                when {
                    selected -> colorScheme.primaryContainer
                    enabled -> colorScheme.surface.copy(alpha = 0.82f)
                    else -> colorScheme.surfaceVariant.copy(alpha = 0.48f)
                }
            )
            .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.8f), RoundedCornerShape(8.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 7.dp),
    ) {
        Text(
            text = text,
            color = when {
                selected -> colorScheme.onPrimaryContainer
                enabled -> colorScheme.onSurface
                else -> colorScheme.onSurfaceVariant.copy(alpha = 0.58f)
            },
            fontWeight = FontWeight.SemiBold,
            fontSize = 12.sp,
        )
    }
}

@Composable
private fun StepperControl(
    value: String,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    buttonSize: androidx.compose.ui.unit.Dp,
    buttonRadius: androidx.compose.ui.unit.Dp,
    minWidth: androidx.compose.ui.unit.Dp = 42.dp,
    minusIcon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Rounded.Remove,
    plusIcon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Rounded.KeyboardArrowUp,
) {
    val colorScheme = MaterialTheme.colorScheme

    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(buttonSize)
                .clip(RoundedCornerShape(buttonRadius))
                .background(colorScheme.primaryContainer)
                .clickable(onClick = onMinus),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = minusIcon,
                contentDescription = null,
                tint = colorScheme.onPrimaryContainer,
                modifier = Modifier.size(16.dp),
            )
        }

        Box(
            modifier = Modifier
                .widthIn(min = minWidth)
                .clip(RoundedCornerShape(10.dp))
                .background(colorScheme.surface.copy(alpha = 0.82f))
                .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.8f), RoundedCornerShape(10.dp))
                .padding(horizontal = 6.dp, vertical = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = value,
                color = colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
            )
        }

        Box(
            modifier = Modifier
                .size(buttonSize)
                .clip(RoundedCornerShape(buttonRadius))
                .background(colorScheme.primaryContainer)
                .clickable(onClick = onPlus),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = plusIcon,
                contentDescription = null,
                tint = colorScheme.onPrimaryContainer,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun SectionHeader(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
) {
    val colorScheme = MaterialTheme.colorScheme

    Row(
        modifier = Modifier.padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = colorScheme.primary,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = label,
            color = colorScheme.onSurface,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun formatSubtitleDelay(delayMs: Int): String {
    val sign = if (delayMs >= 0) "+" else "-"
    val absMs = abs(delayMs)
    val seconds = absMs / 1000
    val millis = absMs % 1000
    return "$sign$seconds.${millis.toString().padStart(3, '0')}s"
}

private fun formatCueTimestamp(timeMs: Long): String {
    val totalSeconds = (timeMs / 1000L).coerceAtLeast(0L)
    val minutes = totalSeconds / 60L
    val seconds = totalSeconds % 60L
    return "${minutes}:${seconds.toString().padStart(2, '0')}"
}
