package com.nuvio.app.features.library

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.Job

internal data class LibraryProfileToken(
    val profileId: Int,
    val generation: Long,
)

internal data class LibraryLocalSnapshot(
    val token: LibraryProfileToken,
    val revision: Long,
    val contentRevision: Long,
    val hasLoaded: Boolean,
    val isLoading: Boolean,
    val items: List<LibraryItem>,
    val hasPendingPush: Boolean,
)

internal data class LibraryStateTransition(
    val snapshot: LibraryLocalSnapshot,
    val detachedPushJob: Job?,
)

internal data class LibraryLocalMutation(
    val snapshot: LibraryLocalSnapshot,
    val affectedCount: Int,
)

internal data class LibraryLocalToggleResult(
    val snapshot: LibraryLocalSnapshot,
    val isSaved: Boolean,
)

internal data class LibraryServerItemsApplyResult(
    val snapshot: LibraryLocalSnapshot,
    val preservedLocalItems: Boolean,
)

internal data class LibraryPushJobInstallResult(
    val installed: Boolean,
    val detachedPushJob: Job?,
)

/**
 * Owns the profile-scoped local-library state behind one lock.
 *
 * Callers only receive copied item lists, so sorting or serializing a snapshot never traverses
 * the live mutable map while another thread replaces or edits it.
 */
internal class LibraryLocalState {
    private val lock = SynchronizedObject()

    private var hasLoaded = false
    private var currentProfileId = 1
    private var profileGeneration = 0L
    private var revision = 0L
    private var contentRevision = 0L
    private var isLoading = false
    private var itemsById: MutableMap<String, LibraryItem> = mutableMapOf()
    private var hasPendingPush = false
    private var pushJob: Job? = null

    fun snapshot(): LibraryLocalSnapshot = synchronized(lock) {
        snapshotLocked()
    }

    fun currentTokenIfLoaded(profileId: Int): LibraryProfileToken? = synchronized(lock) {
        if (!hasLoaded || currentProfileId != profileId) {
            null
        } else {
            tokenLocked()
        }
    }

    fun isCurrent(token: LibraryProfileToken): Boolean = synchronized(lock) {
        isCurrentLocked(token)
    }

    fun isCurrent(snapshot: LibraryLocalSnapshot): Boolean = synchronized(lock) {
        isCurrentLocked(snapshot)
    }

    fun isContentCurrent(snapshot: LibraryLocalSnapshot): Boolean = synchronized(lock) {
        isContentCurrentLocked(snapshot)
    }

    fun runIfCurrent(snapshot: LibraryLocalSnapshot, block: () -> Unit): Boolean = synchronized(lock) {
        if (!isCurrentLocked(snapshot)) {
            false
        } else {
            block()
            true
        }
    }

    fun runIfContentCurrent(snapshot: LibraryLocalSnapshot, block: () -> Unit): Boolean = synchronized(lock) {
        if (!isContentCurrentLocked(snapshot)) {
            false
        } else {
            block()
            true
        }
    }

    fun runIfTokenCurrent(token: LibraryProfileToken, block: () -> Unit): Boolean = synchronized(lock) {
        if (!isCurrentLocked(token)) {
            false
        } else {
            block()
            true
        }
    }

    fun beginProfileLoad(profileId: Int): LibraryStateTransition = synchronized(lock) {
        val detachedPushJob = pushJob
        pushJob = null
        currentProfileId = profileId
        profileGeneration += 1L
        revision += 1L
        contentRevision += 1L
        hasLoaded = false
        isLoading = true
        itemsById = mutableMapOf()
        hasPendingPush = false
        LibraryStateTransition(
            snapshot = snapshotLocked(),
            detachedPushJob = detachedPushJob,
        )
    }

    fun completeProfileLoad(
        token: LibraryProfileToken,
        activeProfileId: Int,
        items: Collection<LibraryItem>,
    ): LibraryLocalSnapshot? = synchronized(lock) {
        if (activeProfileId != token.profileId || !isCurrentLocked(token)) {
            return@synchronized null
        }
        itemsById = items.associateByTo(mutableMapOf()) { libraryItemKey(it.id, it.type) }
        hasLoaded = true
        isLoading = false
        revision += 1L
        contentRevision += 1L
        snapshotLocked()
    }

    fun reset(): LibraryStateTransition = synchronized(lock) {
        val detachedPushJob = pushJob
        pushJob = null
        currentProfileId = 1
        profileGeneration += 1L
        revision += 1L
        contentRevision += 1L
        hasLoaded = false
        isLoading = false
        itemsById = mutableMapOf()
        hasPendingPush = false
        LibraryStateTransition(
            snapshot = snapshotLocked(),
            detachedPushJob = detachedPushJob,
        )
    }

    fun markPullStarted(token: LibraryProfileToken): LibraryLocalSnapshot? = synchronized(lock) {
        if (!isCurrentLocked(token)) return@synchronized null
        snapshotLocked()
    }

