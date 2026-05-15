package com.nuvio.app.features.watching.application

import com.nuvio.app.features.trakt.TraktPlatformClock
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.WatchProgressSourceTraktPlayback
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WatchingStateTest {
    @Test
    fun `latest completed ignores Trakt playback below next up seed threshold`() {
        val almostCompletePlayback = entry(
            videoId = "show:1:4",
            seasonNumber = 1,
            episodeNumber = 4,
            progressPercent = 94f,
            source = WatchProgressSourceTraktPlayback,
        )

        val result = WatchingState.latestCompletedBySeries(
            progressEntries = listOf(almostCompletePlayback),
            watchedItems = emptyList(),
        )

        assertTrue(result.isEmpty())
    }

    @Test
    fun `visible continue watching keeps active resume when newer episode is completed`() {
        val resume = entry(
            videoId = "show:1:4",
            seasonNumber = 1,
            episodeNumber = 4,
            lastUpdatedEpochMs = 10L,
        )
        val completed = entry(
            videoId = "show:1:5",
            seasonNumber = 1,
            episodeNumber = 5,
            lastUpdatedEpochMs = 20L,
            isCompleted = true,
        )
        val latestCompleted = WatchingState.latestCompletedBySeries(
            progressEntries = listOf(resume, completed),
            watchedItems = emptyList(),
        )

        val result = WatchingState.visibleContinueWatchingEntries(
            progressEntries = listOf(resume, completed),
            latestCompletedBySeries = latestCompleted,
        )

        assertEquals(listOf("show:1:4"), result.map { it.videoId })
    }

    @Test
    fun `latest completed normalizes compact watched timestamps before sorting`() {
        val expected = TraktPlatformClock.parseIsoDateTimeToEpochMs("2026-04-25T10:02:00Z")

        val result = WatchingState.latestCompletedBySeries(
            progressEntries = emptyList(),
            watchedItems = listOf(
                WatchedItem(
                    id = "show",
                    type = "series",
                    name = "Show",
                    season = 3,
                    episode = 1,
                    markedAtEpochMs = 20260425100200L,
                ),
            ),
            preferFurthestEpisode = false,
        )

        assertEquals(expected, result.values.single().markedAtEpochMs)
    }

    private fun entry(
        videoId: String,
        seasonNumber: Int?,
        episodeNumber: Int?,
        lastUpdatedEpochMs: Long = 1L,
        isCompleted: Boolean = false,
        progressPercent: Float? = null,
        source: String = "local",
    ): WatchProgressEntry =
        WatchProgressEntry(
            contentType = "series",
            parentMetaId = "show",
            parentMetaType = "series",
            videoId = videoId,
            title = "Show",
            seasonNumber = seasonNumber,
            episodeNumber = episodeNumber,
            lastPositionMs = 120_000L,
            durationMs = 1_000_000L,
            lastUpdatedEpochMs = lastUpdatedEpochMs,
            isCompleted = isCompleted,
            progressPercent = progressPercent,
            source = source,
        )
}
