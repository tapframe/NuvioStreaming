package com.nuvio.app.features.details

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MetaDetailsParserSeasonsTest {

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
