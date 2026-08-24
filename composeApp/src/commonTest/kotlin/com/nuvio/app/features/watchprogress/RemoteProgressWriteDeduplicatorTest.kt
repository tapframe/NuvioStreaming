package com.nuvio.app.features.watchprogress

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RemoteProgressWriteDeduplicatorTest {
    @Test
    fun `identical progress is suppressed inside dedupe window`() {
        val deduplicator = RemoteProgressWriteDeduplicator(windowMs = 5_000L)
        val entry = progressEntry(positionMs = 30_000L, updatedAtEpochMs = 1_000L)

        assertTrue(deduplicator.shouldSend(profileId = 1, entry = entry, nowEpochMs = 1_000L))
        assertFalse(
            deduplicator.shouldSend(
                profileId = 1,
                entry = entry.copy(lastUpdatedEpochMs = 1_100L),
                nowEpochMs = 1_100L,
            ),
        )
    }

    @Test
    fun `changed progress is sent inside dedupe window`() {
        val deduplicator = RemoteProgressWriteDeduplicator(windowMs = 5_000L)
        val entry = progressEntry(positionMs = 30_000L, updatedAtEpochMs = 1_000L)

        assertTrue(deduplicator.shouldSend(profileId = 1, entry = entry, nowEpochMs = 1_000L))
        assertTrue(
            deduplicator.shouldSend(
                profileId = 1,
                entry = entry.copy(lastPositionMs = 31_000L, lastUpdatedEpochMs = 1_100L),
                nowEpochMs = 1_100L,
            ),
        )
    }

    @Test
    fun `identical progress is sent after dedupe window`() {
        val deduplicator = RemoteProgressWriteDeduplicator(windowMs = 5_000L)
        val entry = progressEntry(positionMs = 30_000L, updatedAtEpochMs = 1_000L)

        assertTrue(deduplicator.shouldSend(profileId = 1, entry = entry, nowEpochMs = 1_000L))
        assertTrue(
            deduplicator.shouldSend(
                profileId = 1,
                entry = entry.copy(lastUpdatedEpochMs = 6_000L),
                nowEpochMs = 6_000L,
            ),
        )
    }

    private fun progressEntry(
        positionMs: Long,
        updatedAtEpochMs: Long,
    ) = WatchProgressEntry(
        contentType = "series",
        parentMetaId = "tt123",
        parentMetaType = "series",
        videoId = "tt123:1:1",
        title = "Episode",
        seasonNumber = 1,
        episodeNumber = 1,
        lastPositionMs = positionMs,
        durationMs = 60_000L,
        lastUpdatedEpochMs = updatedAtEpochMs,
    )
}
