package com.nuvio.app.features.p2p

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class P2pMagnetTest {
    @Test
    fun v1HashAndTrackersAreCanonicalEncodedAndDeduplicated() {
        val hash = "ABCDEF0123456789ABCDEF0123456789ABCDEF01"
        val tracker = "udp://tracker.example:80/announce?key=hello world"
        val magnet = buildP2pMagnetUri(hash, listOf("", tracker, " ", tracker))

        assertTrue(magnet.startsWith("magnet:?xt=urn:btih:${hash.lowercase()}"))
        assertEquals(1, magnet.windowed("&tr=".length).count { it == "&tr=" })
        assertTrue(magnet.endsWith("udp%3A%2F%2Ftracker.example%3A80%2Fannounce%3Fkey%3Dhello%20world"))
    }

    @Test
    fun v2HashUsesMultihashTopic() {
        val hash = "a".repeat(64)
        assertTrue(buildP2pMagnetUri(hash, emptyList()).contains("xt=urn:btmh:1220$hash"))
    }

    @Test
    fun invalidHashIsRejectedBeforeNativeWork() {
        assertFailsWith<IllegalArgumentException> {
            buildP2pMagnetUri("not-a-hash", emptyList())
        }
    }
}
