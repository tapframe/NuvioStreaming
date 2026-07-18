package com.nuvio.app.features.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nuvio.app.core.ui.nuvio
import kotlin.math.roundToInt
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_player_audio_offset
import nuvio.composeapp.generated.resources.compose_player_audio_tracks
import nuvio.composeapp.generated.resources.compose_player_load_local_audio
import nuvio.composeapp.generated.resources.compose_player_local_audio_active
import nuvio.composeapp.generated.resources.compose_player_no_audio_tracks_available
import nuvio.composeapp.generated.resources.compose_player_remove_local_audio
import org.jetbrains.compose.resources.stringResource

@Composable
fun AudioTrackModal(
    visible: Boolean,
    audioTracks: List<AudioTrack>,
    selectedIndex: Int,
    onTrackSelected: (Int) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    showLocalAudioOption: Boolean = false,
    localAudioUri: String? = null,
    audioDelayMs: Int = 0,
    onLocalAudioPicked: () -> Unit = {},
    onLocalAudioRemoved: () -> Unit = {},
    onAudioDelayChanged: (Int) -> Unit = {},
) {
    PlayerOverlayScaffold(
        visible = visible,
        onDismiss = onDismiss,
        modifier = modifier,
        contentPadding = PaddingValues(start = 44.dp, end = 44.dp, top = 28.dp, bottom = 64.dp),
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val railWidth = minOf(maxWidth, 444.dp)

            Column(
                modifier = Modifier
                    .width(railWidth)
                    .fillMaxHeight()
                    .align(Alignment.BottomStart),
                verticalArrangement = Arrangement.Bottom,
            ) {
                Text(
                    text = stringResource(Res.string.compose_player_audio_tracks),
                    color = Color.White,
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.padding(bottom = 8.dp),
                )

                if (showLocalAudioOption) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 4.dp)
                            .padding(bottom = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (localAudioUri == null) {
                            LocalAudioLoadRow(onLocalAudioPicked = onLocalAudioPicked)
                        } else {
                            LocalAudioActiveRow(
                                onLocalAudioRemoved = onLocalAudioRemoved,
                            )
                            AudioOffsetSlider(
                                audioDelayMs = audioDelayMs,
                                onAudioDelayChanged = onAudioDelayChanged,
                            )
                        }
                    }
                }

                if (audioTracks.isEmpty()) {
                    AudioEmptyState()
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        items(audioTracks, key = { "${it.index}:${it.id}" }) { track ->
                            AudioTrackRow(
                                track = track,
                                isSelected = track.index == selectedIndex,
                                onClick = { onTrackSelected(track.index) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AudioTrackRow(
    track: AudioTrack,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val primaryColor = if (isSelected) tokens.colors.onAccent else Color.White
    val secondaryColor = if (isSelected) {
        tokens.colors.onAccent.copy(alpha = 0.82f)
    } else {
        Color.White.copy(alpha = 0.72f)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (isSelected) tokens.colors.accent else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = localizedTrackDisplayName(track.label, track.language, track.index),
                color = primaryColor,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            track.language?.takeIf { it.isNotBlank() && it != "und" }?.let { language ->
                Text(
                    text = languageLabelForCode(language),
                    color = secondaryColor,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (isSelected) {
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
private fun AudioEmptyState() {
    val colorScheme = MaterialTheme.colorScheme

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Rounded.VolumeOff,
            contentDescription = null,
            tint = colorScheme.onSurfaceVariant,
            modifier = Modifier
                .size(32.dp)
                .then(Modifier),
        )
        Text(
            text = stringResource(Res.string.compose_player_no_audio_tracks_available),
            color = colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 10.dp),
        )
    }
}

private const val AUDIO_DELAY_MIN_MS = -10000
private const val AUDIO_DELAY_MAX_MS = 10000
private const val AUDIO_DELAY_STEP_MS = 50

@Composable
private fun LocalAudioLoadRow(
    onLocalAudioPicked: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(colorScheme.primaryContainer.copy(alpha = 0.5f))
            .clickable(onClick = onLocalAudioPicked)
            .padding(vertical = 10.dp, horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.Add,
            contentDescription = null,
            tint = colorScheme.primary,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = stringResource(Res.string.compose_player_load_local_audio),
            color = colorScheme.onPrimaryContainer,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun LocalAudioActiveRow(
    onLocalAudioRemoved: () -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(colorScheme.secondaryContainer.copy(alpha = 0.5f))
            .padding(vertical = 10.dp, horizontal = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(Res.string.compose_player_local_audio_active),
            color = colorScheme.onSecondaryContainer,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
        )
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onLocalAudioRemoved)
                .padding(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Rounded.Close,
                contentDescription = stringResource(Res.string.compose_player_remove_local_audio),
                tint = colorScheme.onSecondaryContainer,
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = stringResource(Res.string.compose_player_remove_local_audio),
                color = colorScheme.onSecondaryContainer,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun AudioOffsetSlider(
    audioDelayMs: Int,
    onAudioDelayChanged: (Int) -> Unit,
) {
    val colorScheme = MaterialTheme.colorScheme
    val delayText = if (audioDelayMs == 0) {
        "0ms"
    } else {
        "${if (audioDelayMs > 0) "+" else ""}${audioDelayMs}ms"
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.compose_player_audio_offset),
                color = colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = delayText,
                color = colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
            )
        }
        Slider(
            value = audioDelayMs.toFloat(),
            onValueChange = { onAudioDelayChanged(it.roundToInt()) },
            valueRange = AUDIO_DELAY_MIN_MS.toFloat()..AUDIO_DELAY_MAX_MS.toFloat(),
            steps = ((AUDIO_DELAY_MAX_MS - AUDIO_DELAY_MIN_MS) / AUDIO_DELAY_STEP_MS) - 1,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
