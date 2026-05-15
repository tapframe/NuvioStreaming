package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamClientResolve
import com.nuvio.app.features.streams.StreamItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DirectDebridStreamFilterTest {
    @Test
    fun `keeps only cached supported debrid streams`() {
        val torbox = stream(service = DebridProviders.TORBOX_ID, cached = true)
        val uncached = stream(service = DebridProviders.TORBOX_ID, cached = false)
        val unsupported = stream(service = "other", cached = true)
        val torrent = stream(service = DebridProviders.REAL_DEBRID_ID, cached = true, type = "torrent")

        val filtered = DirectDebridStreamFilter.filterInstant(listOf(torbox, uncached, unsupported, torrent))

        assertEquals(1, filtered.size)
        assertEquals("Torbox Instant", filtered.single().addonName)
        assertEquals("debrid:torbox", filtered.single().addonId)
    }

    @Test
    fun `dedupes by hash file and filename identity`() {
        val first = stream(service = DebridProviders.REAL_DEBRID_ID, cached = true, infoHash = "ABC", fileIdx = 2)
        val duplicate = stream(service = DebridProviders.REAL_DEBRID_ID, cached = true, infoHash = "abc", fileIdx = 2)
        val otherFile = stream(service = DebridProviders.REAL_DEBRID_ID, cached = true, infoHash = "abc", fileIdx = 3)

        val filtered = DirectDebridStreamFilter.filterInstant(listOf(first, duplicate, otherFile))

        assertEquals(2, filtered.size)
    }

    @Test
    fun `direct debrid stream is not treated as unsupported torrent`() {
        val direct = stream(service = DebridProviders.TORBOX_ID, cached = true, infoHash = "hash")
        val plainTorrent = StreamItem(
            name = "Torrent",
            infoHash = "hash",
            addonName = "Addon",
            addonId = "addon",
        )

        assertTrue(direct.isDirectDebridStream)
        assertFalse(direct.isTorrentStream)
        assertTrue(plainTorrent.isTorrentStream)
    }

    private fun stream(
        service: String?,
        cached: Boolean?,
        type: String = "debrid",
        infoHash: String = "hash",
        fileIdx: Int = 1,
    ): StreamItem =
        StreamItem(
            name = "Stream",
            addonName = "Direct Debrid",
            addonId = "debrid",
            clientResolve = StreamClientResolve(
                type = type,
                service = service,
                isCached = cached,
                infoHash = infoHash,
                fileIdx = fileIdx,
                filename = "video.mkv",
            ),
        )
}

