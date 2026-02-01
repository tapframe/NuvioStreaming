@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.player

import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Speed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.media3.ui.PlayerView
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.IconButton
import androidx.tv.material3.IconButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.nuvio.tv.ui.components.LoadingIndicator
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.theme.NuvioTheme
import java.util.concurrent.TimeUnit

@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel = hiltViewModel(),
    onBackPress: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val lifecycleOwner = LocalLifecycleOwner.current
    val containerFocusRequester = remember { FocusRequester() }
    val playPauseFocusRequester = remember { FocusRequester() }

    BackHandler {
        if (uiState.showControls) {
            // If controls are visible, hide them instead of going back
            viewModel.hideControls()
        } else {
            // If controls are hidden, go back
            onBackPress()
        }
    }

    // Handle lifecycle events
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> {
                    viewModel.exoPlayer?.pause()
                }
                Lifecycle.Event.ON_RESUME -> {
                    // Don't auto-resume, let user control
                }
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Request focus for key events when controls are hidden
    LaunchedEffect(uiState.showControls) {
        if (uiState.showControls) {
            // When controls are shown, focus the play/pause button
            try {
                playPauseFocusRequester.requestFocus()
            } catch (e: Exception) {
                // Focus requester may not be ready yet
            }
        } else {
            // When controls are hidden, focus the container for key events
            try {
                containerFocusRequester.requestFocus()
            } catch (e: Exception) {
                // Focus requester may not be ready yet
            }
        }
    }

    // Initial focus
    LaunchedEffect(Unit) {
        containerFocusRequester.requestFocus()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(containerFocusRequester)
            .focusable()
            .onKeyEvent { keyEvent ->
                if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                            if (!uiState.showControls) {
                                viewModel.onEvent(PlayerEvent.OnToggleControls)
                                true
                            } else {
                                // Let the focused button handle it
                                false
                            }
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            if (!uiState.showControls) {
                                viewModel.onEvent(PlayerEvent.OnSeekForward)
                                true
                            } else {
                                // Let focus system handle navigation when controls are visible
                                false
                            }
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            if (!uiState.showControls) {
                                viewModel.onEvent(PlayerEvent.OnSeekBackward)
                                true
                            } else {
                                // Let focus system handle navigation when controls are visible
                                false
                            }
                        }
                        KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                            if (!uiState.showControls) {
                                viewModel.onEvent(PlayerEvent.OnToggleControls)
                                true
                            } else {
                                // Let focus system handle navigation when controls are visible
                                false
                            }
                        }
                        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                            viewModel.onEvent(PlayerEvent.OnPlayPause)
                            true
                        }
                        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                            viewModel.onEvent(PlayerEvent.OnSeekForward)
                            true
                        }
                        KeyEvent.KEYCODE_MEDIA_REWIND -> {
                            viewModel.onEvent(PlayerEvent.OnSeekBackward)
                            true
                        }
                        else -> false
                    }
                } else false
            }
    ) {
        // Video Player
        viewModel.exoPlayer?.let { player ->
            AndroidView(
                factory = { context ->
                    PlayerView(context).apply {
                        this.player = player
                        useController = false
                        setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
        }

        // Buffering indicator
        if (uiState.isBuffering) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                LoadingIndicator()
            }
        }

        // Error state
        if (uiState.error != null) {
            ErrorOverlay(
                message = uiState.error!!,
                onRetry = { viewModel.onEvent(PlayerEvent.OnRetry) },
                onBack = onBackPress
            )
        }

        // Controls overlay
        AnimatedVisibility(
            visible = uiState.showControls && uiState.error == null,
            enter = fadeIn(animationSpec = tween(200)),
            exit = fadeOut(animationSpec = tween(200))
        ) {
            PlayerControlsOverlay(
                uiState = uiState,
                playPauseFocusRequester = playPauseFocusRequester,
                onPlayPause = { viewModel.onEvent(PlayerEvent.OnPlayPause) },
                onSeekForward = { viewModel.onEvent(PlayerEvent.OnSeekForward) },
                onSeekBackward = { viewModel.onEvent(PlayerEvent.OnSeekBackward) },
                onSeekTo = { viewModel.onEvent(PlayerEvent.OnSeekTo(it)) },
                onShowAudioDialog = { viewModel.onEvent(PlayerEvent.OnShowAudioDialog) },
                onShowSubtitleDialog = { viewModel.onEvent(PlayerEvent.OnShowSubtitleDialog) },
                onShowSpeedDialog = { viewModel.onEvent(PlayerEvent.OnShowSpeedDialog) },
                onBack = onBackPress
            )
        }

        // Audio track dialog
        if (uiState.showAudioDialog) {
            TrackSelectionDialog(
                title = "Audio",
                tracks = uiState.audioTracks,
                selectedIndex = uiState.selectedAudioTrackIndex,
                onTrackSelected = { viewModel.onEvent(PlayerEvent.OnSelectAudioTrack(it)) },
                onDismiss = { viewModel.onEvent(PlayerEvent.OnDismissDialog) }
            )
        }

        // Subtitle track dialog
        if (uiState.showSubtitleDialog) {
            SubtitleSelectionDialog(
                tracks = uiState.subtitleTracks,
                selectedIndex = uiState.selectedSubtitleTrackIndex,
                onTrackSelected = { viewModel.onEvent(PlayerEvent.OnSelectSubtitleTrack(it)) },
                onDisableSubtitles = { viewModel.onEvent(PlayerEvent.OnDisableSubtitles) },
                onDismiss = { viewModel.onEvent(PlayerEvent.OnDismissDialog) }
            )
        }

        // Speed dialog
        if (uiState.showSpeedDialog) {
            SpeedSelectionDialog(
                currentSpeed = uiState.playbackSpeed,
                onSpeedSelected = { viewModel.onEvent(PlayerEvent.OnSetPlaybackSpeed(it)) },
                onDismiss = { viewModel.onEvent(PlayerEvent.OnDismissDialog) }
            )
        }
    }
}

