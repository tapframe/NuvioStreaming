package com.nuvio.app.features.watching.application

import com.nuvio.app.core.time.parseZonedIsoDateTimeToEpochMs
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.watchedItemKey
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.WatchProgressSourceTraktPlayback
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WatchingStateTest {
    @Test
    fun `tv poster matches fully watched series key`() {
        val result = WatchingState.isPosterWatched(
            watchedKeys = emptySet(),
            item = MetaPreview(id = "tmdb:123", type = "tv", name = "Show"),
            fullyWatchedSeriesKeys = setOf(watchedItemKey("series", "tmdb:123")),
        )

        assertTrue(result)
    }

    @Test
    fun `film poster matches movie watched key`() {
        val result = WatchingState.isPosterWatched(
            watchedKeys = setOf(watchedItemKey("movie", "tt1234567")),
            item = MetaPreview(id = "tt1234567", type = "film", name = "Movie"),
        )

        assertTrue(result)
    }

    @Test
    fun `latest completed aggregates provider-filtered completed progress`() {
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

        assertEquals(4, result.values.single().episodeNumber)
    }

    @Test
    fun `visible continue watching drops stale resume when newer episode is completed`() {
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

        assertTrue(result.isEmpty())
    }

    @Test
    fun `latest completed normalizes compact watched timestamps before sorting`() {
        val expected = parseZonedIsoDateTimeToEpochMs("2026-04-25T10:02:00Z")

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
