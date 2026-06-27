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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_player_playback_info
import org.jetbrains.compose.resources.stringResource

@Composable
fun PlaybackInfoModal(
    visible: Boolean,
    mediaInfoJson: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val parsed = remember(mediaInfoJson) {
        runCatching {
            Json.parseToJsonElement(mediaInfoJson).jsonObject
        }.getOrNull()
    }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(200)),
        exit = fadeOut(tween(200)),
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() },
                    onClick = onDismiss,
                )
                .background(Color.Black.copy(alpha = 0.65f)),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = slideInVertically(tween(300)) { it / 3 } + fadeIn(tween(300)),
                exit = slideOutVertically(tween(250)) { it / 3 } + fadeOut(tween(250)),
            ) {
                Box(
                    modifier = Modifier
                        .widthIn(max = 460.dp)
                        .fillMaxWidth(0.9f)
                        .heightIn(max = 550.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color(0xFF1E1E24),
                                    Color(0xFF0F0F12),
                                )
                            )
                        )
                        .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(24.dp))
                        .clickable(
                            indication = null,
                            interactionSource = remember { MutableInteractionSource() },
                            onClick = {},
                        ),
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp)
                    ) {
                        // Title bar
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = stringResource(Res.string.compose_player_playback_info),
                                color = Color.White,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            IconButton(
                                onClick = onDismiss,
                                modifier = Modifier
                                    .size(36.dp)
                                    .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(18.dp))
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Close,
                                    contentDescription = "Close",
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        HorizontalDivider(color = Color.White.copy(alpha = 0.1f))

                        if (parsed == null || parsed.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 48.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "No stream details active",
                                    color = Color.White.copy(alpha = 0.5f),
                                    fontSize = 15.sp
                                )
                            }
                        } else {
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .verticalScroll(rememberScrollState())
                            ) {

                                // Video details
                                val videoCodec = parsed["videoCodec"]?.jsonPrimitive?.content ?: ""
                                if (videoCodec.isNotBlank()) {
                                    SectionHeader(title = "Video Stream")
                                    
                                    val codecProfile = parsed["codecProfile"]?.jsonPrimitive?.content
                                    val videoFormat = if (codecProfile != null) "$videoCodec ($codecProfile)" else videoCodec
                                    InfoRow(label = "Codec", value = videoFormat)

                                    val width = parsed["videoWidth"]?.jsonPrimitive?.intOrNull ?: 0
                                    val height = parsed["videoHeight"]?.jsonPrimitive?.intOrNull ?: 0
                                    if (width > 0 && height > 0) {
                                        InfoRow(label = "Resolution", value = "${width}x${height}")
                                    }

                                    val fps = parsed["fps"]?.jsonPrimitive?.doubleOrNull ?: 0.0
                                    if (fps > 0.0) {
                                        val formattedFps = if (fps % 1.0 == 0.0) fps.toInt().toString() else stringFormat(fps)
                                        InfoRow(label = "Frame Rate", value = "$formattedFps fps")
                                    }

                                    val videoDecoder = parsed["videoDecoder"]?.jsonPrimitive?.content ?: ""
                                    if (videoDecoder.isNotBlank()) {
                                        InfoRow(label = "Decoder", value = videoDecoder)
                                    }

                                    val hwdecCurrent = parsed["hwdecCurrent"]?.jsonPrimitive?.content ?: ""
                                    if (hwdecCurrent.isNotBlank() && hwdecCurrent != "no") {
                                        InfoRow(label = "Hardware Decoder", value = hwdecCurrent)
                                    }

                                    val hdrFormat = parsed["hdrFormat"]?.jsonPrimitive?.content ?: ""
                                    val gamma = parsed["gamma"]?.jsonPrimitive?.content ?: ""
                                    val primaries = parsed["primaries"]?.jsonPrimitive?.content ?: ""

                                    val hdrLabel = when (hdrFormat) {
                                        "dolby_vision" -> "Dolby Vision"
                                        "hdr" -> "HDR10"
                                        else -> "SDR (Standard)"
                                    }
                                    InfoRow(label = "Dynamic Range", value = hdrLabel)

                                    if (hdrFormat == "dolby_vision") {
                                        val dvProfile = parsed["dvProfile"]?.jsonPrimitive?.content ?: ""
                                        val dvLower = dvProfile.lowercase()
                                        if (dvProfile.isNotBlank() && dvLower != "none" && dvLower != "unknown" && dvLower != "0" && dvLower != "false") {
                                            InfoRow(label = "Dolby Vision Profile", value = dvProfile)
                                        }
                                    }

                                    if (primaries.isNotBlank()) {
                                        InfoRow(label = "Color Primaries", value = primaries)
                                    }
                                    if (gamma.isNotBlank()) {
                                        InfoRow(label = "Transfer Function", value = gamma)
                                    }

                                    val videoBitrateKbps = parsed["videoBitrateKbps"]?.jsonPrimitive?.intOrNull ?: 0
                                    if (videoBitrateKbps > 0) {
                                        InfoRow(label = "Bitrate", value = "$videoBitrateKbps kbps")
                                    }
                                }

                                // Audio details
                                val audioCodec = parsed["audioCodec"]?.jsonPrimitive?.content ?: ""
                                if (audioCodec.isNotBlank()) {
                                    SectionHeader(title = "Audio Stream")
                                    InfoRow(label = "Codec", value = audioCodec)

                                    val audioDecoder = parsed["audioDecoder"]?.jsonPrimitive?.content ?: ""
                                    if (audioDecoder.isNotBlank()) {
                                        InfoRow(label = "Decoder", value = audioDecoder)
                                    }

                                    val audioChannels = parsed["audioChannels"]?.jsonPrimitive?.content ?: ""
                                    if (audioChannels.isNotBlank()) {
                                        val channelsVal = when (audioChannels) {
                                            "1" -> "Mono (1ch)"
                                            "2" -> "Stereo (2ch)"
                                            "6" -> "Surround (5.1ch)"
                                            "8" -> "Surround (7.1ch)"
                                            else -> "$audioChannels channels"
                                        }
                                        InfoRow(label = "Channels", value = channelsVal)
                                    }

                                    val audioSampleRate = parsed["audioSampleRate"]?.jsonPrimitive?.content ?: ""
                                    if (audioSampleRate.isNotBlank()) {
                                        val rateKhz = runCatching {
                                            val rateInt = audioSampleRate.toIntOrNull() ?: audioSampleRate.toDouble().toInt()
                                            "${rateInt / 1000} kHz"
                                        }.getOrDefault("$audioSampleRate Hz")
                                        InfoRow(label = "Sample Rate", value = rateKhz)
                                    }



                                    val audioBitrateKbps = parsed["audioBitrateKbps"]?.jsonPrimitive?.intOrNull ?: 0
                                    if (audioBitrateKbps > 0) {
                                        InfoRow(label = "Bitrate", value = "$audioBitrateKbps kbps")
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
private fun SectionHeader(title: String) {
    Text(
        text = title.uppercase(),
        color = Color(0xFFFF8A00),
        fontSize = 11.sp,
        fontWeight = FontWeight.Black,
        modifier = Modifier.padding(top = 18.dp, bottom = 6.dp)
    )
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.5f),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(end = 16.dp)
        )
        Text(
            text = value,
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis
        )
    }
}

private fun stringFormat(value: Double): String {
    val integerPart = value.toLong()
    val fractionalPart = ((value - integerPart) * 1000).toLong()
    if (fractionalPart == 0L) return integerPart.toString()
    return "${integerPart}.${fractionalPart.toString().trimEnd('0')}"
}
