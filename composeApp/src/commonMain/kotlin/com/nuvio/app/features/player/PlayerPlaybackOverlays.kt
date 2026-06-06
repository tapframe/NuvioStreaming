package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeContent
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.p2p.P2pLoadingStatus
import com.nuvio.app.features.player.skip.NextEpisodeCard
import com.nuvio.app.features.player.skip.NextEpisodeInfo
import com.nuvio.app.features.player.skip.SkipIntroButton
import com.nuvio.app.features.player.skip.SkipInterval

@Composable
internal fun BoxScope.PlayerPlaybackOverlays(
    playerControlsLocked: Boolean,
    lockedOverlayVisible: Boolean,
    playbackSnapshot: PlayerPlaybackSnapshot,
    displayedPositionMs: Long,
    metrics: PlayerLayoutMetrics,
    horizontalSafePadding: Dp,
    onUnlock: () -> Unit,
    showOpeningOverlay: Boolean,
    backdropArtwork: String?,
    logo: String?,
    title: String,
    onBackWithProgress: () -> Unit,
    p2pInitialLoadingMessage: String?,
    p2pInitialLoadingProgress: Float?,
    showP2pRebufferStats: Boolean,
    p2pRebufferMessage: String?,
    p2pRebufferProgress: Float?,
    currentGestureFeedback: GestureFeedbackState?,
    renderedGestureFeedback: GestureFeedbackState?,
    initialLoadCompleted: Boolean,
    pausedOverlayVisible: Boolean,
    activeSkipInterval: SkipInterval?,
    skipIntervalDismissed: Boolean,
    controlsVisible: Boolean,
    onSkipInterval: (SkipInterval) -> Unit,
    onDismissSkipInterval: () -> Unit,
    sliderEdgePadding: Dp,
    overlayBottomPadding: Dp,
    isSeries: Boolean,
    nextEpisodeInfo: NextEpisodeInfo?,
    showNextEpisodeCard: Boolean,
    nextEpisodeAutoPlaySearching: Boolean,
    nextEpisodeAutoPlaySourceName: String?,
    nextEpisodeAutoPlayCountdown: Int?,
    onPlayNextEpisode: () -> Unit,
    onDismissNextEpisode: () -> Unit,
    errorMessage: String?,
    onDismissError: () -> Unit,
) {
    AnimatedVisibility(
        visible = playerControlsLocked && lockedOverlayVisible,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        LockedPlayerOverlay(
            playbackSnapshot = playbackSnapshot,
            displayedPositionMs = displayedPositionMs,
            metrics = metrics,
            horizontalSafePadding = horizontalSafePadding,
            onUnlock = onUnlock,
            modifier = Modifier.fillMaxSize(),
        )
    }

    AnimatedVisibility(
        visible = showOpeningOverlay,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        OpeningOverlay(
            artwork = backdropArtwork,
            logo = logo,
            title = title,
            onBack = onBackWithProgress,
            horizontalSafePadding = horizontalSafePadding,
            modifier = Modifier.fillMaxSize(),
            message = p2pInitialLoadingMessage,
            progress = p2pInitialLoadingProgress,
        )
    }

    P2pLoadingStatus(
        visible = showP2pRebufferStats && errorMessage == null,
        message = p2pRebufferMessage,
        progress = p2pRebufferProgress,
        modifier = Modifier
            .align(Alignment.Center)
            .padding(top = 58.dp),
    )

    AnimatedVisibility(
        visible = currentGestureFeedback != null,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
        ) {
            renderedGestureFeedback?.let { feedback ->
                GestureFeedbackPill(
                    feedback = feedback,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .windowInsetsPadding(WindowInsets.safeContent.only(WindowInsetsSides.Top))
                        .padding(horizontal = horizontalSafePadding)
                        .padding(top = 40.dp),
                )
            }
        }
    }

    if (!playerControlsLocked) {
        SkipIntroButton(
            interval = if (!initialLoadCompleted || pausedOverlayVisible) null else activeSkipInterval,
            dismissed = skipIntervalDismissed,
            controlsVisible = controlsVisible,
            onSkip = {
                activeSkipInterval?.let(onSkipInterval)
            },
            onDismiss = onDismissSkipInterval,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = sliderEdgePadding, bottom = overlayBottomPadding),
        )
    }

    if (isSeries && !playerControlsLocked) {
        NextEpisodeCard(
            nextEpisode = nextEpisodeInfo,
            visible = showNextEpisodeCard,
            isAutoPlaySearching = nextEpisodeAutoPlaySearching,
            autoPlaySourceName = nextEpisodeAutoPlaySourceName,
            autoPlayCountdownSec = nextEpisodeAutoPlayCountdown,
            onPlayNext = onPlayNextEpisode,
            onDismiss = onDismissNextEpisode,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = sliderEdgePadding, bottom = overlayBottomPadding),
        )
    }

    if (errorMessage != null) {
        ErrorModal(
            message = errorMessage,
            onDismiss = onDismissError,
        )
    }
}
