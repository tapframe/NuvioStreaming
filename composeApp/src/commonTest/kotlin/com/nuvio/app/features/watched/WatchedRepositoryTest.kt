package com.nuvio.app.features.watched

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.trakt.WatchProgressSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WatchedRepositoryTest {
    @Test
    fun watchedItemKey_isTypeAware() {
        assertEquals("movie:tt1:-1:-1", watchedItemKey(type = "movie", id = "tt1"))
    }

    @Test
    fun watchedItemKey_trimsValues() {
        assertEquals("series:abc:-1:-1", watchedItemKey(type = " series ", id = " abc "))
    }

    @Test
    fun watchedItemKey_includes_episode_coordinates() {
        assertEquals(
            "series:show:2:5",
            watchedItemKey(type = "series", id = "show", season = 2, episode = 5),
        )
    }

    @Test
    fun fullyWatchedSeries_ignores_specials() {
        val meta = MetaDetails(
            id = "show",
            type = "series",
            name = "Show",
            videos = listOf(
                MetaVideo(id = "special", title = "Special", season = 0, episode = 1, released = "2026-03-01"),
                MetaVideo(id = "ep1", title = "Episode 1", season = 1, episode = 1, released = "2026-03-08"),
                MetaVideo(id = "ep2", title = "Episode 2", season = 1, episode = 2, released = "2026-03-15"),
            ),
        )

        val result = meta.hasWatchedAllMainSeasonEpisodes(todayIsoDate = "2026-03-30") { episode ->
            episode.season == 1
        }

        assertTrue(result)
    }

    @Test
    fun fullyWatchedSeries_ignores_explicitly_unavailable_main_episodes() {
        val meta = MetaDetails(
            id = "show",
            type = "series",
            name = "Show",
            videos = listOf(
                MetaVideo(id = "s1e1", title = "Episode 1", season = 1, episode = 1, released = "2026-03-01"),
                MetaVideo(id = "s3e1", title = "Episode 1", season = 3, episode = 1, released = null, available = false),
            ),
        )

        assertEquals(
            listOf("s1e1"),
            meta.releasedMainSeasonEpisodes(todayIsoDate = "2026-07-05").map(MetaVideo::id),
        )

        val result = meta.hasWatchedAllMainSeasonEpisodes(todayIsoDate = "2026-07-05") { episode ->
            episode.id == "s1e1"
        }

        assertTrue(result)
    }

    @Test
    fun mergeWatchedItemsPreservingUnsynced_keeps_local_items_marked_after_last_push() {
        val serverItem = WatchedItem(
            id = "show",
            type = "series",
            name = "Episode 1",
            season = 1,
            episode = 1,
            markedAtEpochMs = 1_000L,
        )
        val unsyncedLocalItem = WatchedItem(
            id = "show",
            type = "series",
            name = "Episode 2",
            season = 1,
            episode = 2,
            markedAtEpochMs = 3_000L,
        )

        val merged = mergeWatchedItemsPreservingUnsynced(
            serverItems = listOf(serverItem),
            localItems = listOf(serverItem, unsyncedLocalItem),
            lastSuccessfulPushEpochMs = 2_000L,
            pullStartedEpochMs = 4_000L,
        )

        assertEquals(
            setOf("series:show:1:1", "series:show:1:2"),
            merged.keys,
        )
    }

    @Test
    fun mergeWatchedItemsPreservingUnsynced_drops_old_local_items_missing_from_server() {
        val oldLocalItem = WatchedItem(
            id = "show",
            type = "series",
            name = "Episode 1",
            season = 1,
            episode = 1,
            markedAtEpochMs = 1_000L,
        )

        val merged = mergeWatchedItemsPreservingUnsynced(
            serverItems = emptyList(),
            localItems = listOf(oldLocalItem),
            lastSuccessfulPushEpochMs = 2_000L,
            pullStartedEpochMs = 4_000L,
        )

        assertTrue(merged.isEmpty())
    }

    @Test
    fun mergeWatchedItemsPreservingUnsynced_keeps_local_only_item_before_first_push() {
        val localOnlyItem = watchedItem(id = "local-only", markedAtEpochMs = 1_000L)

        val merged = mergeWatchedItemsPreservingUnsynced(
            serverItems = emptyList(),
            localItems = listOf(localOnlyItem),
            lastSuccessfulPushEpochMs = 0L,
            pullStartedEpochMs = 2_000L,
        )

        assertEquals(listOf(localOnlyItem), merged.values.toList())
    }

    @Test
    fun traktSnapshot_drops_old_transient_items_missingFromRemote() {
        val oldTraktItem = watchedItem(id = "old-trakt", markedAtEpochMs = 1_000L)

        val merged = mergeWatchedItemsPreservingUnsynced(
            serverItems = emptyList(),
            localItems = listOf(oldTraktItem),
            lastSuccessfulPushEpochMs = 0L,
            pullStartedEpochMs = 2_000L,
            preserveWhenNoSuccessfulPush = false,
        )

        assertTrue(merged.isEmpty())
    }

    @Test
    fun playbackCompletionWatchedMarks_doNotMirrorToTraktHistory() {
        assertFalse(
            shouldMirrorWatchedMarkToTraktHistory(
                sync = WatchedTraktHistorySync.Skip,
                isTraktAuthenticated = true,
            ),
        )
        assertTrue(
            shouldMirrorWatchedMarkToTraktHistory(
                sync = WatchedTraktHistorySync.Mirror,
                isTraktAuthenticated = true,
            ),
        )
        assertFalse(
            shouldMirrorWatchedMarkToTraktHistory(
                sync = WatchedTraktHistorySync.Mirror,
                isTraktAuthenticated = false,
            ),
        )
    }

    @Test
    fun watchedItemsForSource_keepsNuvioAndTraktSnapshotsIsolated() {
        val nuvioItem = watchedItem(id = "nuvio", markedAtEpochMs = 1_000L)
        val traktItem = watchedItem(id = "trakt", markedAtEpochMs = 2_000L)

        assertEquals(
            listOf(nuvioItem),
            watchedItemsForSource(
                source = WatchProgressSource.NUVIO_SYNC,
                nuvioItems = listOf(nuvioItem),
                traktItems = listOf(traktItem),
            ),
        )
        assertEquals(
            listOf(traktItem),
            watchedItemsForSource(
                source = WatchProgressSource.TRAKT,
                nuvioItems = listOf(nuvioItem),
                traktItems = listOf(traktItem),
            ),
        )
    }

    @Test
    fun onlyNuvioWatchedStateIsPersisted() {
        assertTrue(shouldPersistWatchedSource(WatchProgressSource.NUVIO_SYNC))
        assertFalse(shouldPersistWatchedSource(WatchProgressSource.TRAKT))
    }

    @Test
    fun replacingTraktSnapshot_doesNotOverwriteNuvioSnapshot() {
        val nuvioItem = watchedItem(id = "nuvio", markedAtEpochMs = 1_000L)
        val previousTraktItem = watchedItem(id = "old-trakt", markedAtEpochMs = 2_000L)
        val refreshedTraktItem = watchedItem(id = "new-trakt", markedAtEpochMs = 3_000L)
        val nuvioItems = mutableMapOf("nuvio" to nuvioItem)
        val traktItems = mutableMapOf("old-trakt" to previousTraktItem)

        replaceWatchedItemsForSource(
            source = WatchProgressSource.TRAKT,
            nuvioItems = nuvioItems,
            traktItems = traktItems,
            replacement = mapOf("new-trakt" to refreshedTraktItem),
        )

        assertEquals(mapOf("nuvio" to nuvioItem), nuvioItems)
        assertEquals(mapOf("new-trakt" to refreshedTraktItem), traktItems)
    }

    @Test
    fun effectiveWatchedSource_fallsBackToNuvioWhenTraktIsUnavailable() {
        assertEquals(
            WatchProgressSource.NUVIO_SYNC,
            effectiveWatchedSource(
                requestedSource = WatchProgressSource.TRAKT,
                isTraktAuthenticated = false,
            ),
        )
        assertEquals(
            WatchProgressSource.TRAKT,
            effectiveWatchedSource(
                requestedSource = WatchProgressSource.TRAKT,
                isTraktAuthenticated = true,
            ),
        )
    }

    @Test
    fun sourceOperationGuard_rejectsResultFromSourceActiveBeforeSwitch() {
        val traktOperation = WatchedSourceOperation(
            source = WatchProgressSource.TRAKT,
            generation = 4L,
        )

        assertTrue(
            isWatchedSourceOperationCurrent(
                operation = traktOperation,
                activeSource = WatchProgressSource.TRAKT,
                activeGeneration = 4L,
            ),
        )
        assertFalse(
            isWatchedSourceOperationCurrent(
                operation = traktOperation,
                activeSource = WatchProgressSource.NUVIO_SYNC,
                activeGeneration = 5L,
            ),
        )
    }

    @Test
    fun sourceOperationGuard_rejectsOlderRefreshAfterSwitchingAwayAndBack() {
        val firstTraktOperation = WatchedSourceOperation(
            source = WatchProgressSource.TRAKT,
            generation = 7L,
        )

        assertFalse(
            isWatchedSourceOperationCurrent(
                operation = firstTraktOperation,
                activeSource = WatchProgressSource.TRAKT,
                activeGeneration = 9L,
            ),
        )
    }

    private fun watchedItem(
        id: String,
        markedAtEpochMs: Long,
    ): WatchedItem = WatchedItem(
        id = id,
        type = "movie",
        name = id,
        markedAtEpochMs = markedAtEpochMs,
    )
}
