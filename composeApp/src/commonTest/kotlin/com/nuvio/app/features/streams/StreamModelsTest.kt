package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StreamModelsTest {

    private val hexHash = "0123456789abcdef0123456789abcdef01234567"
    private val base32Hash = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    // -----------------------------------------------------------------------
    // isTorrentStream
    // -----------------------------------------------------------------------

    @Test
    fun `torrent scheme url in url field is detected as torrent stream`() {
        val stream = stream(url = "torrent://$hexHash")
        assertTrue(stream.isTorrentStream)
    }

    @Test
    fun `torrent scheme url with fileIdx path is detected as torrent stream`() {
        val stream = stream(url = "torrent://$hexHash/0")
        assertTrue(stream.isTorrentStream)
    }

    @Test
    fun `torrent scheme url is detected case-insensitively`() {
        val stream = stream(url = "TORRENT://$hexHash")
        assertTrue(stream.isTorrentStream)
    }

    @Test
    fun `torrent scheme url in externalUrl is detected as torrent stream`() {
        val stream = stream(externalUrl = "torrent://$hexHash")
        assertTrue(stream.isTorrentStream)
    }

    @Test
    fun `torrent scheme url with leading whitespace is detected as torrent stream`() {
        val stream = stream(url = "  torrent://$hexHash")
        assertTrue(stream.isTorrentStream)
        assertNull(stream.playableDirectUrl)
    }

    @Test
    fun `magnet url with leading whitespace is detected as torrent stream`() {
        val stream = stream(url = "\nmagnet:?xt=urn:btih:$hexHash")
        assertTrue(stream.isTorrentStream)
        assertNull(stream.playableDirectUrl)
    }

    @Test
    fun `torrent url sentinel torrent-null-string is still detected as torrent scheme`() {
        val stream = stream(url = "torrent://null")
        assertTrue(stream.isTorrentStream)
    }

    @Test
    fun `plain http url is not a torrent stream`() {
        val stream = stream(url = "https://cdn.example.com/video.mp4")
        assertFalse(stream.isTorrentStream)
    }

    @Test
    fun `plain http url with torrent in path is not a torrent stream`() {
        val stream = stream(url = "https://cdn.example.com/torrent/download.mp4")
        assertFalse(stream.isTorrentStream)
    }

    // -----------------------------------------------------------------------
    // playableDirectUrl — torrent:// and magnet: are never surfaced
    // -----------------------------------------------------------------------

    @Test
    fun `torrent scheme url yields null playableDirectUrl`() {
        val stream = stream(url = "torrent://$hexHash")
        assertNull(stream.playableDirectUrl)
    }

    @Test
    fun `torrent scheme url in externalUrl yields null playableDirectUrl`() {
        val stream = stream(externalUrl = "torrent://$hexHash")
        assertNull(stream.playableDirectUrl)
    }

    @Test
    fun `magnet url yields null playableDirectUrl`() {
        val stream = stream(url = "magnet:?xt=urn:btih:$hexHash")
        assertNull(stream.playableDirectUrl)
    }

    @Test
    fun `plain http url is surfaced as playableDirectUrl`() {
        val url = "https://cdn.example.com/video.mp4"
        val stream = stream(url = url)
        assertEquals(url, stream.playableDirectUrl)
    }

    @Test
    fun `torrent url falls through to http externalUrl`() {
        val httpUrl = "https://cdn.example.com/video.mp4"
        val stream = stream(
            url = "torrent://$hexHash",
            externalUrl = httpUrl,
        )
        assertEquals(httpUrl, stream.playableDirectUrl)
    }

    // -----------------------------------------------------------------------
    // p2pInfoHash extraction
    // -----------------------------------------------------------------------

    @Test
    fun `p2pInfoHash extracts hex hash from torrent scheme url`() {
        val stream = stream(url = "torrent://$hexHash")
        assertEquals(hexHash, stream.p2pInfoHash)
    }

    @Test
    fun `p2pInfoHash extracts base32 hash from torrent scheme url`() {
        val stream = stream(url = "torrent://$base32Hash")
        assertEquals(base32Hash, stream.p2pInfoHash)
    }

    @Test
    fun `p2pInfoHash extracts uppercase hex hash from uppercase scheme`() {
        val upperHash = hexHash.uppercase()
        val stream = stream(url = "TORRENT://$upperHash")
        assertEquals(upperHash, stream.p2pInfoHash)
    }

    @Test
    fun `p2pInfoHash stops at fileIdx path segment`() {
        val stream = stream(url = "torrent://$hexHash/3")
        assertEquals(hexHash, stream.p2pInfoHash)
    }

    @Test
    fun `p2pInfoHash stops at query separator`() {
        val stream = stream(url = "torrent://$hexHash?index=2")
        assertEquals(hexHash, stream.p2pInfoHash)
    }

    @Test
    fun `p2pInfoHash extracts hex hash from magnet url`() {
        val stream = stream(url = "magnet:?xt=urn:btih:$hexHash&dn=Test")
        assertEquals(hexHash, stream.p2pInfoHash)
    }

    @Test
    fun `p2pInfoHash extracts base32 hash from magnet url`() {
        val stream = stream(url = "magnet:?xt=urn:btih:$base32Hash&dn=Test")
        assertEquals(base32Hash, stream.p2pInfoHash)
    }

    @Test
    fun `dedicated infoHash field wins over different hash in torrent url`() {
        val dedicated = "fedcba9876543210fedcba9876543210fedcba98"
        val stream = stream(
            url = "torrent://$hexHash",
            infoHash = dedicated,
        )
        assertEquals(dedicated, stream.p2pInfoHash)
    }

    @Test
    fun `torrent-null sentinel yields null p2pInfoHash`() {
        val stream = stream(url = "torrent://null")
        assertNull(stream.p2pInfoHash)
    }

    @Test
    fun `torrent url with invalid hash length yields null p2pInfoHash`() {
        val stream = stream(url = "torrent://abcdef123456")
        assertNull(stream.p2pInfoHash)
    }

    @Test
    fun `plain http url yields null p2pInfoHash`() {
        val stream = stream(url = "https://cdn.example.com/video.mp4")
        assertNull(stream.p2pInfoHash)
    }

    // -----------------------------------------------------------------------
    // p2pFileIdx extraction
    // -----------------------------------------------------------------------

    @Test
    fun `p2pFileIdx extracts trailing index segment from torrent url`() {
        val stream = stream(url = "torrent://$hexHash/3")
        assertEquals(3, stream.p2pFileIdx)
    }

    @Test
    fun `dedicated fileIdx field wins over torrent url segment`() {
        val stream = stream(url = "torrent://$hexHash/3", fileIdx = 7)
        assertEquals(7, stream.p2pFileIdx)
    }

    @Test
    fun `p2pFileIdx is null without a path segment`() {
        val stream = stream(url = "torrent://$hexHash")
        assertNull(stream.p2pFileIdx)
    }

    @Test
    fun `p2pFileIdx is null for non-numeric path segment`() {
        val stream = stream(url = "torrent://$hexHash/name.mkv")
        assertNull(stream.p2pFileIdx)
    }

    @Test
    fun `p2pFileIdx ignores query parameters`() {
        val stream = stream(url = "torrent://$hexHash/2?foo=bar")
        assertEquals(2, stream.p2pFileIdx)
    }

    // -----------------------------------------------------------------------
    // Parser integration — torrent:// in JSON url field
    // -----------------------------------------------------------------------

    @Test
    fun `parser preserves torrent scheme url and stream is correctly classified`() {
        val streams = StreamParser.parse(
            payload = """
                {
                  "streams": [
                    {
                      "url": "torrent://$hexHash",
                      "name": "1080p"
                    }
                  ]
                }
            """.trimIndent(),
            addonName = "Addon",
            addonId = "addon.id",
        )

        val stream = streams.single()
        assertTrue(stream.isTorrentStream)
        assertNull(stream.playableDirectUrl)
        assertEquals(hexHash, stream.p2pInfoHash)
    }

    @Test
    fun `parser keeps normal http stream playable and not torrent`() {
        val streams = StreamParser.parse(
            payload = """
                {
                  "streams": [
                    {
                      "url": "https://cdn.example.com/video.mp4",
                      "name": "1080p"
                    }
                  ]
                }
            """.trimIndent(),
            addonName = "Addon",
            addonId = "addon.id",
        )

        val stream = streams.single()
        assertFalse(stream.isTorrentStream)
        assertEquals("https://cdn.example.com/video.mp4", stream.playableDirectUrl)
        assertNull(stream.p2pInfoHash)
    }

    // -----------------------------------------------------------------------
    // Helper
    // -----------------------------------------------------------------------

    private fun stream(
        url: String? = null,
        infoHash: String? = null,
        fileIdx: Int? = null,
        externalUrl: String? = null,
    ): StreamItem = StreamItem(
        url = url,
        infoHash = infoHash,
        fileIdx = fileIdx,
        externalUrl = externalUrl,
        addonName = "TestAddon",
        addonId = "test.addon",
    )
}
