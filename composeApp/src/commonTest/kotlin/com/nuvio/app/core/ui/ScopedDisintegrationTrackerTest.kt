package com.nuvio.app.core.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ScopedDisintegrationTrackerTest {

    @Test
    fun `same source retains removed items for disintegration`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        tracker.sync(scope = "trakt", items = listOf("first", "second"))

        val entries = tracker.sync(scope = "trakt", items = listOf("second"))

        assertEquals(listOf("first", "second"), entries.map { it.item })
        assertTrue(entries.first { it.item == "first" }.exiting)
        assertFalse(entries.first { it.item == "second" }.exiting)
    }

    @Test
    fun `source replacement drops old items without disintegration`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        tracker.sync(scope = "trakt", items = listOf("trakt-one", "trakt-two"))
        tracker.sync(scope = "trakt", items = listOf("trakt-two"))

        val entries = tracker.sync(scope = "simkl", items = listOf("simkl-one"))

        assertEquals(listOf("simkl-one"), entries.map { it.item })
        assertTrue(entries.none { it.exiting })

        val emptyEntries = tracker.sync(scope = "nuvio-sync", items = emptyList())

        assertTrue(emptyEntries.isEmpty())
    }

    @Test
    fun `reset starts the next snapshot without removals`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        tracker.sync(scope = "trakt", items = listOf("first"))
        tracker.reset()

        val entries = tracker.sync(scope = "trakt", items = listOf("second"))

        assertEquals(listOf("second"), entries.map { it.item })
        assertTrue(entries.none { it.exiting })
    }
}
