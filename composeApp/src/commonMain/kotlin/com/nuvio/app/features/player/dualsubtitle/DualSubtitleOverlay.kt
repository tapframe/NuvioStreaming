package com.nuvio.app.features.player.dualsubtitle

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Composable overlay that renders the secondary subtitle text.
 *
 * This is placed above the primary subtitle area in the player layout.
 * It observes [DualSubtitleRepository.state] and renders the current
 * secondary cue text with the configured style.
 *
 * Usage: Place this in the player overlay composable hierarchy,
 * positioned above the primary subtitle view.
 */
@Composable
fun DualSubtitleOverlay(
    modifier: Modifier = Modifier,
) {
    val state by DualSubtitleRepository.state.collectAsState()
    val style by DualSubtitleRepository.secondaryStyle.collectAsState()

    val text = state.secondaryCueText

    AnimatedVisibility(
        visible = state.enabled && text.isNotBlank(),
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Text(
                text = text,
                color = style.textColor,
                fontSize = style.fontSizeSp.sp,
                fontWeight = if (style.bold) FontWeight.Bold else FontWeight.Normal,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(style.backgroundColor)
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
    }
}
