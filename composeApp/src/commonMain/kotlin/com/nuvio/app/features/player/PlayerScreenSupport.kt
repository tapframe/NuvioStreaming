package com.nuvio.app.features.player

import androidx.compose.ui.unit.dp
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.streams.StreamItem

internal const val PlaybackProgressPersistIntervalMs = 60_000L
internal const val PlayerDoubleTapSeekStepMs = 10_000L
internal const val PlayerDoubleTapSeekResetDelayMs = 800L
internal const val PlayerLockedOverlayDurationMs = 2_000L
internal const val PlayerLeftGestureBoundary = 0.4f
internal const val PlayerRightGestureBoundary = 0.6f
internal const val PlayerVerticalGestureSensitivity = 0.65f
internal const val PlayerVerticalGestureTouchSlopMultiplier = 3f
internal const val PlayerVerticalGestureMinHeightFraction = 0.06f
internal const val PlayerVerticalGestureDominanceRatio = 1.2f
internal const val PlayerSeekProgressSyncDebounceMs = 700L
internal const val P2pInitialPreloadTargetBytes = 5_242_880L
internal const val NEXT_EPISODE_HARD_TIMEOUT_MS = 120_000L

internal val PlayerSideGestureSystemEdgeExclusion = 72.dp
internal val PlayerSliderOverlayGap = 12.dp
internal val PlayerTimeRowHeight = 36.dp
internal val PlayerActionRowHeight = 50.dp

internal fun sliderOverlayBottomPadding(metrics: PlayerLayoutMetrics) =
    metrics.sliderBottomOffset +
        metrics.sliderTouchHeight +
        PlayerTimeRowHeight +
        PlayerActionRowHeight +
        PlayerSliderOverlayGap

internal enum class PlayerSideGesture {
    Brightness,
    Volume,
}

internal enum class PlayerSeekDirection {
    Backward,
    Forward,
}

internal enum class PlayerGestureMode {
    HorizontalSeek,
    Brightness,
    Volume,
}

internal data class PlayerAccumulatedSeekState(
    val direction: PlayerSeekDirection,
    val baselinePositionMs: Long,
    val amountMs: Long,
)

internal data class PendingPlayerP2pSwitch(
    val stream: StreamItem,
    val episode: MetaVideo?,
    val isAutoPlay: Boolean,
)
