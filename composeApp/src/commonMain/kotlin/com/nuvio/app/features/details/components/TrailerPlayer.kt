package com.nuvio.app.features.details.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Forward10
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.nuvio.app.core.ui.PlatformBackHandler
import com.nuvio.app.features.player.EnterImmersivePlayerMode
import com.nuvio.app.features.player.LockPlayerToLandscape
import com.nuvio.app.features.player.PlatformPlayerSurface
import com.nuvio.app.features.player.PlayerEngineController
import com.nuvio.app.features.player.PlayerLayoutMetrics
import com.nuvio.app.features.player.PlayerPlaybackSnapshot
import com.nuvio.app.features.player.PlayerResizeMode
import com.nuvio.app.features.player.formatPlaybackTime
import com.nuvio.app.features.player.playerHorizontalSafePadding
import com.nuvio.app.features.trailer.TrailerPlaybackSource
import kotlinx.coroutines.delay
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_retry
import nuvio.composeapp.generated.resources.compose_player_seek_back_10
import nuvio.composeapp.generated.resources.compose_player_seek_forward_10
import nuvio.composeapp.generated.resources.detail_tab_trailer
import nuvio.composeapp.generated.resources.trailer_close
import nuvio.composeapp.generated.resources.trailer_unable_to_play
import org.jetbrains.compose.resources.stringResource

private const val TrailerControlsAutoHideMs = 3500L
private const val TrailerSeekStepMs = 10_000L

@Composable
fun TrailerPlayer(
    visible: Boolean,
    trailerTitle: String,
    trailerType: String,
    contentTitle: String,
    playbackSource: TrailerPlaybackSource?,
    isLoading: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onRetry: (() -> Unit)? = null,
) {
    if (!visible) return

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
        ),
    ) {
        FullscreenTrailerPlayerContent(
            trailerTitle = trailerTitle,
            trailerType = trailerType,
            contentTitle = contentTitle,
            playbackSource = playbackSource,
            isLoading = isLoading,
            errorMessage = errorMessage,
            onDismiss = onDismiss,
            onRetry = onRetry,
        )
    }
}

@Composable
private fun FullscreenTrailerPlayerContent(
    trailerTitle: String,
    trailerType: String,
    contentTitle: String,
    playbackSource: TrailerPlaybackSource?,
    isLoading: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onRetry: (() -> Unit)?,
) {
    LockPlayerToLandscape()
    EnterImmersivePlayerMode(true)
    PlatformBackHandler(enabled = true, onBack = onDismiss)

    val headerType = trailerType.trim().ifBlank { stringResource(Res.string.detail_tab_trailer) }
    val headerSubtitle = remember(trailerTitle, contentTitle, headerType) {
        buildList {
            if (trailerTitle.isNotBlank() && !trailerTitle.equals(headerType, ignoreCase = true)) {
                add(trailerTitle)
            }
            if (contentTitle.isNotBlank()) {
                add(contentTitle)
            }
        }.joinToString(separator = " • ")
    }

    var playerError by remember(playbackSource?.videoUrl, playbackSource?.audioUrl) {
        mutableStateOf<String?>(null)
    }
    val activeError = errorMessage ?: playerError

    var playerController by remember(playbackSource?.videoUrl) {
        mutableStateOf<PlayerEngineController?>(null)
    }
    var playbackSnapshot by remember(playbackSource?.videoUrl) {
        mutableStateOf(PlayerPlaybackSnapshot())
    }
    var scrubbingPositionMs by remember(playbackSource?.videoUrl) {
        mutableStateOf<Long?>(null)
    }
    val displayedPositionMs = scrubbingPositionMs ?: playbackSnapshot.positionMs

    var controlsVisible by remember { mutableStateOf(false) }
    LaunchedEffect(controlsVisible, playbackSnapshot.isPlaying, isLoading, activeError, playbackSource) {
        if (!controlsVisible || !playbackSnapshot.isPlaying || isLoading || activeError != null || playbackSource == null) {
            return@LaunchedEffect
        }
        delay(TrailerControlsAutoHideMs)
        controlsVisible = false
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        val metrics = remember(maxWidth) { PlayerLayoutMetrics.fromWidth(maxWidth) }
        val horizontalSafePadding = playerHorizontalSafePadding()

        when {
            isLoading -> {
                CircularProgressIndicator(
                    color = Color.White,
                    modifier = Modifier.align(Alignment.Center),
                )
            }

            activeError != null -> {
                Column(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = stringResource(Res.string.trailer_unable_to_play),
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                    )
                    Text(
                        text = activeError,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.7f),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (onRetry != null) {
                        TextButton(onClick = onRetry) {
                            Text(stringResource(Res.string.action_retry))
                        }
                    }
                }
            }

            playbackSource != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(Unit) {
                            detectTapGestures(onTap = { controlsVisible = !controlsVisible })
                        },
                ) {
                    PlatformPlayerSurface(
                        sourceUrl = playbackSource.videoUrl,
                        sourceAudioUrl = playbackSource.audioUrl,
                        useYoutubeChunkedPlayback = true,
                        modifier = Modifier.fillMaxSize(),
                        playWhenReady = true,
                        resizeMode = PlayerResizeMode.Fit,
                        useNativeController = false,
                        onControllerReady = { playerController = it },
                        onSnapshot = { playbackSnapshot = it },
                        onError = { playerError = it },
                    )
                }
                if (playbackSnapshot.isLoading) {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
            }
        }

        AnimatedVisibility(
            visible = controlsVisible || isLoading || activeError != null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize(),
        ) {
            ControlsOverlay(
                title = headerType,
                subtitle = headerSubtitle,
                playbackSnapshot = playbackSnapshot,
                displayedPositionMs = displayedPositionMs,
                metrics = metrics,
                horizontalSafePadding = horizontalSafePadding,
                hasPlaybackSurface = playbackSource != null && activeError == null,
                onClose = onDismiss,
                onTogglePlayback = {
                    val controller = playerController ?: return@ControlsOverlay
                    if (playbackSnapshot.isPlaying) controller.pause() else controller.play()
                },
                onSeekBack = { playerController?.seekBy(-TrailerSeekStepMs) },
                onSeekForward = { playerController?.seekBy(TrailerSeekStepMs) },
                onScrubChange = { scrubbingPositionMs = it },
                onScrubFinished = {
                    val controller = playerController
                    val target = scrubbingPositionMs
                    scrubbingPositionMs = null
                    if (controller != null && target != null) {
                        controller.seekTo(target)
                    }
                },
            )
        }
    }
}

