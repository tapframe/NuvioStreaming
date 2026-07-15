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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_player_playback_info
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun PlaybackInfoModal(
    visible: Boolean,
    mediaInfoJson: String,
    selectedQualityVariant: PlayerQualityVariant? = null,
    selectedQualityIsAuto: Boolean = false,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val parsed = remember(mediaInfoJson) {
        runCatching { Json.parseToJsonElement(mediaInfoJson).jsonObject }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }
    }
    val hasSelectedQuality = selectedQualityVariant != null

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
                        .widthIn(max = 520.dp)
                        .fillMaxWidth(0.9f)
                        .heightIn(max = 560.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color(0xFF1E1E24),
                                    Color(0xFF0F0F12),
                                ),
                            ),
                        )
                        .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(24.dp))
                        .clickable(
                            indication = null,
                            interactionSource = remember { MutableInteractionSource() },
                            onClick = {},
                        ),
                ) {
                    Column(modifier = Modifier.padding(24.dp)) {
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
                                    .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(18.dp)),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Close,
                                    contentDescription = "Close",
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }

                        HorizontalDivider(color = Color.White.copy(alpha = 0.1f))

                        if (parsed == null && !hasSelectedQuality) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 48.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = "No playback information available yet.",
                                    color = Color.White.copy(alpha = 0.55f),
                                    fontSize = 15.sp,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        } else {
                            PlaybackInfoContent(
                                parsed = parsed,
                                selectedQualityVariant = selectedQualityVariant,
                                selectedQualityIsAuto = selectedQualityIsAuto,
                                modifier = Modifier
                                    .weight(1f)
                                    .verticalScroll(rememberScrollState()),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaybackInfoContent(
    parsed: JsonObject?,
    selectedQualityVariant: PlayerQualityVariant?,
    selectedQualityIsAuto: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        selectedQualityVariant?.let { variant ->
            SectionHeader(title = "Selected Quality")

            val qualityLabel = if (selectedQualityIsAuto) {
                "Auto (${variant.qualityName})"
            } else {
                variant.qualityName
            }
            InfoRow(label = "Requested Quality", value = qualityLabel)

            val declaredResolution = playerQualityNameForResolution(
                width = variant.width,
                height = variant.height,
                forButton = false,
            )
            if (!declaredResolution.isNullOrBlank()) {
                InfoRow(label = "Declared Resolution", value = declaredResolution)
            }

            val declaredBitrate = variant.bandwidth?.takeIf { it > 0L }?.formatPlaybackBitrate()
            if (!declaredBitrate.isNullOrBlank()) {
                InfoRow(label = "Declared Bitrate", value = declaredBitrate)
            }

            if (variant.codecs.isNotBlank()) {
                InfoRow(label = "Declared Codecs", value = variant.codecs)
            }
        }

        val playbackInfo = parsed ?: return@Column
        val engine = playbackInfo.stringValue("engine")
        if (engine.isNotBlank()) {
            SectionHeader(title = "Playback Engine")
            InfoRow(label = "Engine", value = engine)
        }

        val videoCodec = playbackInfo.stringValue("videoCodec")
        if (videoCodec.isNotBlank()) {
            SectionHeader(title = "Video Stream")

            val codecProfile = playbackInfo.stringValue("codecProfile")
            val videoFormat = if (codecProfile.isNotBlank()) "$videoCodec ($codecProfile)" else videoCodec
            InfoRow(label = "Codec", value = videoFormat)

            val width = playbackInfo.intValue("videoWidth")
            val height = playbackInfo.intValue("videoHeight")
            if (width > 0 && height > 0) {
                InfoRow(label = "Resolution", value = "${width}x${height}")
            }

            val fps = playbackInfo.doubleValue("fps")
            if (fps > 0.0) {
                InfoRow(label = "Frame Rate", value = "${fps.formatPlaybackNumber()} fps")
            }

            val videoDecoder = playbackInfo.stringValue("videoDecoder")
            if (videoDecoder.isNotBlank()) {
                InfoRow(label = "Decoder", value = videoDecoder)
            }

            val hwdecCurrent = playbackInfo.stringValue("hwdecCurrent")
            if (hwdecCurrent.isNotBlank()) {
                InfoRow(label = "Hardware Decoder", value = hwdecCurrent)
            }

            val hdrFormat = playbackInfo.stringValue("hdrFormat")
            val hdrLabel = when (hdrFormat) {
                "dolby_vision" -> "Dolby Vision"
                "hdr10_plus" -> "HDR10+"
                "hdr" -> "HDR10 / PQ"
                "hlg" -> "HLG"
                "sdr" -> "SDR"
                else -> "Unknown"
            }
            InfoRow(label = "Dynamic Range", value = hdrLabel)

            if (hdrFormat == "dolby_vision") {
                val dvProfile = playbackInfo.stringValue("dvProfile")
                val dvLower = dvProfile.lowercase()
                if (
                    dvProfile.isNotBlank() &&
                    dvLower != "none" &&
                    dvLower != "unknown" &&
                    dvLower != "0" &&
                    dvLower != "false"
                ) {
                    InfoRow(label = "Dolby Vision Profile", value = dvProfile)
                }
            }

            val primaries = playbackInfo.stringValue("primaries")
            if (primaries.isNotBlank()) {
                InfoRow(label = "Color Primaries", value = primaries)
            }

            val gamma = playbackInfo.stringValue("gamma")
            if (gamma.isNotBlank()) {
                InfoRow(label = "Transfer Function", value = gamma)
            }

            val pixelFormat = playbackInfo.stringValue("pixelFormat")
            if (pixelFormat.isNotBlank()) {
                InfoRow(label = "Pixel Format", value = pixelFormat)
            }

            val videoBitrateKbps = playbackInfo.intValue("videoBitrateKbps")
            if (videoBitrateKbps > 0) {
                InfoRow(label = "Bitrate", value = "$videoBitrateKbps kbps")
            }
        }

        val audioCodec = playbackInfo.stringValue("audioCodec")
        if (audioCodec.isNotBlank()) {
            SectionHeader(title = "Audio Stream")
            InfoRow(label = "Codec", value = audioCodec)

            val audioDecoder = playbackInfo.stringValue("audioDecoder")
            if (audioDecoder.isNotBlank()) {
                InfoRow(label = "Decoder", value = audioDecoder)
            }

            val audioChannels = playbackInfo.stringValue("audioChannels")
            if (audioChannels.isNotBlank() && audioChannels != "0") {
                val channelsLabel = when (audioChannels) {
                    "1" -> "Mono (1ch)"
                    "2" -> "Stereo (2ch)"
                    "6" -> "Surround (5.1ch)"
                    "8" -> "Surround (7.1ch)"
                    else -> "$audioChannels channels"
                }
                InfoRow(label = "Channels", value = channelsLabel)
            }

            val audioSampleRate = playbackInfo.stringValue("audioSampleRate")
            if (audioSampleRate.isNotBlank() && audioSampleRate != "0") {
                val rateLabel = runCatching {
                    val rate = audioSampleRate.toIntOrNull() ?: audioSampleRate.toDouble().toInt()
                    if (rate >= 1000) "${rate / 1000} kHz" else "$rate Hz"
                }.getOrDefault("$audioSampleRate Hz")
                InfoRow(label = "Sample Rate", value = rateLabel)
            }

            val audioLang = playbackInfo.stringValue("audioLang")
            if (audioLang.isNotBlank()) {
                InfoRow(label = "Language", value = audioLang)
            }

            val audioBitrateKbps = playbackInfo.intValue("audioBitrateKbps")
            if (audioBitrateKbps > 0) {
                InfoRow(label = "Bitrate", value = "$audioBitrateKbps kbps")
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
        modifier = Modifier.padding(top = 18.dp, bottom = 6.dp),
    )
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.55f),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .weight(0.42f)
                .padding(end = 16.dp),
        )
        Text(
            text = value,
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(0.58f),
        )
    }
}

private fun JsonObject.stringValue(key: String): String =
    get(key)?.jsonPrimitive?.contentOrNull.orEmpty()

private fun JsonObject.intValue(key: String): Int =
    get(key)?.jsonPrimitive?.intOrNull ?: 0

private fun JsonObject.doubleValue(key: String): Double =
    get(key)?.jsonPrimitive?.doubleOrNull ?: 0.0

private fun Long.formatPlaybackBitrate(): String {
    val mbps = this / 1_000_000.0
    return if (mbps >= 1.0) {
        "${mbps.formatPlaybackNumber()} Mbps"
    } else {
        "${(this / 1_000.0).formatPlaybackNumber()} Kbps"
    }
}

private fun Double.formatPlaybackNumber(): String =
    if (this % 1.0 == 0.0) toInt().toString() else toString().take(6).trimEnd('0').trimEnd('.')
