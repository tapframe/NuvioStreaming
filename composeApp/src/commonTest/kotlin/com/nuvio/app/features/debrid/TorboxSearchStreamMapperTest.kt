package com.nuvio.app.features.debrid

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.serialization.decodeFromString

class TorboxSearchStreamMapperTest {
    @Test
    fun `maps cached TorBox search result to direct debrid stream`() {
        val stream = TorboxSearchTorrentDto(
            hash = "abc123",
            magnet = "magnet:?xt=urn:btih:abc123",
            rawTitle = "Show.S01E02.2160p.WEB-DL.mkv",
            size = 17_600_000_000,
            tracker = "example",
            cached = true,
            parsed = TorboxSearchParsedDto(
                title = "Show",
                year = 2026,
                resolution = "2160p",
                quality = "WEB-DL",
                codec = "HEVC",
                season = 1,
                episode = 2,
            ),
        ).toStreamItem(
            addonName = "Torbox Instant",
            addonId = "debrid:torbox",
            mediaType = "series",
            mediaId = "tt1234567",
            season = null,
            episode = null,
            fallbackCached = null,
        )

        assertNotNull(stream)
        assertTrue(stream.isDirectDebridStream)
        assertEquals("abc123", stream.clientResolve?.infoHash)
        assertEquals("magnet:?xt=urn:btih:abc123", stream.clientResolve?.magnetUri)
        assertEquals(DebridProviders.TORBOX_ID, stream.clientResolve?.service)
        assertEquals(1, stream.clientResolve?.season)
        assertEquals(2, stream.clientResolve?.episode)
        assertEquals("2160p", stream.clientResolve?.stream?.raw?.parsed?.resolution)
    }

    @Test
    fun `decodes TorBox search response with string audio metadata`() {
        val decoded = DebridApiJson.json.decodeFromString<TorboxSearchResponseDto>(
            """
            {
              "success": true,
              "data": {
                "cached": true,
                "torrents": [
                  {
                    "hash": "abc123",
                    "magnet": "magnet:?xt=urn:btih:abc123",
                    "raw_title": "Movie.2026.1080p.WEB-DL.AAC.mkv",
                    "size": 123456,
                    "title_parsed_data": {
                      "title": "Movie",
                      "year": 2026,
                      "resolution": "1080p",
                      "quality": "WEB-DL",
                      "audio": "AAC 5.1",
                      "bitDepth": 10
                    }
                  }
                ]
              }
            }
            """.trimIndent(),
        )

        val stream = decoded.data?.torrents?.single()?.toStreamItem(
            addonName = "Torbox Instant",
            addonId = "debrid:torbox",
            mediaType = "movie",
            mediaId = "tt1234567",
            season = null,
            episode = null,
            fallbackCached = decoded.data.cached,
        )

        assertNotNull(stream)
        assertEquals(listOf("AAC 5.1"), stream.clientResolve?.stream?.raw?.parsed?.audio)
        assertEquals("10", stream.clientResolve?.stream?.raw?.parsed?.bitDepth)
    }
}
