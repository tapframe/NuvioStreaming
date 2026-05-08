package com.nuvio.app.core.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.floating_prompt_continue_where_left_off
import org.jetbrains.compose.resources.stringResource
import kotlin.math.roundToInt

private const val AutoDismissDelayMs = 15_000L
private const val SwipeDismissThreshold = 80f

@Composable
fun NuvioFloatingPrompt(
    visible: Boolean,
    imageUrl: String?,
    title: String,
    subtitle: String,
    progressFraction: Float,
    actionLabel: String,
    onAction: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    autoDismissMs: Long = AutoDismissDelayMs,
) {
    val visibilityState = remember { MutableTransitionState(false) }
    val coroutineScope = rememberCoroutineScope()
    val density = LocalDensity.current
    val hapticFeedback = LocalHapticFeedback.current
    val dragOffsetY = remember { Animatable(0f) }
    var promptHeightPx by remember { mutableIntStateOf(0) }
    val actionWithHaptic = remember(hapticFeedback, onAction) {
        {
            hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
            onAction()
        }
    }

    LaunchedEffect(visible) {
        visibilityState.targetState = visible
        if (visible) {
            dragOffsetY.snapTo(0f)
            hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }

    if (visible) {
        LaunchedEffect(Unit) {
            delay(autoDismissMs)
            val dismissDistance = maxOf(
                promptHeightPx.toFloat() + with(density) { 24.dp.toPx() },
                with(density) { 160.dp.toPx() },
            )
            dragOffsetY.animateTo(
                targetValue = dismissDistance,
                animationSpec = tween(durationMillis = 240),
            )
            onDismiss()
        }
    }

    val navBarBottom = nuvioBottomNavigationBarInsets()
        .asPaddingValues()
        .calculateBottomPadding()

    AnimatedVisibility(
        visibleState = visibilityState,
        modifier = modifier,
        enter = fadeIn(tween(400)) + slideInVertically(tween(400)) { it },
        exit = fadeOut(tween(300)) + slideOutVertically(tween(300)) { it },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = navBarBottom + 72.dp)
                .padding(horizontal = 16.dp)
                .offset { IntOffset(0, dragOffsetY.value.roundToInt().coerceAtLeast(0)) }
                .pointerInput(Unit) {
                    detectVerticalDragGestures(
                        onDragEnd = {
                            val shouldDismiss = dragOffsetY.value > SwipeDismissThreshold
                            coroutineScope.launch {
                                if (shouldDismiss) {
                                    hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    val dismissDistance = maxOf(
                                        promptHeightPx.toFloat() + with(density) { 24.dp.toPx() },
                                        with(density) { 160.dp.toPx() },
                                    )
                                    dragOffsetY.animateTo(
                                        targetValue = dismissDistance,
                                        animationSpec = tween(durationMillis = 220),
                                    )
                                    onDismiss()
                                } else {
                                    dragOffsetY.animateTo(
                                        targetValue = 0f,
                                        animationSpec = tween(durationMillis = 180),
                                    )
                                }
                            }
                        },
                        onDragCancel = {
                            coroutineScope.launch {
                                dragOffsetY.animateTo(
                                    targetValue = 0f,
                                    animationSpec = tween(durationMillis = 180),
                                )
                            }
                        },
                    ) { _, dragAmount ->
                        coroutineScope.launch {
                            dragOffsetY.snapTo((dragOffsetY.value + dragAmount).coerceAtLeast(0f))
                        }
                    }
                },
            contentAlignment = Alignment.BottomCenter,
        ) {
            Surface(
                modifier = Modifier.onSizeChanged { promptHeightPx = it.height },
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                tonalElevation = 4.dp,
                shadowElevation = 8.dp,
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(width = 54.dp, height = 78.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (imageUrl != null) {
                                AsyncImage(
                                    model = imageUrl,
                                    contentDescription = null,
                                    modifier = Modifier.matchParentSize(),
                                    contentScale = ContentScale.Crop,
                                )
                            }
                        }

                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                text = stringResource(Res.string.floating_prompt_continue_where_left_off),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = title,
                                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }

                        Box(
                            modifier = Modifier.size(42.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            FilledIconButton(
                                onClick = actionWithHaptic,
                                modifier = Modifier.size(42.dp),
                                shape = CircleShape,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.PlayArrow,
                                    contentDescription = actionLabel,
                                    modifier = Modifier.size(22.dp),
                                )
                            }
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(999.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
                            .height(8.dp)
                            .padding(1.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(progressFraction.coerceIn(0f, 1f))
                                .height(6.dp)
                                .clip(RoundedCornerShape(999.dp)),
                        ) {
                            Box(
                                modifier = Modifier
                                    .matchParentSize()
                                    .background(MaterialTheme.colorScheme.primary),
                            )
                        }
                    }
                }
            }
        }
    }
}