    fun applyServerItems(
        pullSnapshot: LibraryLocalSnapshot,
        serverItems: Collection<LibraryItem>,
    ): LibraryServerItemsApplyResult? = synchronized(lock) {
        if (!isCurrentLocked(pullSnapshot.token)) return@synchronized null

        val localContentChanged = contentRevision != pullSnapshot.contentRevision
        val hasLocalChanges = pullSnapshot.hasPendingPush || hasPendingPush || localContentChanged
        val preserveLocalItems = itemsById.isNotEmpty() && (serverItems.isEmpty() || hasLocalChanges)
        if (!preserveLocalItems) {
            itemsById = serverItems.associateByTo(mutableMapOf()) { libraryItemKey(it.id, it.type) }
            contentRevision += 1L
            hasPendingPush = false
        }
        hasLoaded = true
        isLoading = false
        revision += 1L
        LibraryServerItemsApplyResult(
            snapshot = snapshotLocked(),
            preservedLocalItems = preserveLocalItems,
        )
    }

    fun upsert(item: LibraryItem): LibraryLocalSnapshot = synchronized(lock) {
        itemsById[libraryItemKey(item.id, item.type)] = item
        revision += 1L
        contentRevision += 1L
        hasPendingPush = true
        snapshotLocked()
    }

    fun toggle(item: LibraryItem): LibraryLocalToggleResult = synchronized(lock) {
        val key = libraryItemKey(item.id, item.type)
        val isSaved = if (itemsById.remove(key) != null) {
            false
        } else {
            itemsById[key] = item
            true
        }
        revision += 1L
        contentRevision += 1L
        hasPendingPush = true
        LibraryLocalToggleResult(
            snapshot = snapshotLocked(),
            isSaved = isSaved,
        )
    }

    fun removeById(id: String): LibraryLocalMutation = synchronized(lock) {
        val before = itemsById.size
        itemsById.entries.removeAll { (_, item) -> item.id == id }
        val affectedCount = before - itemsById.size
        if (affectedCount > 0) {
            revision += 1L
            contentRevision += 1L
            hasPendingPush = true
        }
        LibraryLocalMutation(
            snapshot = snapshotLocked(),
            affectedCount = affectedCount,
        )
    }

    fun remove(id: String, type: String): LibraryLocalMutation = synchronized(lock) {
        val affectedCount = if (itemsById.remove(libraryItemKey(id, type)) != null) 1 else 0
        if (affectedCount > 0) {
            revision += 1L
            contentRevision += 1L
            hasPendingPush = true
        }
        LibraryLocalMutation(
            snapshot = snapshotLocked(),
            affectedCount = affectedCount,
        )
    }

    fun contains(id: String, type: String): Boolean = synchronized(lock) {
        itemsById.containsKey(libraryItemKey(id, type))
    }

    fun containsId(id: String): Boolean = synchronized(lock) {
        itemsById.values.any { it.id == id }
    }

    fun findById(id: String): LibraryItem? = synchronized(lock) {
        itemsById.values.firstOrNull { it.id == id }
    }

    fun installPushJob(
        snapshot: LibraryLocalSnapshot,
        job: Job,
    ): LibraryPushJobInstallResult = synchronized(lock) {
        if (!isContentCurrentLocked(snapshot)) {
            LibraryPushJobInstallResult(installed = false, detachedPushJob = null)
        } else {
            val detachedPushJob = pushJob
            pushJob = job
            LibraryPushJobInstallResult(installed = true, detachedPushJob = detachedPushJob)
        }
    }

    fun clearPushJob(job: Job) {
        synchronized(lock) {
            if (pushJob === job) pushJob = null
        }
    }

    fun markPushCompleted(snapshot: LibraryLocalSnapshot) {
        synchronized(lock) {
            if (isContentCurrentLocked(snapshot)) {
                hasPendingPush = false
            }
        }
    }

    private fun tokenLocked(): LibraryProfileToken =
        LibraryProfileToken(
            profileId = currentProfileId,
            generation = profileGeneration,
        )

    private fun snapshotLocked(): LibraryLocalSnapshot =
        LibraryLocalSnapshot(
            token = tokenLocked(),
            revision = revision,
            contentRevision = contentRevision,
            hasLoaded = hasLoaded,
            isLoading = isLoading,
            items = itemsById.values.toList(),
            hasPendingPush = hasPendingPush,
        )

    private fun isCurrentLocked(token: LibraryProfileToken): Boolean =
        currentProfileId == token.profileId && profileGeneration == token.generation

    private fun isCurrentLocked(snapshot: LibraryLocalSnapshot): Boolean =
        isCurrentLocked(snapshot.token) && revision == snapshot.revision

    private fun isContentCurrentLocked(snapshot: LibraryLocalSnapshot): Boolean =
        isCurrentLocked(snapshot.token) && contentRevision == snapshot.contentRevision
}

private fun libraryItemKey(id: String, type: String): String =
    "${type.trim().lowercase()}:${id.trim()}"
