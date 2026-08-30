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
    fun `parse reads defaultVideoId from behavior hints`() {
        val result = MetaDetailsParser.parse(
            """
            {
              "meta": {
                "id": "show",
                "type": "series",
                "name": "Show",
                "behaviorHints": {
                  "defaultVideoId": "show:1:2"
                }
              }
            }
            """.trimIndent(),
        )

        assertEquals("show:1:2", result.defaultVideoId)
    }

    @Test
    fun `parse reads AIOMetadata season posters from app extras`() {
        val result = MetaDetailsParser.parse(
            """
            {
              "meta": {
                "id": "show",
                "type": "series",
                "name": "Show",
                "app_extras": {
                  "seasonPosters": [
                    "https://example.com/season-1.jpg",
                    null,
                    "https://example.com/season-3.jpg"
                  ]
                }
              }
            }
            """.trimIndent(),
        )

        assertEquals(
            mapOf(
                1 to "https://example.com/season-1.jpg",
                3 to "https://example.com/season-3.jpg",
            ),
            result.seasonPosters,
        )
    }

    @Test
    fun `parse reads localized AIOMetadata certification`() {
        val result = MetaDetailsParser.parse(
            """
            {
              "meta": {
                "id": "show",
                "type": "series",
                "name": "Show",
                "app_extras": {
                  "certificationLocal": " 16 ",
                  "certification": "TV-MA"
                }
              }
            }
            """.trimIndent(),
        )

        assertEquals("16", result.ageRating)
    }

    @Test
    fun `parse falls back to AIOMetadata default certification`() {
        val result = MetaDetailsParser.parse(
            """
            {
              "meta": {
                "id": "movie",
                "type": "movie",
                "name": "Movie",
                "app_extras": {
                  "certificationLocal": " ",
                  "certification": "PG-13"
                }
              }
            }
            """.trimIndent(),
        )

        assertEquals("PG-13", result.ageRating)
    }
}
