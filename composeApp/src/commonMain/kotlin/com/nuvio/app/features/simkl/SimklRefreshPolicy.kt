package com.nuvio.app.features.simkl

import com.nuvio.app.features.tracking.TrackingRefreshIntent
import kotlinx.atomicfu.atomic
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal const val SIMKL_AUTOMATIC_REFRESH_INTERVAL_MINUTES = 15
internal const val SIMKL_AUTOMATIC_REFRESH_INTERVAL_MS =
    SIMKL_AUTOMATIC_REFRESH_INTERVAL_MINUTES * 60L * 1_000L
internal val simklConnectionRefreshIntent = TrackingRefreshIntent.AUTOMATIC
internal val simklProgressRefreshIntent = TrackingRefreshIntent.AUTOMATIC

internal fun shouldRunSimklRefresh(
    intent: TrackingRefreshIntent,
    lastCheckedAtEpochMs: Long?,
    nowEpochMs: Long,
    hasError: Boolean,
    automaticIntervalMs: Long = SIMKL_AUTOMATIC_REFRESH_INTERVAL_MS,
): Boolean {
    if (intent != TrackingRefreshIntent.AUTOMATIC) return true
    if (hasError || lastCheckedAtEpochMs == null) return true

    val elapsedMs = nowEpochMs - lastCheckedAtEpochMs
    return elapsedMs < 0L || elapsedMs >= automaticIntervalMs
}

internal enum class SimklRefreshGateOutcome {
    COALESCED,
    EXECUTED,
    FRESHNESS_SKIPPED,
}

/**
 * Serializes provider refreshes and coalesces callers that overlap for the same profile generation.
 *
 * Library, watched, and progress are projections of one Simkl snapshot. They may request the same
 * refresh concurrently, but only the first request should reach the network.
 */
internal class SimklRefreshGate {
    private val mutex = Mutex()
    private val completionSequence = atomic(0L)
    private var lastCompletedProfileGeneration: Long? = null

    suspend fun runIfNeeded(
        profileGeneration: Long,
        shouldRun: () -> Boolean,
        block: suspend () -> Unit,
    ): SimklRefreshGateOutcome {
        val observedSequence = completionSequence.value
        return mutex.withLock {
            if (
                completionSequence.value != observedSequence &&
                lastCompletedProfileGeneration == profileGeneration
            ) {
                return@withLock SimklRefreshGateOutcome.COALESCED
            }
            if (!shouldRun()) return@withLock SimklRefreshGateOutcome.FRESHNESS_SKIPPED

            try {
                block()
                SimklRefreshGateOutcome.EXECUTED
            } finally {
                lastCompletedProfileGeneration = profileGeneration
                completionSequence.incrementAndGet()
            }
        }
    }
}
