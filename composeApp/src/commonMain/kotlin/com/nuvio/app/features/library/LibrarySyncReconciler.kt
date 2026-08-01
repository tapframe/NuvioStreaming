package com.nuvio.app.features.library

import com.nuvio.app.features.library.sync.LibraryDeltaEvent
import com.nuvio.app.features.library.sync.LibrarySyncKey
import com.nuvio.app.features.library.sync.toLibrarySyncKey

internal data class LibrarySnapshotReconciliation(
    val itemsByKey: MutableMap<String, LibraryItem>,
    val pendingUpsertKeysByKey: MutableMap<String, LibrarySyncKey>,
    val pendingDeleteKeysByKey: MutableMap<String, LibrarySyncKey>,
    val preservedLocalItems: Boolean,
)

internal data class LibraryDeltaReconciliation(
    val itemsByKey: MutableMap<String, LibraryItem>,
    val changed: Boolean,
    val cursorEventId: Long,
)

internal fun reconcileLibrarySnapshot(
    serverItems: Collection<LibraryItem>,
    localItemsByKey: Map<String, LibraryItem>,
    pendingUpsertKeysByKey: Map<String, LibrarySyncKey>,
    pendingDeleteKeysByKey: Map<String, LibrarySyncKey>,
    preserveLegacyLocalWhenServerEmpty: Boolean,
): LibrarySnapshotReconciliation {
    val serverItemsByKey = serverItems.associateByTo(mutableMapOf()) {
        libraryItemKey(it.id, it.type)
    }
    val pendingUpserts = pendingUpsertKeysByKey.toMutableMap()
    val pendingDeletes = pendingDeleteKeysByKey.toMutableMap()
    val migrateLegacyLocalItems =
        preserveLegacyLocalWhenServerEmpty &&
            serverItemsByKey.isEmpty() &&
            localItemsByKey.isNotEmpty() &&
            pendingUpserts.isEmpty() &&
            pendingDeletes.isEmpty()

    if (migrateLegacyLocalItems) {
        localItemsByKey.forEach { (key, item) ->
            pendingUpserts[key] = item.toLibrarySyncKey()
        }
    } else {
        pendingDeletes.keys.forEach(serverItemsByKey::remove)
        pendingUpserts.keys.forEach { key ->
            localItemsByKey[key]?.let { item -> serverItemsByKey[key] = item }
        }
    }

    return LibrarySnapshotReconciliation(
        itemsByKey = if (migrateLegacyLocalItems) {
            localItemsByKey.toMutableMap()
        } else {
            serverItemsByKey
        },
        pendingUpsertKeysByKey = pendingUpserts,
        pendingDeleteKeysByKey = pendingDeletes,
        preservedLocalItems = migrateLegacyLocalItems || pendingUpserts.isNotEmpty() || pendingDeletes.isNotEmpty(),
    )
}

internal fun reconcileLibraryDelta(
    events: Collection<LibraryDeltaEvent>,
    currentItemsByKey: Map<String, LibraryItem>,
    pendingUpsertKeysByKey: Map<String, LibrarySyncKey>,
    pendingDeleteKeysByKey: Map<String, LibrarySyncKey>,
    currentCursorEventId: Long,
): LibraryDeltaReconciliation {
    val items = currentItemsByKey.toMutableMap()

    events.sortedBy(LibraryDeltaEvent::eventId).forEach { event ->
        val key = libraryItemKey(event.item.id, event.item.type)
        if (key in pendingUpsertKeysByKey || key in pendingDeleteKeysByKey) return@forEach

        when (event.operation.trim().lowercase()) {
            "upsert" -> items[key] = event.item
            "delete" -> items.remove(key)
        }
    }

    return LibraryDeltaReconciliation(
        itemsByKey = items,
        changed = items != currentItemsByKey,
        cursorEventId = maxOf(
            currentCursorEventId,
            events.maxOfOrNull(LibraryDeltaEvent::eventId) ?: currentCursorEventId,
        ),
    )
}