@Composable
private fun PlayerControlsOverlay(
    uiState: PlayerUiState,
    playPauseFocusRequester: FocusRequester,
    onPlayPause: () -> Unit,
    onSeekForward: () -> Unit,
    onSeekBackward: () -> Unit,
    onSeekTo: (Long) -> Unit,
    onShowAudioDialog: () -> Unit,
    onShowSubtitleDialog: () -> Unit,
    onShowSpeedDialog: () -> Unit,
    onBack: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        // Top gradient
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp)
                .align(Alignment.TopCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.7f),
                            Color.Transparent
                        )
                    )
                )
        )

        // Bottom gradient
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.8f)
                        )
                    )
                )
        )

        // Top bar - Title
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 24.dp)
                .align(Alignment.TopStart),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = uiState.title,
                style = MaterialTheme.typography.headlineSmall,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }

        // Bottom controls
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .padding(horizontal = 32.dp, vertical = 24.dp)
        ) {
            // Progress bar
            ProgressBar(
                currentPosition = uiState.currentPosition,
                duration = uiState.duration,
                onSeekTo = onSeekTo
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Control buttons row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Left side - Playback controls
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ControlButton(
                        icon = Icons.Default.Replay10,
                        contentDescription = "Rewind 10 seconds",
                        onClick = onSeekBackward
                    )

                    // Play/Pause button (larger)
                    PlayPauseButton(
                        isPlaying = uiState.isPlaying,
                        focusRequester = playPauseFocusRequester,
                        onClick = onPlayPause
                    )

                    ControlButton(
                        icon = Icons.Default.Forward10,
                        contentDescription = "Forward 10 seconds",
                        onClick = onSeekForward
                    )

                    Spacer(modifier = Modifier.width(16.dp))

                    // Time display
                    Text(
                        text = "${formatTime(uiState.currentPosition)} / ${formatTime(uiState.duration)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.9f)
                    )
                }

                // Right side - Settings controls
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Speed indicator
                    if (uiState.playbackSpeed != 1f) {
                        Text(
                            text = "${uiState.playbackSpeed}x",
                            style = MaterialTheme.typography.labelMedium,
                            color = NuvioColors.Primary,
                            modifier = Modifier.padding(end = 4.dp)
                        )
                    }

                    ControlButton(
                        icon = Icons.Default.Speed,
                        contentDescription = "Playback speed",
                        onClick = onShowSpeedDialog
                    )

                    if (uiState.audioTracks.isNotEmpty()) {
                        ControlButton(
                            icon = Icons.AutoMirrored.Filled.VolumeUp,
                            contentDescription = "Audio tracks",
                            onClick = onShowAudioDialog
                        )
                    }

                    if (uiState.subtitleTracks.isNotEmpty()) {
                        ControlButton(
                            icon = Icons.Default.ClosedCaption,
                            contentDescription = "Subtitles",
                            onClick = onShowSubtitleDialog
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayPauseButton(
    isPlaying: Boolean,
    focusRequester: FocusRequester,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(64.dp)
            .focusRequester(focusRequester)
            .onFocusChanged { isFocused = it.isFocused },
        colors = IconButtonDefaults.colors(
            containerColor = Color.White.copy(alpha = 0.2f),
            focusedContainerColor = NuvioColors.Primary,
            contentColor = Color.White,
            focusedContentColor = NuvioColors.OnPrimary
        ),
        shape = IconButtonDefaults.shape(shape = CircleShape)
    ) {
        Icon(
            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
            contentDescription = if (isPlaying) "Pause" else "Play",
            modifier = Modifier.size(36.dp)
        )
    }
}

@Composable
private fun ControlButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(48.dp)
            .onFocusChanged { isFocused = it.isFocused },
        colors = IconButtonDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color.White.copy(alpha = 0.2f),
            contentColor = Color.White,
            focusedContentColor = Color.White
        ),
        shape = IconButtonDefaults.shape(shape = CircleShape)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(28.dp)
        )
    }
}

