package com.nuvio.app.features.watched

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.WatchProgressSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WatchedRepositoryTest {
    @Test
    fun emptyProviderExtraKeys_doNotTriggerInitialRefresh() {
        assertFalse(extraWatchedKeysChanged(previous = null, current = emptySet()))
    }

    @Test
    fun populatedProviderExtraKeys_triggerRefreshFromEmptyState() {
        assertTrue(extraWatchedKeysChanged(previous = null, current = setOf("series:tt1:-1:-1")))
    }

    @Test
    fun changedProviderExtraKeys_triggerRefresh() {
        assertTrue(
            extraWatchedKeysChanged(
                previous = setOf("series:tt1:-1:-1"),
                current = setOf("series:tt2:-1:-1"),
            ),
        )
    }

    @Test
    fun providerRefreshFailure_isContainedWithoutReplacingState() = runBlocking {
        val failure = IllegalStateException("rate limited")
        var observedFailure: Throwable? = null

        val result = watchedProviderRefreshOrNull(
            refresh = { throw failure },
            onFailure = { observedFailure = it },
        )

        assertNull(result)
        assertEquals(failure, observedFailure)
    }

    @Test
    fun providerRefreshCancellation_isNotContained() = runBlocking {
        assertFailsWith<CancellationException> {
            watchedProviderRefreshOrNull(
                refresh = { throw CancellationException("cancelled") },
                onFailure = {},
            )
        }
        Unit
    }

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
    fun successfulTrackerPush_doesNotAcknowledgeFailedNuvioPush() {
        val outcome = WatchedPushOutcome(
            nuvioSyncSucceeded = false,
            succeededTrackerProviderIds = setOf(TrackingProviderId.TRAKT),
        )

        assertFalse(
            shouldAcknowledgeNuvioWatchedPush(
                source = WatchProgressSource.NUVIO_SYNC,
                outcome = outcome,
            ),
        )
    }

    @Test
    fun successfulNuvioPush_acknowledgesNuvioDirtyState() {
        val outcome = WatchedPushOutcome(nuvioSyncSucceeded = true)

        assertTrue(
            shouldAcknowledgeNuvioWatchedPush(
                source = WatchProgressSource.NUVIO_SYNC,
                outcome = outcome,
            ),
        )
    }

    @Test
    fun playbackCompletionWatchedMarks_doNotMirrorToTrackerHistory() {
        assertFalse(
            shouldMirrorWatchedMarkToTrackers(
                sync = WatchedTrackerHistorySync.Skip,
                hasConnectedTracker = true,
            ),
        )
        assertTrue(
            shouldMirrorWatchedMarkToTrackers(
                sync = WatchedTrackerHistorySync.Mirror,
                hasConnectedTracker = true,
            ),
        )
        assertFalse(
            shouldMirrorWatchedMarkToTrackers(
                sync = WatchedTrackerHistorySync.Mirror,
                hasConnectedTracker = false,
            ),
        )
    }

    @Test
    fun watchedItemsForSource_keepsProviderSnapshotsIsolated() {
        val nuvioItem = watchedItem(id = "nuvio", markedAtEpochMs = 1_000L)
        val traktItem = watchedItem(id = "trakt", markedAtEpochMs = 2_000L)
        val simklItem = watchedItem(id = "simkl", markedAtEpochMs = 3_000L)

        assertEquals(
            listOf(nuvioItem),
            watchedItemsForSource(
                source = WatchProgressSource.NUVIO_SYNC,
                nuvioItems = listOf(nuvioItem),
                providerItems = mapOf(
                    TrackingProviderId.TRAKT to listOf(traktItem),
                    TrackingProviderId.SIMKL to listOf(simklItem),
                ),
            ),
        )
        assertEquals(
            listOf(traktItem),
            watchedItemsForSource(
                source = WatchProgressSource.TRAKT,
                nuvioItems = listOf(nuvioItem),
                providerItems = mapOf(
                    TrackingProviderId.TRAKT to listOf(traktItem),
                    TrackingProviderId.SIMKL to listOf(simklItem),
                ),
            ),
        )
        assertEquals(
            listOf(simklItem),
            watchedItemsForSource(
                source = WatchProgressSource.SIMKL,
                nuvioItems = listOf(nuvioItem),
                providerItems = mapOf(
                    TrackingProviderId.TRAKT to listOf(traktItem),
                    TrackingProviderId.SIMKL to listOf(simklItem),
                ),
            ),
        )
    }

    @Test
    fun onlyNuvioWatchedStateIsPersisted() {
        assertTrue(shouldPersistWatchedSource(WatchProgressSource.NUVIO_SYNC))
        assertFalse(shouldPersistWatchedSource(WatchProgressSource.TRAKT))
        assertFalse(shouldPersistWatchedSource(WatchProgressSource.SIMKL))
    }

    @Test
    fun replacingTraktSnapshot_doesNotOverwriteNuvioSnapshot() {
        val nuvioItem = watchedItem(id = "nuvio", markedAtEpochMs = 1_000L)
        val previousTraktItem = watchedItem(id = "old-trakt", markedAtEpochMs = 2_000L)
        val refreshedTraktItem = watchedItem(id = "new-trakt", markedAtEpochMs = 3_000L)
        val nuvioItems = mutableMapOf("nuvio" to nuvioItem)
        val providerItems = mutableMapOf(
            TrackingProviderId.TRAKT to mutableMapOf("old-trakt" to previousTraktItem),
        )

        replaceWatchedItemsForSource(
            source = WatchProgressSource.TRAKT,
            nuvioItems = nuvioItems,
            providerItems = providerItems,
            replacement = mapOf("new-trakt" to refreshedTraktItem),
        )

        assertEquals(mapOf("nuvio" to nuvioItem), nuvioItems)
        assertEquals(
            mapOf("new-trakt" to refreshedTraktItem),
            providerItems[TrackingProviderId.TRAKT].orEmpty(),
        )
    }

    @Test
    fun effectiveWatchedSource_fallsBackToNuvioWhenTraktIsUnavailable() {
        assertEquals(
            WatchProgressSource.NUVIO_SYNC,
            effectiveWatchedSource(
                requestedSource = WatchProgressSource.TRAKT,
                connectedProviderIds = emptySet(),
            ),
        )
        assertEquals(
            WatchProgressSource.TRAKT,
            effectiveWatchedSource(
                requestedSource = WatchProgressSource.TRAKT,
                connectedProviderIds = setOf(TrackingProviderId.TRAKT),
            ),
        )
    }

    @Test
    fun effectiveWatchedSource_selectsConnectedSimkl() {
        assertEquals(
            WatchProgressSource.SIMKL,
            effectiveWatchedSource(
                requestedSource = WatchProgressSource.SIMKL,
                connectedProviderIds = setOf(TrackingProviderId.SIMKL),
            ),
        )
        assertEquals(
            WatchProgressSource.NUVIO_SYNC,
            effectiveWatchedSource(
                requestedSource = WatchProgressSource.SIMKL,
                connectedProviderIds = emptySet(),
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
