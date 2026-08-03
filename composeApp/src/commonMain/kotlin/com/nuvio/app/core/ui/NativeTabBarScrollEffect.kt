package com.nuvio.app.core.ui

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow

/**
 * Drives the iOS 26 native tab bar's auto-hide-on-scroll behaviour.
 *
 * Deliberately kept in its own file, and wired in from [NuvioScreen] rather than from each tab
 * screen, so that syncing with upstream touches as few shared files as possible.
 */
private const val NativeTabBarScrollThresholdPx = 24

private data class NativeTabBarScrollSample(
    val firstVisibleItemIndex: Int,
    val firstVisibleItemScrollOffset: Int,
    val isScrollInProgress: Boolean,
)

@Composable
internal fun NativeTabBarScrollEffect(
    listState: LazyListState,
    enabled: Boolean = true,
) {
    val supported = isLiquidGlassNativeTabBarSupported()

    LaunchedEffect(listState, enabled, supported) {
        if (!enabled || !supported) return@LaunchedEffect

        var previousIndex = listState.firstVisibleItemIndex
        var previousOffset = listState.firstVisibleItemScrollOffset
        var accumulatedDelta = 0
        var lastGestureDirection = 0

        snapshotFlow {
            NativeTabBarScrollSample(
                firstVisibleItemIndex = listState.firstVisibleItemIndex,
                firstVisibleItemScrollOffset = listState.firstVisibleItemScrollOffset,
                isScrollInProgress = listState.isScrollInProgress,
            )
        }.collect { sample ->
            if (!sample.isScrollInProgress) {
                previousIndex = sample.firstVisibleItemIndex
                previousOffset = sample.firstVisibleItemScrollOffset
                accumulatedDelta = 0
                lastGestureDirection = 0

                if (sample.firstVisibleItemIndex == 0 && sample.firstVisibleItemScrollOffset == 0) {
                    NativeTabBridge.publishTabBarVisible(true)
                }
                return@collect
            }

            val delta = when {
                sample.firstVisibleItemIndex > previousIndex -> NativeTabBarScrollThresholdPx
                sample.firstVisibleItemIndex < previousIndex -> -NativeTabBarScrollThresholdPx
                else -> sample.firstVisibleItemScrollOffset - previousOffset
            }
            previousIndex = sample.firstVisibleItemIndex
            previousOffset = sample.firstVisibleItemScrollOffset

            if (delta == 0) return@collect
            if (
                (delta > 0 && accumulatedDelta < 0) ||
                (delta < 0 && accumulatedDelta > 0)
            ) {
                accumulatedDelta = 0
            }
            accumulatedDelta += delta

            if (kotlin.math.abs(accumulatedDelta) < NativeTabBarScrollThresholdPx) {
                return@collect
            }

            val direction = if (accumulatedDelta > 0) 1 else -1
            if (direction != lastGestureDirection) {
                // Increasing list position means the user is scrolling down.
                NativeTabBridge.publishTabBarVisible(direction < 0)
                lastGestureDirection = direction
            }
            accumulatedDelta = 0
        }
    }
}
