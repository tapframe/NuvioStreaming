package com.nuvio.app.features.library

import com.nuvio.app.features.library.sync.LibraryDeltaEvent
import com.nuvio.app.features.library.sync.LibrarySyncKey
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class LibraryDeltaStateTest {

    @Test
    fun `removing final item records an explicit delete mutation`() {
        val state = loadedState(listOf(libraryItem("item")))

        val result = state.remove(id = "item", type = "movie")

        assertEquals(1, result.affectedCount)
        assertTrue(result.snapshot.items.isEmpty())
        assertTrue(result.snapshot.pendingUpsertKeys.isEmpty())
        assertEquals(listOf("item"), result.snapshot.pendingDeleteKeys.map { it.contentId })
    }

    @Test
    fun `successful push clears only the current mutation snapshot`() {
        val state = loadedState(emptyList())
        val pushedSnapshot = state.upsert(libraryItem("first"))
        state.upsert(libraryItem("second"))

        assertEquals(null, state.markPushCompleted(pushedSnapshot))
        assertEquals(
            setOf("first", "second"),
            state.snapshot().pendingUpsertKeys.mapTo(mutableSetOf()) { it.contentId },
        )
    }

    @Test
    fun `delta deletion clears a remotely managed final item`() {
        val state = loadedState(listOf(libraryItem("item")))
        val bootstrap = assertNotNull(
            state.applyServerItems(
                pullSnapshot = state.snapshot(),
                serverItems = listOf(libraryItem("item")),
                cursorEventId = 20L,
            ),
        )

        val updated = assertNotNull(
            state.applyDeltaEvents(
                token = bootstrap.snapshot.token,
                events = listOf(
                    LibraryDeltaEvent(
                        eventId = 21L,
                        operation = "delete",
                        item = libraryItem("item"),
                    ),
                ),
            ),
        )

        assertTrue(updated.items.isEmpty())
        assertEquals(21L, updated.deltaCursorEventId)
        assertTrue(updated.deltaInitialized)
    }

    @Test
    fun `storage payload keeps cursor and pending deletes across reload`() {
        val state = loadedState(listOf(libraryItem("item")))
        val bootstrap = assertNotNull(
            state.applyServerItems(
                pullSnapshot = state.snapshot(),
                serverItems = listOf(libraryItem("item")),
                cursorEventId = 42L,
            ),
        )
        val removed = state.remove(id = "item", type = "movie").snapshot
        val stored = LibraryStoragePayloadCodec.decode(
            LibraryStoragePayloadCodec.encode(removed),
        )
        val reloaded = LibraryLocalState()
        val token = reloaded.beginProfileLoad(profileId = 1).snapshot.token
        val snapshot = assertNotNull(
            reloaded.completeProfileLoad(
                token = token,
                activeProfileId = 1,
                items = stored.items,
                deltaCursorEventId = stored.deltaCursorEventId,
                deltaInitialized = stored.deltaInitialized,
                pendingUpsertKeys = stored.pendingUpsertKeys,
                pendingDeleteKeys = stored.pendingDeleteKeys,
            ),
        )

        assertTrue(bootstrap.snapshot.deltaInitialized)
        assertEquals(42L, snapshot.deltaCursorEventId)
        assertTrue(snapshot.deltaInitialized)
        assertEquals(listOf("item"), snapshot.pendingDeleteKeys.map { it.contentId })
    }

    @Test
    fun `legacy storage payload decodes with delta sync disabled`() {
        val stored = LibraryStoragePayloadCodec.decode(
            """{"items":[{"id":"legacy","type":"movie","name":"Legacy","savedAtEpochMs":1}]}""",
        )

        assertEquals(listOf("legacy"), stored.items.map(LibraryItem::id))
        assertEquals(0L, stored.deltaCursorEventId)
        assertFalse(stored.deltaInitialized)
        assertTrue(stored.pendingUpsertKeys.isEmpty())
        assertTrue(stored.pendingDeleteKeys.isEmpty())
    }

    @Test
    fun `reloading a pending delete keeps the item removed`() {
        val state = LibraryLocalState()
        val token = state.beginProfileLoad(profileId = 1).snapshot.token
        val snapshot = assertNotNull(
            state.completeProfileLoad(
                token = token,
                activeProfileId = 1,
                items = listOf(libraryItem("item")),
                deltaInitialized = true,
                pendingDeleteKeys = listOf(
                    LibrarySyncKey(contentId = "item", contentType = "movie"),
                ),
            ),
        )

        assertTrue(snapshot.items.isEmpty())
        assertEquals(listOf("item"), snapshot.pendingDeleteKeys.map { it.contentId })
    }

    private fun loadedState(items: List<LibraryItem>): LibraryLocalState {
        val state = LibraryLocalState()
        val token = state.beginProfileLoad(profileId = 1).snapshot.token
        state.completeProfileLoad(
            token = token,
            activeProfileId = 1,
            items = items,
        )
        return state
    }

    private fun libraryItem(id: String): LibraryItem =
        LibraryItem(
            id = id,
            type = "movie",
            name = id,
            savedAtEpochMs = 1L,
        )
}
