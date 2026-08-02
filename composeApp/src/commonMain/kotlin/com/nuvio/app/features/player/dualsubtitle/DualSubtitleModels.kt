package com.nuvio.app.features.player.dualsubtitle

import androidx.compose.ui.graphics.Color
import com.nuvio.app.features.player.AddonSubtitle

/**
 * Represents the state of the dual subtitle feature.
 */
data class DualSubtitleState(
    val enabled: Boolean = false,
    val primarySubtitle: AddonSubtitle? = null,
    val secondarySubtitle: AddonSubtitle? = null,
    val primaryCueText: String = "",
    val secondaryCueText: String = "",
)

/**
 * Style configuration for the secondary subtitle line.
 */
data class SecondarySubtitleStyle(
    val textColor: Color = Color(0xFFFFD700), // Gold for differentiation
    val backgroundColor: Color = Color.Black.copy(alpha = 0.5f),
    val fontSizeSp: Int = 14,
    val bold: Boolean = false,
    val bottomOffset: Int = 80, // Higher than primary to avoid overlap
)

/**
 * Parsed subtitle cue from SRT/VTT file.
 */
data class SubtitleCue(
    val startTimeMs: Long,
    val endTimeMs: Long,
    val text: String,
)
