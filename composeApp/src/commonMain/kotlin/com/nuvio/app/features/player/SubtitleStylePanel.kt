package com.nuvio.app.features.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvio
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_action_off
import nuvio.composeapp.generated.resources.compose_action_on
import nuvio.composeapp.generated.resources.compose_player_auto_sync
import nuvio.composeapp.generated.resources.compose_player_bold
import nuvio.composeapp.generated.resources.compose_player_bottom_offset
import nuvio.composeapp.generated.resources.compose_player_capture_line
import nuvio.composeapp.generated.resources.compose_player_color
import nuvio.composeapp.generated.resources.compose_player_font_size
import nuvio.composeapp.generated.resources.compose_player_font_size_value
import nuvio.composeapp.generated.resources.compose_player_loading_lines
import nuvio.composeapp.generated.resources.compose_player_no_subtitle_lines_found
import nuvio.composeapp.generated.resources.compose_player_outline
import nuvio.composeapp.generated.resources.compose_player_outline_color
import nuvio.composeapp.generated.resources.compose_player_reload
import nuvio.composeapp.generated.resources.compose_player_reset
import nuvio.composeapp.generated.resources.compose_player_reset_defaults
import nuvio.composeapp.generated.resources.compose_player_select_addon_subtitle_first
import nuvio.composeapp.generated.resources.compose_player_style
import nuvio.composeapp.generated.resources.compose_player_subtitle_delay
import nuvio.composeapp.generated.resources.compose_player_text_opacity
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
    showHeader: Boolean = true,
    onStyleChanged: (SubtitleStyleState) -> Unit,
    onSubtitleDelayChanged: (Int) -> Unit,
    onSubtitleDelayReset: () -> Unit,
    onAutoSyncCapture: () -> Unit,
    onAutoSyncCueSelected: (SubtitleSyncCue) -> Unit,
    onAutoSyncReload: () -> Unit,
) {
    val sectionGap = if (isCompact) 12.dp else 16.dp

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(sectionGap),
    ) {
        if (showHeader) {
            Text(
                text = stringResource(Res.string.compose_player_style),
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
            )
        }

        SubtitleStyleSection(title = stringResource(Res.string.compose_player_subtitle_delay)) {
            SubtitleStyleStepper(
                value = formatSubtitleDelay(subtitleDelayMs),
                onDecrease = {
                    onSubtitleDelayChanged(
                        (subtitleDelayMs - SUBTITLE_DELAY_STEP_MS).coerceAtLeast(SUBTITLE_DELAY_MIN_MS),
                    )
                },
                onIncrease = {
                    onSubtitleDelayChanged(
                        (subtitleDelayMs + SUBTITLE_DELAY_STEP_MS).coerceAtMost(SUBTITLE_DELAY_MAX_MS),
                    )
                },
            )
            SubtitleTextAction(
                label = stringResource(Res.string.compose_player_reset),
                onClick = onSubtitleDelayReset,
            )
        }

        SubtitleStyleSection(title = stringResource(Res.string.compose_player_font_size)) {
            SubtitleStyleStepper(
                value = stringResource(Res.string.compose_player_font_size_value, style.fontSizeSp),
                onDecrease = {
                    onStyleChanged(style.copy(fontSizeSp = (style.fontSizeSp - 2).coerceAtLeast(12)))
                },
                onIncrease = {
                    onStyleChanged(style.copy(fontSizeSp = (style.fontSizeSp + 2).coerceAtMost(40)))
                },
            )
        }

        SubtitleStyleSection(title = stringResource(Res.string.compose_player_bold)) {
            SubtitleToggleChip(
                enabled = style.bold,
                onClick = { onStyleChanged(style.copy(bold = !style.bold)) },
            )
        }

        SubtitleStyleSection(title = stringResource(Res.string.compose_player_color)) {
            SubtitleColorPicker(
                colors = SubtitleColorSwatches,
                selectedColor = style.textColor,
                onColorSelected = { color ->
                    onStyleChanged(style.copy(textColor = color.copy(alpha = style.textColor.alpha)))
                },
            )
        }

        SubtitleStyleSection(title = stringResource(Res.string.compose_player_text_opacity)) {
            val opacity = (style.textColor.alpha * 100f).roundToInt().coerceIn(0, 100)
            SubtitleStyleStepper(
                value = "$opacity%",
                onDecrease = {
                    val alpha = (opacity - 10).coerceAtLeast(0) / 100f
                    onStyleChanged(style.copy(textColor = style.textColor.copy(alpha = alpha)))
                },
                onIncrease = {
                    val alpha = (opacity + 10).coerceAtMost(100) / 100f
                    onStyleChanged(style.copy(textColor = style.textColor.copy(alpha = alpha)))
                },
            )
        }

        SubtitleStyleSection(title = stringResource(Res.string.compose_player_outline)) {
            SubtitleToggleChip(
                enabled = style.outlineEnabled,
                onClick = { onStyleChanged(style.copy(outlineEnabled = !style.outlineEnabled)) },
            )
            Text(
                text = stringResource(Res.string.compose_player_outline_color),
                color = Color.White.copy(alpha = 0.72f),
                style = MaterialTheme.typography.bodySmall,
            )
            SubtitleColorPicker(
                colors = SubtitleOutlineColorSwatches,
                selectedColor = style.outlineColor,
                enabled = style.outlineEnabled,
                onColorSelected = { color ->
                    onStyleChanged(style.copy(outlineEnabled = true, outlineColor = color))
                },
            )
        }

        SubtitleStyleSection(title = stringResource(Res.string.compose_player_bottom_offset)) {
            SubtitleStyleStepper(
                value = style.bottomOffset.toString(),
                onDecrease = {
                    onStyleChanged(style.copy(bottomOffset = (style.bottomOffset - 5).coerceAtLeast(0)))
                },
                onIncrease = {
                    onStyleChanged(style.copy(bottomOffset = (style.bottomOffset + 5).coerceAtMost(200)))
                },
            )
        }

        SubtitleAutoSyncSection(
            selectedAddonSubtitle = selectedAddonSubtitle,
            state = subtitleAutoSyncState,
            onCapture = onAutoSyncCapture,
            onCueSelected = onAutoSyncCueSelected,
            onReload = onAutoSyncReload,
        )

        SubtitleResetAction(
            label = stringResource(Res.string.compose_player_reset_defaults),
            onClick = { onStyleChanged(SubtitleStyleState.DEFAULT) },
        )
    }
}

