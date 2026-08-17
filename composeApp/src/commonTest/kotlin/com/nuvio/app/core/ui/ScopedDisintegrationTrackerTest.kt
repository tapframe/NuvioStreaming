package com.nuvio.app.core.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ScopedDisintegrationTrackerTest {

    @Test
    fun `armed removal retains item for disintegration`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        tracker.sync(scope = "trakt", items = listOf("first", "second"))

        val entries = tracker.sync(
            scope = "trakt",
            items = listOf("second"),
            request = DisintegrationRequest(id = 1L, key = "first"),
        )

        assertEquals(listOf("first", "second"), entries.map { it.item })
        assertTrue(entries.first { it.item == "first" }.exiting)
        assertFalse(entries.first { it.item == "second" }.exiting)
    }

    @Test
    fun `unarmed removal drops item without disintegration`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        tracker.sync(scope = "trakt", items = listOf("first", "second"))

        val entries = tracker.sync(scope = "trakt", items = listOf("second"))

        assertEquals(listOf("second"), entries.map { it.item })
        assertTrue(entries.none { it.exiting })
    }

    @Test
    fun `request first seen with initial snapshot does not arm future removal`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        val request = DisintegrationRequest(id = 1L, key = "first")
        tracker.sync(scope = "trakt", items = listOf("first"), request = request)

        val entries = tracker.sync(scope = "trakt", items = emptyList(), request = request)

        assertTrue(entries.isEmpty())
    }

    @Test
    fun `armed request survives unchanged snapshots until removal`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        tracker.sync(scope = "trakt", items = listOf("first", "second"))
        val request = DisintegrationRequest(id = 1L, key = "first")

        tracker.sync(scope = "trakt", items = listOf("first", "second"), request = request)
        val entries = tracker.sync(scope = "trakt", items = listOf("second"), request = request)

        assertTrue(entries.first { it.item == "first" }.exiting)
    }

    @Test
    fun `cancelled request drops removed item without disintegration`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        tracker.sync(scope = "trakt", items = listOf("first", "second"))
        val request = DisintegrationRequest(id = 1L, key = "first")
        tracker.sync(scope = "trakt", items = listOf("first", "second"), request = request)

        val entries = tracker.sync(
            scope = "trakt",
            items = listOf("second"),
            request = request.copy(isActive = false),
        )

        assertEquals(listOf("second"), entries.map { it.item })
        assertTrue(entries.none { it.exiting })
    }

    @Test
    fun `source replacement drops armed items without disintegration`() {
        val tracker = ScopedDisintegrationTracker<String, String, String>(itemKey = { it })
        tracker.sync(scope = "trakt", items = listOf("trakt-one", "trakt-two"))
        tracker.sync(
            scope = "trakt",
            items = listOf("trakt-one", "trakt-two"),
            request = DisintegrationRequest(id = 1L, key = "trakt-one"),
        )

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
