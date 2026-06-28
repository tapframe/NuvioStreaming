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
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.nuvio
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_close
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun PlayerQualityPanel(
    visible: Boolean,
    state: PlayerQualitySelectionState,
    selectedQualityId: String?,
    currentResolutionLabel: String? = null,
    onQualitySelected: (String?) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio

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
                        .heightIn(max = tokens.components.dialogMaxWidth)
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
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = tokens.spacing.sheetPadding, vertical = tokens.spacing.cardPadding),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Quality",
                                color = tokens.colors.textPrimary,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            PanelChipButton(
                                label = stringResource(Res.string.action_close),
                                onClick = onDismiss,
                            )
                        }

                        when {
                            state.isLoading -> {
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

                            !state.hasSelectableQualities -> {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = tokens.spacing.sheetPadding)
                                        .padding(bottom = tokens.spacing.sheetPadding),
                                    verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s10),
                                ) {
                                    val currentQualityTitle = currentResolutionLabel
                                        ?.takeIf { it.isNotBlank() }
                                        ?: "Current quality"
                                    QualityOptionRow(
                                        title = currentQualityTitle,
                                        subtitle = "Currently playing",
                                        isSelected = true,
                                        hasWarning = false,
                                        enabled = false,
                                        onClick = {},
                                    )
                                    Text(
                                        text = state.errorMessage
                                            ?: "This stream does not expose selectable quality variants.",
                                        color = tokens.colors.textMuted,
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                }
                            }

                            else -> {
                                LazyColumn(
                                    modifier = Modifier.padding(horizontal = tokens.spacing.cardPadding),
                                    verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s6),
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                        bottom = tokens.spacing.cardPadding,
                                    ),
                                ) {
                                    item(key = "auto") {
                                        QualityOptionRow(
                                            title = state.labelFor(null)?.let { "Auto ($it)" } ?: "Auto",
                                            subtitle = "Recommended compatible quality",
                                            isSelected = selectedQualityId == null,
                                            hasWarning = false,
                                            onClick = { onQualitySelected(null) },
                                        )
                                    }
                                    items(
                                        items = state.variants,
                                        key = { it.id },
                                    ) { variant ->
                                        QualityOptionRow(
                                            title = variant.qualityName,
                                            subtitle = variant.displayLabel.removePrefix(variant.qualityName).trimStart(' ', '·'),
                                            isSelected = selectedQualityId == variant.id,
                                            hasWarning = !variant.isLikelyHardwareDecodable,
                                            onClick = { onQualitySelected(variant.id) },
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
private fun QualityOptionRow(
    title: String,
    subtitle: String,
    isSelected: Boolean,
    hasWarning: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(tokens.shapes.compactCard)
            .background(if (isSelected) tokens.colors.overlaySelected else tokens.colors.surfacePopover)
            .border(
                tokens.borders.thin,
                if (isSelected) tokens.colors.borderSelected else tokens.colors.borderSubtle,
                tokens.shapes.compactCard,
            )
            .then(if (enabled) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = NuvioTokens.Space.s14, vertical = NuvioTokens.Space.s12),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = tokens.colors.textPrimary,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
            )
            if (subtitle.isNotBlank()) {
                Text(
                    text = subtitle,
                    color = if (hasWarning) tokens.colors.danger else tokens.colors.textMuted,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
        if (isSelected) {
            Spacer(modifier = Modifier.width(NuvioTokens.Space.s10))
            Text(
                text = "Selected",
                color = tokens.colors.accent,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
