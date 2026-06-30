package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DebridMagnetBuilderTest {

    private val hexHash = "0123456789abcdef0123456789abcdef01234567"

    @Test
    fun `builds well-formed magnet from torrent scheme url`() {
        val stream = stream(url = "torrent://$hexHash")
        assertEquals("magnet:?xt=urn:btih:$hexHash", DebridMagnetBuilder.fromStream(stream))
    }

    @Test
    fun `builds magnet from dedicated infoHash field`() {
        val stream = stream(infoHash = hexHash)
        assertEquals("magnet:?xt=urn:btih:$hexHash", DebridMagnetBuilder.fromStream(stream))
    }

    @Test
    fun `passes existing magnet url through unchanged`() {
        val magnet = "magnet:?xt=urn:btih:$hexHash&dn=Test"
        val stream = stream(url = magnet)
        assertEquals(magnet, DebridMagnetBuilder.fromStream(stream))
    }

    @Test
    fun `returns null for torrent-null sentinel url`() {
        val stream = stream(url = "torrent://null")
        assertNull(DebridMagnetBuilder.fromStream(stream))
    }

    @Test
    fun `returns null for plain http stream`() {
        val stream = stream(url = "https://cdn.example.com/video.mp4")
        assertNull(DebridMagnetBuilder.fromStream(stream))
    }

    private fun stream(
        url: String? = null,
        infoHash: String? = null,
    ): StreamItem = StreamItem(
        url = url,
        infoHash = infoHash,
        addonName = "TestAddon",
        addonId = "test.addon",
    )
}