@Composable
private fun SubtitleStyleSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = title,
            color = Color.White,
            style = MaterialTheme.typography.bodyMedium,
        )
        content()
    }
}

@Composable
private fun SubtitleStyleStepper(
    value: String,
    onDecrease: () -> Unit,
    onIncrease: () -> Unit,
    valueWidth: Dp = 84.dp,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SubtitleStepperButton(
            icon = Icons.Rounded.Remove,
            onClick = onDecrease,
        )
        Box(
            modifier = Modifier
                .widthIn(min = valueWidth)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White.copy(alpha = 0.06f))
                .padding(horizontal = 12.dp, vertical = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = value,
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        SubtitleStepperButton(
            icon = Icons.Rounded.Add,
            onClick = onIncrease,
        )
    }
}

@Composable
private fun SubtitleStepperButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(20.dp),
        )
    }
}

@Composable
private fun SubtitleToggleChip(
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (enabled) tokens.colors.accent else Color.White.copy(alpha = 0.08f))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Text(
            text = if (enabled) {
                stringResource(Res.string.compose_action_on)
            } else {
                stringResource(Res.string.compose_action_off)
            },
            color = if (enabled) tokens.colors.onAccent else Color.White,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun SubtitleColorPicker(
    colors: List<Color>,
    selectedColor: Color,
    onColorSelected: (Color) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .alpha(if (enabled) 1f else 0.42f),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        colors.forEach { color ->
            val selected = sameRgb(color, selectedColor)
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(color)
                    .border(
                        width = 2.dp,
                        color = if (selected) Color.White else Color.White.copy(alpha = 0.22f),
                        shape = CircleShape,
                    )
                    .clickable(onClick = { onColorSelected(color) }),
            )
        }
    }
}

