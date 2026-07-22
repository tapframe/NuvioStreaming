package com.nuvio.app.features.simkl

import com.nuvio.app.features.tracking.TrackingRefreshIntent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SimklRefreshPolicyTest {
    @Test
    fun `progress refresh keeps provider policy unless the source changes`() {
        assertEquals(
            TrackingRefreshIntent.AUTOMATIC,
            simklProgressRefreshIntent(sourceChanged = false),
        )
        assertEquals(
            TrackingRefreshIntent.INVALIDATED,
            simklProgressRefreshIntent(sourceChanged = true),
        )
    }

    @Test
    fun `automatic refresh is throttled for fifteen minutes`() {
        val lastCheckedAt = 1_000L

        assertEquals(15, SIMKL_AUTOMATIC_REFRESH_INTERVAL_MINUTES)
        assertFalse(
            shouldRunSimklRefresh(
                intent = TrackingRefreshIntent.AUTOMATIC,
                lastCheckedAtEpochMs = lastCheckedAt,
                nowEpochMs = lastCheckedAt + SIMKL_AUTOMATIC_REFRESH_INTERVAL_MS - 1L,
                hasError = false,
            ),
        )
        assertTrue(
            shouldRunSimklRefresh(
                intent = TrackingRefreshIntent.AUTOMATIC,
                lastCheckedAtEpochMs = lastCheckedAt,
                nowEpochMs = lastCheckedAt + SIMKL_AUTOMATIC_REFRESH_INTERVAL_MS,
                hasError = false,
            ),
        )
    }

    @Test
    fun `missing stale or failed snapshots refresh automatically`() {
        assertTrue(
            shouldRunSimklRefresh(
                intent = TrackingRefreshIntent.AUTOMATIC,
                lastCheckedAtEpochMs = null,
                nowEpochMs = 1_000L,
                hasError = false,
            ),
        )
        assertTrue(
            shouldRunSimklRefresh(
                intent = TrackingRefreshIntent.AUTOMATIC,
                lastCheckedAtEpochMs = 1_000L,
                nowEpochMs = 1_001L,
                hasError = true,
            ),
        )
        assertTrue(
            shouldRunSimklRefresh(
                intent = TrackingRefreshIntent.AUTOMATIC,
                lastCheckedAtEpochMs = 2_000L,
                nowEpochMs = 1_000L,
                hasError = false,
            ),
        )
    }

    @Test
    fun `manual and invalidated refreshes bypass automatic freshness`() {
        TrackingRefreshIntent.entries
            .filterNot { intent -> intent == TrackingRefreshIntent.AUTOMATIC }
            .forEach { intent ->
                assertTrue(
                    shouldRunSimklRefresh(
                        intent = intent,
                        lastCheckedAtEpochMs = 1_000L,
                        nowEpochMs = 1_001L,
                        hasError = false,
                    ),
                )
            }
    }

    @Test
    fun `overlapping refreshes for one profile generation are coalesced`() = runBlocking {
        val gate = SimklRefreshGate()
        val firstEntered = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val secondStarted = CompletableDeferred<Unit>()
        var executions = 0

        val first = async {
            gate.runIfNeeded(profileGeneration = 7L, shouldRun = { true }) {
                executions += 1
                firstEntered.complete(Unit)
                releaseFirst.await()
            }
        }
        firstEntered.await()
        val second = async {
            secondStarted.complete(Unit)
            gate.runIfNeeded(profileGeneration = 7L, shouldRun = { true }) {
                executions += 1
            }
        }
        secondStarted.await()
        releaseFirst.complete(Unit)

        first.await()
        second.await()
        assertEquals(1, executions)
    }

    @Test
    fun `a new profile generation is not coalesced with an old profile refresh`() = runBlocking {
        val gate = SimklRefreshGate()
        val firstEntered = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val secondStarted = CompletableDeferred<Unit>()
        val executedGenerations = mutableListOf<Long>()

        val first = async {
            gate.runIfNeeded(profileGeneration = 1L, shouldRun = { true }) {
                executedGenerations += 1L
                firstEntered.complete(Unit)
                releaseFirst.await()
            }
        }
        firstEntered.await()
        val second = async {
            secondStarted.complete(Unit)
            gate.runIfNeeded(profileGeneration = 2L, shouldRun = { true }) {
                executedGenerations += 2L
            }
        }
        secondStarted.await()
        releaseFirst.complete(Unit)

        first.await()
        second.await()
        assertEquals(listOf(1L, 2L), executedGenerations)
    }
}
