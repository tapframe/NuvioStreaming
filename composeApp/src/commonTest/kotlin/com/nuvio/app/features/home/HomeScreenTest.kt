package com.nuvio.app.features.home

import com.nuvio.app.features.watchprogress.ContinueWatchingItem
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.trakt.TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL
import kotlin.test.Test
import kotlin.test.assertEquals

class HomeScreenTest {

    @Test
    fun `build home continue watching items removes duplicate video ids`() {
        val inProgress = progressEntry(
            videoId = "tt0944947:1:4",
            title = "Game of Thrones",
            episodeTitle = "Cripples, Bastards, and Broken Things",
            lastUpdatedEpochMs = 250L,
        )
        val nextUp = continueWatchingItem(
            videoId = "tt0944947:1:4",
            subtitle = "Up Next • S1E4 • Cripples, Bastards, and Broken Things",
        )
        val movie = progressEntry(
            videoId = "movie-1",
            title = "Movie",
            lastUpdatedEpochMs = 100L,
            seasonNumber = null,
            episodeNumber = null,
            episodeTitle = null,
        )

        val result = buildHomeContinueWatchingItems(
            visibleEntries = listOf(inProgress, movie),
            nextUpItemsBySeries = mapOf("tt0944947" to (200L to nextUp)),
        )

        assertEquals(listOf("tt0944947:1:4", "movie-1"), result.map(ContinueWatchingItem::videoId))
        assertEquals("S1E4 • Cripples, Bastards, and Broken Things", result.first().subtitle)
    }

    @Test
    fun `build home continue watching items prefers progress entry on timestamp tie`() {
        val inProgress = progressEntry(
            videoId = "show:1:5",
            title = "Show",
            episodeNumber = 5,
            episodeTitle = "The Wolf and the Lion",
            lastUpdatedEpochMs = 500L,
        )
        val nextUp = continueWatchingItem(
            videoId = "show:1:5",
            subtitle = "Up Next • S1E5 • The Wolf and the Lion",
        )

        val result = buildHomeContinueWatchingItems(
            visibleEntries = listOf(inProgress),
            nextUpItemsBySeries = mapOf("show" to (500L to nextUp)),
        )

        assertEquals(1, result.size)
        assertEquals("S1E5 • The Wolf and the Lion", result.single().subtitle)
    }

    @Test
    fun `build home continue watching items suppresses next up when series has in progress resume`() {
        val inProgress = progressEntry(
            videoId = "show:1:4",
            title = "Show",
            episodeNumber = 4,
            episodeTitle = "Current",
            lastUpdatedEpochMs = 200L,
        )
        val nextUp = continueWatchingItem(
            videoId = "show:1:5",
            subtitle = "Up Next • S1E5 • Next",
        )

        val result = buildHomeContinueWatchingItems(
            visibleEntries = listOf(inProgress),
            nextUpItemsBySeries = mapOf("show" to (500L to nextUp)),
        )

        assertEquals(listOf("show:1:4"), result.map(ContinueWatchingItem::videoId))
        assertEquals("S1E4 • Current", result.single().subtitle)
    }

    @Test
    fun `Trakt continue watching window filters old progress only when Trakt source is active`() {
        val oldEntry = progressEntry(
            videoId = "old",
            title = "Old",
            lastUpdatedEpochMs = 1_000L,
            seasonNumber = null,
            episodeNumber = null,
        )
        val recentEntry = progressEntry(
            videoId = "recent",
            title = "Recent",
            lastUpdatedEpochMs = 30L * MILLIS_PER_DAY,
            seasonNumber = null,
            episodeNumber = null,
        )
        val entries = listOf(oldEntry, recentEntry)

        val filtered = filterEntriesForTraktContinueWatchingWindow(
            entries = entries,
            isTraktProgressActive = true,
            daysCap = 60,
            nowEpochMs = 90L * MILLIS_PER_DAY,
        )
        val nuvioSource = filterEntriesForTraktContinueWatchingWindow(
            entries = entries,
            isTraktProgressActive = false,
            daysCap = 60,
            nowEpochMs = 90L * MILLIS_PER_DAY,
        )

        assertEquals(listOf("recent"), filtered.map(WatchProgressEntry::videoId))
        assertEquals(listOf("old", "recent"), nuvioSource.map(WatchProgressEntry::videoId))
    }

    @Test
    fun `Trakt all history window keeps old progress`() {
        val oldEntry = progressEntry(
            videoId = "old",
            title = "Old",
            lastUpdatedEpochMs = 1_000L,
            seasonNumber = null,
            episodeNumber = null,
        )
        val recentEntry = progressEntry(
            videoId = "recent",
            title = "Recent",
            lastUpdatedEpochMs = 30L * MILLIS_PER_DAY,
            seasonNumber = null,
            episodeNumber = null,
        )

        val result = filterEntriesForTraktContinueWatchingWindow(
            entries = listOf(oldEntry, recentEntry),
            isTraktProgressActive = true,
            daysCap = TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL,
            nowEpochMs = 90L * MILLIS_PER_DAY,
        )

        assertEquals(listOf("old", "recent"), result.map(WatchProgressEntry::videoId))
    }

    private fun progressEntry(
        videoId: String,
        title: String,
        lastUpdatedEpochMs: Long,
        seasonNumber: Int? = 1,
        episodeNumber: Int? = 4,
        episodeTitle: String? = "Episode",
    ): WatchProgressEntry =
        WatchProgressEntry(
            contentType = if (seasonNumber != null && episodeNumber != null) "series" else "movie",
            parentMetaId = videoId.substringBefore(':'),
            parentMetaType = if (seasonNumber != null && episodeNumber != null) "series" else "movie",
            videoId = videoId,
            title = title,
            seasonNumber = seasonNumber,
            episodeNumber = episodeNumber,
            episodeTitle = episodeTitle,
            lastPositionMs = if (seasonNumber != null && episodeNumber != null) 120_000L else 60_000L,
            durationMs = 1_000_000L,
            lastUpdatedEpochMs = lastUpdatedEpochMs,
        )

    private fun continueWatchingItem(
        videoId: String,
        subtitle: String,
    ): ContinueWatchingItem =
        ContinueWatchingItem(
            parentMetaId = videoId.substringBefore(':'),
            parentMetaType = "series",
            videoId = videoId,
            title = "Show",
            subtitle = subtitle,
            imageUrl = null,
            seasonNumber = 1,
            episodeNumber = 4,
            episodeTitle = subtitle.substringAfterLast(" • ", "Episode"),
            resumePositionMs = 0L,
            durationMs = 0L,
            progressFraction = 0f,
        )

    private companion object {
        const val MILLIS_PER_DAY = 24L * 60L * 60L * 1000L
    }
}
