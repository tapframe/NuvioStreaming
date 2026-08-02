package com.nuvio.app.features.player.dualsubtitle

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nuvio.app.features.player.AddonSubtitle

/**
 * UI section for selecting the secondary subtitle in the Subtitle Modal.
 *
 * Shows:
 * - Toggle to enable/disable dual subtitles
 * - List of available addon subtitles to pick as secondary
 * - Current selection indicator
 */
@Composable
fun DualSubtitleSection(
    addonSubtitles: List<AddonSubtitle>,
    modifier: Modifier = Modifier,
) {
    val state by DualSubtitleRepository.state.collectAsState()

    Column(modifier = modifier.fillMaxWidth().padding(top = 8.dp)) {
        // Header with toggle
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Dual Subtitles",
                    style = MaterialTheme.typography.titleSmall,
                    color = Color.White,
                )
                Text(
                    text = "Show a second subtitle language simultaneously",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.6f),
                    fontSize = 11.sp,
                )
            }
            if (state.enabled) {
                IconButton(
                    onClick = { DualSubtitleRepository.disable() },
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Disable dual subtitles",
                        tint = Color.White.copy(alpha = 0.7f),
                    )
                }
            }
        }

        if (state.enabled) {
            // Show current secondary selection
            val secondary = state.secondarySubtitle
            if (secondary != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Check,
                        contentDescription = null,
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "Secondary: ${secondary.display}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFFFD700),
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }

        // Subtitle list for secondary selection
        if (addonSubtitles.isNotEmpty()) {
            Text(
                text = if (state.enabled) "Change secondary subtitle:" else "Select secondary subtitle:",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.5f),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )

            addonSubtitles.forEach { subtitle ->
                val isSelected = state.secondarySubtitle?.id == subtitle.id
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            DualSubtitleRepository.enableDualSubtitle(subtitle)
                        }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = null,
                            tint = Color(0xFFFFD700),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    Text(
                        text = subtitle.display,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isSelected) Color(0xFFFFD700) else Color.White,
                        modifier = Modifier.padding(start = if (isSelected) 8.dp else 24.dp),
                    )
                }
            }
        }
    }
}
