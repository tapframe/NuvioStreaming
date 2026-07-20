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
internal const val PlayerNormalVolumeCeiling = 1f
internal const val PlayerMaxVolumeBoost = 2f
internal const val PlayerVerticalGestureTouchSlopMultiplier = 3f
internal const val PlayerVerticalGestureMinHeightFraction = 0.06f
internal const val PlayerVerticalGestureDominanceRatio = 1.2f
internal const val PlayerSeekProgressSyncDebounceMs = 700L
internal const val P2pInitialByteProgressMidpoint = 5_242_880L
internal const val P2pInitialBufferTargetMs = 10_000L
internal const val P2pInitialNetworkStageWeight = 0.45f
internal const val P2pInitialDeliveryStageWeight = 0.30f
internal const val P2pInitialPlayerStageStart = 0.75f
internal const val P2pInitialLoadingMaximum = 0.95f
internal const val NEXT_EPISODE_HARD_TIMEOUT_MS = 120_000L

internal fun p2pInitialLoadingProgress(
    bufferedAheadMs: Long,
    downloadedBytes: Long,
    deliveredBytes: Long,
): Float {
    val networkProgress = saturatingProgress(downloadedBytes, P2pInitialByteProgressMidpoint) *
        P2pInitialNetworkStageWeight
    val deliveryProgress = saturatingProgress(deliveredBytes, P2pInitialByteProgressMidpoint) *
        P2pInitialDeliveryStageWeight
    val engineProgress = networkProgress + deliveryProgress
    val playerProgress = if (bufferedAheadMs > 0L) {
        P2pInitialPlayerStageStart +
            (bufferedAheadMs.toFloat() / P2pInitialBufferTargetMs.toFloat()).coerceIn(0f, 1f) *
            (P2pInitialLoadingMaximum - P2pInitialPlayerStageStart)
    } else {
        0f
    }
    return maxOf(engineProgress, playerProgress).coerceIn(0f, P2pInitialLoadingMaximum)
}

private fun saturatingProgress(value: Long, midpoint: Long): Float {
    val safeValue = value.coerceAtLeast(0L).toDouble()
    return (safeValue / (safeValue + midpoint.toDouble())).toFloat()
}

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


internal fun currentCombinedVolumeLevel(
    systemVolume: PlayerAudioLevel?,
    softwareVolume: PlayerAudioLevel?,
): PlayerAudioLevel? {
    if (systemVolume == null && softwareVolume == null) return null
    if (systemVolume == null) return softwareVolume
    if (systemVolume.fraction < PlayerNormalVolumeCeiling || softwareVolume == null) {
        return systemVolume
    }
    val boostFraction = softwareVolume.fraction.coerceIn(PlayerNormalVolumeCeiling, PlayerMaxVolumeBoost)
    return PlayerAudioLevel(
        fraction = boostFraction,
        isMuted = boostFraction <= 0.001f,
    )
}

internal fun setCombinedVolumeLevel(
    target: Float,
    systemController: PlayerGestureController?,
    engineController: PlayerEngineController?,
): PlayerAudioLevel? {
    val normalized = target.coerceIn(0f, PlayerMaxVolumeBoost)
    return if (normalized <= PlayerNormalVolumeCeiling) {
        // Normal range: change device/media volume and keep software gain neutral.
        engineController?.setPlayerVolume(PlayerNormalVolumeCeiling)
        systemController?.setVolume(normalized)
            ?: PlayerAudioLevel(
                fraction = normalized,
                isMuted = normalized <= 0.001f,
            )
    } else {
        // Boost range: keep device/media volume at maximum and apply software gain above 100%.
        val systemLevel = systemController?.setVolume(PlayerNormalVolumeCeiling)
        val boostedLevel = engineController?.setPlayerVolume(normalized)
        boostedLevel?.copy(
            fraction = normalized,
            isMuted = false,
        ) ?: systemLevel
    }
}
