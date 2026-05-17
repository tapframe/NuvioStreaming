package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class StreamParserTest {

    @Test
    fun `parse keeps bingeGroup and explicit notWebReady`() {
        val streams = StreamParser.parse(
            payload =
                """
                {
                  "streams": [
                    {
                      "url": "https://example.com/video.mp4",
                      "name": "1080p",
                      "behaviorHints": {
                        "bingeGroup": "addon-1080p",
                        "notWebReady": true
                      }
                    }
                  ]
                }
                """.trimIndent(),
            addonName = "Addon",
            addonId = "addon.id",
        )

        val stream = streams.single()
        assertEquals("addon-1080p", stream.behaviorHints.bingeGroup)
        assertTrue(stream.behaviorHints.notWebReady)
    }

    @Test
    fun `parse forces notWebReady when proxyHeaders are provided`() {
        val streams = StreamParser.parse(
            payload =
                """
                {
                  "streams": [
                    {
                      "url": "https://example.com/video.m3u8",
                      "name": "Proxy stream",
                      "behaviorHints": {
                        "proxyHeaders": {
                          "request": {
                            "User-Agent": "Stremio"
                          }
                        }
                      }
                    }
                  ]
                }
                """.trimIndent(),
            addonName = "Addon",
            addonId = "addon.id",
        )

        val stream = streams.single()
        assertTrue(stream.behaviorHints.notWebReady)
        val requestHeaders = stream.behaviorHints.proxyHeaders?.request
        assertNotNull(requestHeaders)
        assertEquals("Stremio", requestHeaders["User-Agent"])
    }

    @Test
    fun `parse keeps notWebReady false when no proxyHeaders and no hint`() {
        val streams = StreamParser.parse(
            payload =
                """
                {
                  "streams": [
                    {
                      "url": "https://example.com/video.mp4",
                      "name": "Direct"
                    }
                  ]
                }
                """.trimIndent(),
            addonName = "Addon",
            addonId = "addon.id",
        )

        val stream = streams.single()
        assertFalse(stream.behaviorHints.notWebReady)
    }

    @Test
    fun `parse keeps proxy response headers`() {
        val streams = StreamParser.parse(
            payload =
                """
                {
                  "streams": [
                    {
                      "url": "https://example.com/video.mp4",
                      "behaviorHints": {
                        "proxyHeaders": {
                          "response": {
                            "content-type": "video/mp4",
                            "x-test": "ok"
                          }
                        }
                      }
                    }
                  ]
                }
                """.trimIndent(),
            addonName = "Addon",
            addonId = "addon.id",
        )

        val responseHeaders = streams.single().behaviorHints.proxyHeaders?.response
        assertNotNull(responseHeaders)
        assertEquals("video/mp4", responseHeaders["content-type"])
        assertEquals("ok", responseHeaders["x-test"])
    }

    @Test
    fun `parse keeps client resolve metadata without direct URL`() {
        val streams = StreamParser.parse(
            payload =
                """
                {
                  "streams": [
                    {
                      "name": "Instant",
                      "clientResolve": {
                        "type": "debrid",
                        "infoHash": "abc123",
                        "fileIdx": 4,
                        "sources": ["udp://tracker.example"],
                        "torrentName": "Movie Pack",
                        "filename": "Movie.2024.2160p.mkv",
                        "service": "torbox",
                        "isCached": true,
                        "stream": {
                          "raw": {
                            "size": 1610612736,
                            "indexer": "Indexer",
                            "parsed": {
                              "parsed_title": "Movie",
                              "year": 2024,
                              "resolution": "2160p",
                              "hdr": ["DV"],
                              "audio": ["Atmos"],
                              "episodes": [1, 2],
                              "bit_depth": "10bit"
                            }
                          }
                        }
                      }
                    }
                  ]
                }
                """.trimIndent(),
            addonName = "Direct Debrid",
            addonId = "debrid:torbox",
        )

        val stream = streams.single()
        assertTrue(stream.isDirectDebridStream)
        assertFalse(stream.isTorrentStream)
        assertEquals("abc123", stream.clientResolve?.infoHash)
        assertEquals(4, stream.clientResolve?.fileIdx)
        assertEquals("udp://tracker.example", stream.clientResolve?.sources?.single())
        assertEquals("2160p", stream.clientResolve?.stream?.raw?.parsed?.resolution)
        assertEquals(listOf(1, 2), stream.clientResolve?.stream?.raw?.parsed?.episodes)
    }
}
