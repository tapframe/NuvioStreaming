@file:OptIn(androidx.tv.material3.ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import com.nuvio.tv.data.repository.SkipInterval
import com.nuvio.tv.ui.theme.NuvioColors
import kotlinx.coroutines.delay

/**
 * Skip Intro/Outro/Recap button for the player.
 * Appears at bottom-left when playback is within a skip interval.
 * Auto-hides after 15 seconds. Focusable for D-pad navigation.
 */
@Composable
fun SkipIntroButton(
    interval: SkipInterval?,
    dismissed: Boolean,
    controlsVisible: Boolean,
    onSkip: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    val shouldShow = interval != null && !dismissed
    var autoHidden by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    var isFocused by remember { mutableStateOf(false) }

    // Reset auto-hide when interval changes
    LaunchedEffect(interval?.startTime, interval?.type) {
        autoHidden = false
    }

    // Auto-hide after 15 seconds
    LaunchedEffect(shouldShow, autoHidden) {
        if (shouldShow && !autoHidden) {
            delay(15000)
            autoHidden = true
        }
    }

    // Re-show when controls become visible while auto-hidden
    LaunchedEffect(controlsVisible) {
        if (controlsVisible && autoHidden && interval != null && !dismissed) {
            autoHidden = false
        }
    }

    val isVisible = shouldShow && (!autoHidden || controlsVisible)

    // Request focus when becoming visible and controls aren't shown
    LaunchedEffect(isVisible) {
        if (isVisible && !controlsVisible) {
            delay(350) // Wait for animation
            try {
                focusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    AnimatedVisibility(
        visible = isVisible,
        enter = fadeIn(tween(300)) + scaleIn(tween(300), initialScale = 0.8f),
        exit = fadeOut(tween(200)) + scaleOut(tween(200), targetScale = 0.8f),
        modifier = modifier
    ) {
        Card(
            onClick = onSkip,
            modifier = Modifier
                .focusRequester(focusRequester)
                .onFocusChanged { isFocused = it.isFocused },
            colors = CardDefaults.colors(
                containerColor = Color(0xFF1E1E1E).copy(alpha = 0.85f),
                focusedContainerColor = NuvioColors.Secondary
            ),
            shape = CardDefaults.shape(shape = RoundedCornerShape(12.dp))
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.SkipNext,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = getSkipLabel(interval?.type),
                    color = Color.White,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
            // Accent bar at bottom
            Box(
                modifier = Modifier
                    .height(2.dp)
                    .clip(RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp))
                    .background(if (isFocused) Color.White else NuvioColors.Secondary)
                    .align(Alignment.CenterHorizontally)
            )
        }
    }
}

private fun getSkipLabel(type: String?): String = when (type) {
    "op", "mixed-op", "intro" -> "Skip Intro"
    "ed", "mixed-ed", "outro" -> "Skip Ending"
    "recap" -> "Skip Recap"
    else -> "Skip"
}
