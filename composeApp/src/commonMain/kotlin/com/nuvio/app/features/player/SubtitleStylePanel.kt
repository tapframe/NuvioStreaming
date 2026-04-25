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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
fun SubtitleStylePanel(
    style: SubtitleStyleState,
    isCompact: Boolean,
    onStyleChanged: (SubtitleStyleState) -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    val sectionPadding = if (isCompact) 12.dp else 16.dp
    val gap = if (isCompact) 12.dp else 16.dp

    Column(
        verticalArrangement = Arrangement.spacedBy(gap),
    ) {
        StyleControlsCard(
            style = style,
            isCompact = isCompact,
            sectionPadding = sectionPadding,
            colorScheme = colorScheme,
            onStyleChanged = onStyleChanged,
        )
    }
}

@Composable
private fun StyleControlsCard(
    style: SubtitleStyleState,
    isCompact: Boolean,
    sectionPadding: androidx.compose.ui.unit.Dp,
    colorScheme: androidx.compose.material3.ColorScheme,
    onStyleChanged: (SubtitleStyleState) -> Unit,
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

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_color),
                color = colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SubtitleColorSwatches.forEach { color ->
                val isSelected = style.textColor == color
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(color)
                        .border(
                            2.dp,
                            if (isSelected) colorScheme.primary else colorScheme.outlineVariant,
                            CircleShape,
                        )
                        .clickable { onStyleChanged(style.copy(textColor = color)) },
                )
            }
        }

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
