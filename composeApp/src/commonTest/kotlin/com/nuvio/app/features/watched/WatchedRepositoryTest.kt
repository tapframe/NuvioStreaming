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
    fun snapshot_dropsRemoteLoadedLocalMissingFromServerDespiteLegacyZeroPushWatermark() {
        val remoteLoadedLocalItem = watchedItem(id = "remote-loaded", markedAtEpochMs = 1_000L)

        val merged = mergeWatchedSnapshot(
            serverItems = emptyList(),
            localItems = listOf(remoteLoadedLocalItem),
            dirtyKeys = emptySet(),
        )

        assertTrue(merged.items.isEmpty())
        assertTrue(merged.dirtyKeys.isEmpty())
    }

    @Test
    fun snapshot_preservesGenuinePendingLocalMarkMissingFromServer() {
        val pendingLocalItem = watchedItem(id = "pending", markedAtEpochMs = 1_000L)
        val pendingKey = watchedItemKey(pendingLocalItem.type, pendingLocalItem.id)

        val merged = mergeWatchedSnapshot(
            serverItems = emptyList(),
            localItems = listOf(pendingLocalItem),
            dirtyKeys = setOf(pendingKey),
        )

        assertEquals(mapOf(pendingKey to pendingLocalItem), merged.items)
        assertEquals(setOf(pendingKey), merged.dirtyKeys)
    }

    @Test
    fun snapshot_acknowledgesOnlyDirtyKeyWithEqualOrNewerRemoteItem() {
        val acknowledgedLocal = watchedItem(id = "acknowledged", markedAtEpochMs = 1_000L)
        val stillPendingLocal = watchedItem(id = "still-pending", markedAtEpochMs = 2_000L)
        val acknowledgedRemote = acknowledgedLocal.copy(name = "server copy")
        val acknowledgedKey = watchedItemKey(acknowledgedLocal.type, acknowledgedLocal.id)
        val stillPendingKey = watchedItemKey(stillPendingLocal.type, stillPendingLocal.id)

        val merged = mergeWatchedSnapshot(
            serverItems = listOf(acknowledgedRemote),
            localItems = listOf(acknowledgedLocal, stillPendingLocal),
            dirtyKeys = setOf(acknowledgedKey, stillPendingKey),
        )

        assertEquals(acknowledgedRemote, merged.items[acknowledgedKey])
        assertEquals(stillPendingLocal, merged.items[stillPendingKey])
        assertEquals(setOf(stillPendingKey), merged.dirtyKeys)
    }

    @Test
    fun successfulPush_acknowledgesOnlyPushedDirtyKey() {
        val pushedItem = watchedItem(id = "pushed", markedAtEpochMs = 1_000L)
        val pendingItem = watchedItem(id = "pending", markedAtEpochMs = 2_000L)
        val pushedKey = watchedItemKey(pushedItem.type, pushedItem.id)
        val pendingKey = watchedItemKey(pendingItem.type, pendingItem.id)

        val remainingDirtyKeys = acknowledgeSuccessfulWatchedPush(
            currentItems = mapOf(pushedKey to pushedItem, pendingKey to pendingItem),
            dirtyKeys = setOf(pushedKey, pendingKey),
            pushedItems = listOf(pushedItem),
        )

        assertEquals(setOf(pendingKey), remainingDirtyKeys)
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
