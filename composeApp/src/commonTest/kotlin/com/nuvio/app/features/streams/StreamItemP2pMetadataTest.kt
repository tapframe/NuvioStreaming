package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertEquals

class StreamItemP2pMetadataTest {
    @Test
    fun usesClientResolveP2pMetadataWhenTopLevelFieldsAreMissing() {
        val magnet = "magnet:?xt=urn:btih:ABC123&dn=Movie&tr=udp%3A%2F%2Fmagnet.test%3A80%2Fannounce"
        val stream = StreamItem(
            name = "Resolved torrent",
            addonName = "Addon",
            addonId = "addon:test",
            sources = listOf(
                "tracker:udp://base.test:80/announce",
                "dht:ABC123",
            ),
            clientResolve = StreamClientResolve(
                infoHash = "ABC123",
                fileIdx = 2,
                magnetUri = magnet,
                filename = "movie.mkv",
                sources = listOf(
                    "tracker:udp://client.test:80/announce",
                    "tracker:udp://base.test:80/announce",
                ),
            ),
        )

        assertEquals("ABC123", stream.p2pInfoHash)
        assertEquals(2, stream.p2pFileIdx)
        assertEquals("movie.mkv", stream.p2pFilename)
        assertEquals(magnet, stream.torrentMagnetUri)
        assertEquals(
            listOf(
                "udp://base.test:80/announce",
                "udp://client.test:80/announce",
            ),
            stream.p2pTrackers,
        )
    }

    @Test
    fun extractsP2pInfoHashFromClientResolveMagnet() {
        val stream = StreamItem(
            name = "Magnet-only torrent",
            addonName = "Addon",
            addonId = "addon:test",
            clientResolve = StreamClientResolve(
                magnetUri = "magnet:?xt=urn:btih:def456&dn=Movie",
            ),
        )

        assertEquals("def456", stream.p2pInfoHash)
        assertEquals("magnet:?xt=urn:btih:def456&dn=Movie", stream.torrentMagnetUri)
    }
}
