package com.nuvio.app.features.player

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SubtitleSdhFilterTest {
    @Test
    fun removesSoundDescriptions() {
        assertNull(SubtitleSdhFilter.filter("[GLASS SHATTERING]"))
        assertEquals("Where are you?", SubtitleSdhFilter.filter("[PHONE BUZZES] Where are you?"))
        assertNull(SubtitleSdhFilter.filter("(LOUD BANG)"))
        assertEquals("(softly) I know.", SubtitleSdhFilter.filter("(softly) I know."))
        assertEquals("(1984)", SubtitleSdhFilter.filter("(1984)"))
    }

    @Test
    fun removesSpeakerLabels() {
        assertEquals("Hello.", SubtitleSdhFilter.filter("JOHN: Hello."))
        assertEquals("- Hello.", SubtitleSdhFilter.filter("- WOMAN: Hello."))
        assertEquals("Hello.", SubtitleSdhFilter.filter("[MAN]: Hello."))
        assertEquals("John: Hello.", SubtitleSdhFilter.filter("John: Hello."))
        assertEquals("MAN:Wait.", SubtitleSdhFilter.filter("MAN:Wait."))
    }

    @Test
    fun removesEmptySdhLines() {
        assertEquals(
            "♪ music ♪\nKeep moving.",
            SubtitleSdhFilter.filter("♪ music ♪\n[DOOR SLAMS]\nKeep moving."),
        )
    }
}
