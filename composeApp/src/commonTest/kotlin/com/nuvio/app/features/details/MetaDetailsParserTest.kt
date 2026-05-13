package com.nuvio.app.features.details

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class MetaDetailsParserTest {

    @Test
    fun `parse rejects null meta object without json object cast crash`() = runBlocking {
        assertFailsWith<IllegalStateException> {
            runBlocking { MetaDetailsParser.parse("""{"meta":null}""") }
        }
        Unit
    }

    @Test
    fun `parse accepts bare meta object response`() = runBlocking {
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
}
