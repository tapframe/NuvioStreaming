package com.nuvio.app.features.details.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.nuvio.app.core.ui.PlatformBackHandler
import com.nuvio.app.features.player.EnterImmersivePlayerMode
import com.nuvio.app.features.player.LockPlayerToLandscape
import com.nuvio.app.features.player.PlatformPlayerSurface
import com.nuvio.app.features.player.PlayerResizeMode
import com.nuvio.app.features.trailer.TrailerPlaybackSource
import kotlinx.coroutines.delay
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_retry
import nuvio.composeapp.generated.resources.detail_tab_trailer
import nuvio.composeapp.generated.resources.trailer_close
import nuvio.composeapp.generated.resources.trailer_unable_to_play
import org.jetbrains.compose.resources.stringResource

private const val TrailerControlsAutoHideMs = 3500L

@Composable
fun FullscreenTrailerPlayer(
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
    EnterImmersivePlayerMode()
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

    var controlsVisible by remember { mutableStateOf(false) }
    LaunchedEffect(controlsVisible, isLoading, activeError, playbackSource) {
        if (!controlsVisible || isLoading || activeError != null || playbackSource == null) {
            return@LaunchedEffect
        }
        delay(TrailerControlsAutoHideMs)
        controlsVisible = false
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    controlsVisible = !controlsVisible
                }
            },
    ) {
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
                PlatformPlayerSurface(
                    sourceUrl = playbackSource.videoUrl,
                    sourceAudioUrl = playbackSource.audioUrl,
                    useYoutubeChunkedPlayback = true,
                    modifier = Modifier.fillMaxSize(),
                    playWhenReady = true,
                    resizeMode = PlayerResizeMode.Fit,
                    useNativeController = true,
                    onControllerReady = {},
                    onSnapshot = {},
                    onError = { playerError = it },
                )
            }
        }

        AnimatedVisibility(
            visible = controlsVisible || isLoading || activeError != null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopStart),
        ) {
            TrailerTopBar(
                title = headerType,
                subtitle = headerSubtitle,
                onClose = onDismiss,
            )
        }
    }
}

@Composable
private fun TrailerTopBar(
    title: String,
    subtitle: String,
    onClose: () -> Unit,
) {
    Row(
        modifier = Modifier
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