@Composable
private fun ProgressBar(
    currentPosition: Long,
    duration: Long,
    onSeekTo: (Long) -> Unit
) {
    val progress = if (duration > 0) {
        (currentPosition.toFloat() / duration.toFloat()).coerceIn(0f, 1f)
    } else 0f

    val animatedProgress by animateFloatAsState(
        targetValue = progress,
        animationSpec = tween(100),
        label = "progress"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(Color.White.copy(alpha = 0.3f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(animatedProgress)
                .clip(RoundedCornerShape(3.dp))
                .background(NuvioColors.Primary)
        )
    }
}

@Composable
private fun ErrorOverlay(
    message: String,
    onRetry: () -> Unit,
    onBack: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.9f)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Playback Error",
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White
            )

            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 32.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                DialogButton(
                    text = "Go Back",
                    onClick = onBack,
                    isPrimary = false
                )

                DialogButton(
                    text = "Retry",
                    onClick = onRetry,
                    isPrimary = true
                )
            }
        }
    }
}

@Composable
private fun TrackSelectionDialog(
    title: String,
    tracks: List<TrackInfo>,
    selectedIndex: Int,
    onTrackSelected: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .width(400.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(NuvioColors.BackgroundElevated)
        ) {
            Column(
                modifier = Modifier.padding(24.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.headlineSmall,
                    color = NuvioColors.TextPrimary,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                TvLazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.height(300.dp)
                ) {
                    items(tracks) { track ->
                        TrackItem(
                            track = track,
                            isSelected = track.index == selectedIndex,
                            onClick = { onTrackSelected(track.index) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SubtitleSelectionDialog(
    tracks: List<TrackInfo>,
    selectedIndex: Int,
    onTrackSelected: (Int) -> Unit,
    onDisableSubtitles: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .width(400.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(NuvioColors.BackgroundElevated)
        ) {
            Column(
                modifier = Modifier.padding(24.dp)
            ) {
                Text(
                    text = "Subtitles",
                    style = MaterialTheme.typography.headlineSmall,
                    color = NuvioColors.TextPrimary,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                TvLazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.height(300.dp)
                ) {
                    // Off option
                    item {
                        TrackItem(
                            track = TrackInfo(index = -1, name = "Off", language = null),
                            isSelected = selectedIndex == -1,
                            onClick = onDisableSubtitles
                        )
                    }

                    items(tracks) { track ->
                        TrackItem(
                            track = track,
                            isSelected = track.index == selectedIndex,
                            onClick = { onTrackSelected(track.index) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SpeedSelectionDialog(
    currentSpeed: Float,
    onSpeedSelected: (Float) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .width(300.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(NuvioColors.BackgroundElevated)
        ) {
            Column(
                modifier = Modifier.padding(24.dp)
            ) {
                Text(
                    text = "Playback Speed",
                    style = MaterialTheme.typography.headlineSmall,
                    color = NuvioColors.TextPrimary,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                TvLazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(PLAYBACK_SPEEDS) { speed ->
                        SpeedItem(
                            speed = speed,
                            isSelected = speed == currentSpeed,
                            onClick = { onSpeedSelected(speed) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TrackItem(
    track: TrackInfo,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
        colors = CardDefaults.colors(
            containerColor = if (isSelected) NuvioColors.Primary.copy(alpha = 0.2f) else NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.Primary.copy(alpha = 0.4f)
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(8.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = track.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (isSelected) NuvioColors.Primary else NuvioColors.TextPrimary
                )
                if (track.language != null) {
                    Text(
                        text = track.language.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = NuvioTheme.extendedColors.textSecondary
                    )
                }
            }

            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = NuvioColors.Primary,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

@Composable
private fun SpeedItem(
    speed: Float,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
        colors = CardDefaults.colors(
            containerColor = if (isSelected) NuvioColors.Primary.copy(alpha = 0.2f) else NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.Primary.copy(alpha = 0.4f)
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(8.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = if (speed == 1f) "Normal" else "${speed}x",
                style = MaterialTheme.typography.bodyLarge,
                color = if (isSelected) NuvioColors.Primary else NuvioColors.TextPrimary
            )

            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = NuvioColors.Primary,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

@Composable
private fun DialogButton(
    text: String,
    onClick: () -> Unit,
    isPrimary: Boolean
) {
    var isFocused by remember { mutableStateOf(false) }

    Card(
        onClick = onClick,
        modifier = Modifier.onFocusChanged { isFocused = it.isFocused },
        colors = CardDefaults.colors(
            containerColor = if (isPrimary) NuvioColors.Primary else NuvioColors.BackgroundCard,
            focusedContainerColor = if (isPrimary) NuvioColors.Primary else NuvioColors.FocusBackground
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(8.dp))
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = if (isPrimary) NuvioColors.OnPrimary else NuvioColors.TextPrimary,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp)
        )
    }
}

private fun formatTime(millis: Long): String {
    if (millis <= 0) return "0:00"
    
    val hours = TimeUnit.MILLISECONDS.toHours(millis)
    val minutes = TimeUnit.MILLISECONDS.toMinutes(millis) % 60
    val seconds = TimeUnit.MILLISECONDS.toSeconds(millis) % 60

    return if (hours > 0) {
        String.format("%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format("%d:%02d", minutes, seconds)
    }
}
