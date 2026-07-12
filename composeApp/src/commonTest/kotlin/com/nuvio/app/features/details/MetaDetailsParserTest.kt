package com.nuvio.app.features.details

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MetaDetailsParserTest {

    @Test
    fun `parse rejects null meta object without json object cast crash`() {
        assertFailsWith<IllegalStateException> {
            MetaDetailsParser.parse("""{"meta":null}""")
        }
    }

    @Test
    fun `parse accepts bare meta object response`() {
        val result = MetaDetailsParser.parse(
            """
            {
              "id": "mal:62516",
              "type": "series",
              "name": "The Fragrant Flower Blooms with Dignity"
            }
            """.trimIndent(),
        )

        assertEquals("mal:62516", result.id)
        assertEquals("series", result.type)
        assertEquals("The Fragrant Flower Blooms with Dignity", result.name)
    }

    @Test
    fun `parse preserves explicit video availability`() {
        val result = MetaDetailsParser.parse(
            """
            {
              "meta": {
                "id": "mal:52991",
                "type": "series",
                "name": "Show",
                "videos": [
                  {
                    "id": "show:3:1",
                    "title": "Episode 1",
                    "season": 3,
                    "episode": 1,
                    "released": null,
                    "available": false
                  },
                  {
                    "id": "show:1:1",
                    "title": "Episode 1",
                    "season": 1,
                    "episode": 1
                  }
                ]
              }
            }
            """.trimIndent(),
        )

        assertFalse(result.videos[0].available)
        assertTrue(result.videos[1].available)
    }

    @Test
    fun `parse reads custom seasons with poster and poster_path fallback`() {
        val result = MetaDetailsParser.parse(
            """
            {
              "meta": {
                "id": "custom:show",
                "type": "series",
                "name": "Show",
                "seasons": [
                  { "season": 1, "poster": "https://example.com/s1.jpg" },
                  { "season": 2, "poster_path": "https://example.com/s2.jpg" },
                  { "poster": "https://example.com/orphan.jpg" }
                ]
              }
            }
            """.trimIndent(),
        )

        // The entry without a season number is skipped.
        assertEquals(2, result.customSeasons.size)
        assertEquals(1, result.customSeasons[0].season)
        assertEquals("https://example.com/s1.jpg", result.customSeasons[0].poster)
        assertEquals(2, result.customSeasons[1].season)
        assertEquals("https://example.com/s2.jpg", result.customSeasons[1].poster)
    }

    @Test
    fun `parse defaults custom seasons to empty when absent`() {
        val result = MetaDetailsParser.parse(
            """
            {
              "meta": {
                "id": "custom:show",
                "type": "series",
                "name": "Show"
              }
            }
            """.trimIndent(),
        )

        assertTrue(result.customSeasons.isEmpty())
    }
}
