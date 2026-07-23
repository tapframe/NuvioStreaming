package com.nuvio.app.features.trakt

import com.nuvio.app.features.tracking.TrackingRefreshIntent
import kotlin.test.Test
import kotlin.test.assertEquals

class TraktTrackingLibraryProviderTest {
    @Test
    fun `connection events preserve forced Trakt refreshes`() {
        assertEquals(
            TrackingRefreshIntent.INVALIDATED,
            TraktTrackingLibraryProvider.connectionRefreshIntent,
        )
    }

    @Test
    fun `default toggle changes only watchlist membership`() {
        val membership = mapOf(
            "trakt:watchlist" to false,
            "trakt:list:42" to true,
        )

        val added = toggledTraktWatchlistMembership(membership, "trakt:watchlist")
        val removed = toggledTraktWatchlistMembership(added, "trakt:watchlist")

        assertEquals(true, added["trakt:watchlist"])
        assertEquals(true, added["trakt:list:42"])
        assertEquals(false, removed["trakt:watchlist"])
        assertEquals(true, removed["trakt:list:42"])
    }
}
