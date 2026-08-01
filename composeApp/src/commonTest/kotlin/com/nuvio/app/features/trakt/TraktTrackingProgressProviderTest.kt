package com.nuvio.app.features.trakt

import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.WatchProgressSourceTraktPlayback
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TraktTrackingProgressProviderTest {

    @Test
    fun `continue watching cutoff is provider policy`() {
        val now = 100L * MILLIS_PER_DAY

        assertEquals(
            40L * MILLIS_PER_DAY,
            TraktTrackingProgressProvider.continueWatchingCutoffEpochMs(daysCap = 60, nowEpochMs = now),
        )
        assertNull(
            TraktTrackingProgressProvider.continueWatchingCutoffEpochMs(
                daysCap = TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL,
                nowEpochMs = now,
            ),
        )
    }

    @Test
    fun `optimistic playback next up seed obeys provider threshold and freshness`() {
        val now = 1_000_000L
        val recent = entry(progressPercent = 95f, lastUpdatedEpochMs = now - 1_000L)

        assertTrue(TraktTrackingProgressProvider.shouldUseAsNextUpSeed(recent, now))
        assertFalse(
            TraktTrackingProgressProvider.shouldUseAsNextUpSeed(
                recent.copy(progressPercent = 94f),
                now,
            ),
        )
        assertFalse(
            TraktTrackingProgressProvider.shouldUseAsNextUpSeed(
                recent.copy(lastUpdatedEpochMs = now - 4L * 60L * 1_000L),
                now,
            ),
        )
    }

    private fun entry(progressPercent: Float, lastUpdatedEpochMs: Long): WatchProgressEntry =
        WatchProgressEntry(
            contentType = "series",
            parentMetaId = "show",
            parentMetaType = "series",
            videoId = "show:1:4",
            title = "Show",
            seasonNumber = 1,
            episodeNumber = 4,
            lastPositionMs = 940L,
            durationMs = 1_000L,
            lastUpdatedEpochMs = lastUpdatedEpochMs,
            progressPercent = progressPercent,
            source = WatchProgressSourceTraktPlayback,
        )

    private companion object {
        const val MILLIS_PER_DAY = 24L * 60L * 60L * 1_000L
    }
}
