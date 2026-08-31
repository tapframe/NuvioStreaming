package com.nuvio.app.features.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvioTypeScale

/**
 * Full-screen overlay that surfaces the resolved stream URL, time-to-first-byte
 * and other stream provenance for the active playback. Background tap dismisses.
 *
 * NOTE: static, uncompiled port of the legacy `StreamInfoOverlay`. Labels are
 * plain English strings; localizing via compose-resources is a follow-up.
 */
@Composable
fun StreamInfoOverlay(
    data: StreamInfoData?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val info = data ?: return

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.82f))
            .clickable(onClick = onDismiss),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF161616),
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .widthIn(max = 520.dp)
                .clickable(onClick = {}),
        ) {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = "Stream info",
                    style = MaterialTheme.nuvioTypeScale.titleLg,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
                info.addonName?.let { InfoRow(label = "Source", value = it) }
                info.streamName?.let { InfoRow(label = "Stream", value = it) }
                info.streamDescription?.let { InfoRow(label = "Details", value = it) }
                info.filename?.let { InfoRow(label = "File", value = it) }
                info.streamUrl?.let { InfoRow(label = "URL", value = it) }
                info.timeToFirstByteMs
                    ?.takeIf { it >= 0L }
                    ?.let { InfoRow(label = "First byte", value = formatTimeToFirstByte(it)) }

                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .align(Alignment.End)
                        .clickable(onClick = onDismiss),
                ) {
                    Text(
                        text = "Close",
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
                        style = MaterialTheme.nuvioTypeScale.bodyLg.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.nuvioTypeScale.labelSm,
            color = Color.White.copy(alpha = 0.55f),
            modifier = Modifier.width(84.dp),
        )
        Text(
            text = value,
            style = MaterialTheme.nuvioTypeScale.bodyMd,
            color = Color.White,
            maxLines = 6,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun formatTimeToFirstByte(ms: Long): String {
    if (ms < 1_000L) return "$ms ms"
    val wholeSeconds = ms / 1_000L
    val hundredths = ((ms % 1_000L) / 10L).toString().padStart(2, '0')
    return "$wholeSeconds.$hundredths s"
}