@Composable
private fun ControlsOverlay(
    title: String,
    subtitle: String,
    playbackSnapshot: PlayerPlaybackSnapshot,
    displayedPositionMs: Long,
    metrics: PlayerLayoutMetrics,
    horizontalSafePadding: Dp,
    hasPlaybackSurface: Boolean,
    onClose: () -> Unit,
    onTogglePlayback: () -> Unit,
    onSeekBack: () -> Unit,
    onSeekForward: () -> Unit,
    onScrubChange: (Long) -> Unit,
    onScrubFinished: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        TopBar(
            title = title,
            subtitle = subtitle,
            onClose = onClose,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(horizontal = horizontalSafePadding),
        )

        if (hasPlaybackSurface) {
            CenterControls(
                snapshot = playbackSnapshot,
                metrics = metrics,
                onSeekBack = onSeekBack,
                onSeekForward = onSeekForward,
                onTogglePlayback = onTogglePlayback,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(bottom = metrics.centerLift),
            )

            ProgressBar(
                playbackSnapshot = playbackSnapshot,
                displayedPositionMs = displayedPositionMs,
                metrics = metrics,
                onScrubChange = onScrubChange,
                onScrubFinished = onScrubFinished,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = horizontalSafePadding + metrics.horizontalPadding)
                    .padding(bottom = metrics.sliderBottomOffset),
            )
        }
    }
}

@Composable
private fun TopBar(
    title: String,
    subtitle: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(
                Color.Black.copy(alpha = 0.55f),
                shape = RoundedCornerShape(bottomStart = 18.dp, bottomEnd = 18.dp),
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.12f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClose,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.Close,
                contentDescription = stringResource(Res.string.trailer_close),
                tint = Color.White,
            )
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle.isNotBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.75f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun ProgressBar(
    playbackSnapshot: PlayerPlaybackSnapshot,
    displayedPositionMs: Long,
    metrics: PlayerLayoutMetrics,
    onScrubChange: (Long) -> Unit,
    onScrubFinished: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val durationMs = playbackSnapshot.durationMs.coerceAtLeast(1L)
    val clampedPosition = displayedPositionMs.coerceIn(0L, durationMs)
    Column(modifier = modifier) {
        Slider(
            modifier = Modifier
                .fillMaxWidth()
                .height(metrics.sliderTouchHeight)
                .graphicsLayer(scaleY = metrics.sliderScaleY),
            value = clampedPosition.toFloat(),
            onValueChange = { onScrubChange(it.toLong()) },
            onValueChangeFinished = onScrubFinished,
            valueRange = 0f..durationMs.toFloat(),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp)
                .padding(top = 4.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TimePill(text = formatPlaybackTime(clampedPosition), fontSize = metrics.timeSize)
            TimePill(text = formatPlaybackTime(durationMs), fontSize = metrics.timeSize)
        }
    }
}

@Composable
private fun CenterControls(
    snapshot: PlayerPlaybackSnapshot,
    metrics: PlayerLayoutMetrics,
    onSeekBack: () -> Unit,
    onSeekForward: () -> Unit,
    onTogglePlayback: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(metrics.centerGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SideControlButton(
            icon = Icons.Rounded.Replay10,
            contentDescription = stringResource(Res.string.compose_player_seek_back_10),
            metrics = metrics,
            onClick = onSeekBack,
        )
        PlayPauseControlButton(
            isPlaying = snapshot.isPlaying,
            isBuffering = snapshot.isLoading,
            metrics = metrics,
            onClick = onTogglePlayback,
        )
        SideControlButton(
            icon = Icons.Rounded.Forward10,
            contentDescription = stringResource(Res.string.compose_player_seek_forward_10),
            metrics = metrics,
            onClick = onSeekForward,
        )
    }
}

@Composable
private fun SideControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String?,
    metrics: PlayerLayoutMetrics,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .padding(metrics.sideButtonPadding),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = Color.White,
            modifier = Modifier.size(metrics.sideIconSize),
        )
    }
}

@Composable
private fun PlayPauseControlButton(
    isPlaying: Boolean,
    isBuffering: Boolean,
    metrics: PlayerLayoutMetrics,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .padding(metrics.playButtonPadding),
        contentAlignment = Alignment.Center,
    ) {
        if (isBuffering) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 3.dp,
                modifier = Modifier.size(metrics.playIconSize),
            )
        } else {
            Icon(
                imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(metrics.playIconSize),
            )
        }
    }
}

@Composable
private fun TimePill(
    text: String,
    fontSize: androidx.compose.ui.unit.TextUnit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Black.copy(alpha = 0.5f))
            .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = fontSize,
                fontWeight = FontWeight.Medium,
            ),
            color = Color.White,
        )
    }
}