@Composable
private fun SubtitleAutoSyncSection(
    selectedAddonSubtitle: AddonSubtitle?,
    state: SubtitleAutoSyncUiState,
    onCapture: () -> Unit,
    onCueSelected: (SubtitleSyncCue) -> Unit,
    onReload: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val capturedPositionMs = state.capturedPositionMs
    val nearestCues = if (capturedPositionMs == null) {
        emptyList()
    } else {
        state.cues.sortedBy { abs(it.startTimeMs - capturedPositionMs) }.take(5)
    }

    SubtitleStyleSection(title = stringResource(Res.string.compose_player_auto_sync)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SubtitleTextAction(
                label = stringResource(Res.string.compose_player_reload),
                enabled = selectedAddonSubtitle != null,
                onClick = onReload,
            )
            SubtitleTextAction(
                label = stringResource(Res.string.compose_player_capture_line),
                enabled = selectedAddonSubtitle != null,
                onClick = onCapture,
            )
        }

        when {
            selectedAddonSubtitle == null -> {
                SubtitleHelperText(stringResource(Res.string.compose_player_select_addon_subtitle_first))
            }

            state.isLoading -> {
                SubtitleHelperText(stringResource(Res.string.compose_player_loading_lines))
            }

            state.errorMessage != null -> {
                Text(
                    text = state.errorMessage,
                    color = tokens.colors.danger,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            capturedPositionMs != null && nearestCues.isEmpty() -> {
                SubtitleHelperText(stringResource(Res.string.compose_player_no_subtitle_lines_found))
            }
        }

        nearestCues.forEach { cue ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.White.copy(alpha = 0.06f))
                    .clickable { onCueSelected(cue) }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = formatCueTimestamp(cue.startTimeMs),
                    color = tokens.colors.accent,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = cue.text,
                    modifier = Modifier.weight(1f),
                    color = Color.White,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun SubtitleTextAction(
    label: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    val tokens = MaterialTheme.nuvio

    Box(
        modifier = Modifier
            .alpha(if (enabled) 1f else tokens.opacity.disabled)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            text = label,
            color = Color.White,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun SubtitleResetAction(
    label: String,
    onClick: () -> Unit,
) {
    Text(
        text = label,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        color = Color.White,
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
private fun SubtitleHelperText(text: String) {
    Text(
        text = text,
        color = Color.White.copy(alpha = 0.7f),
        style = MaterialTheme.typography.bodySmall,
    )
}

private fun sameRgb(first: Color, second: Color): Boolean =
    abs(first.red - second.red) < 0.01f &&
        abs(first.green - second.green) < 0.01f &&
        abs(first.blue - second.blue) < 0.01f

private fun formatSubtitleDelay(delayMs: Int): String {
    val sign = if (delayMs >= 0) "+" else "-"
    val absoluteMs = abs(delayMs)
    val seconds = absoluteMs / 1000
    val millis = absoluteMs % 1000
    return "$sign$seconds.${millis.toString().padStart(3, '0')}s"
}

private fun formatCueTimestamp(timeMs: Long): String {
    val totalSeconds = (timeMs / 1000L).coerceAtLeast(0L)
    val minutes = totalSeconds / 60L
    val seconds = totalSeconds % 60L
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}

private val SubtitleOutlineColorSwatches = listOf(
    Color.Black,
    Color.White,
    Color(0xFF00E5FF),
    Color(0xFFFF5C5C),
)
