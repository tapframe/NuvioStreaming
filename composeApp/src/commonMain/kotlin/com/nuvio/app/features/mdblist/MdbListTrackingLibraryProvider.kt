package com.nuvio.app.features.mdblist

import com.nuvio.app.features.library.LibraryItem
import com.nuvio.app.features.tracking.TrackingLibraryProvider
import com.nuvio.app.features.tracking.TrackingMembershipResolution
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingRefreshIntent
import kotlinx.coroutines.CancellationException

class MdbListTrackingLibraryProvider(
    private val library: MdbListLibraryService,
    private val sync: MdbListSyncRepository,
    private val ensureAccountLoaded: () -> Unit,
) : TrackingLibraryProvider {
    override val providerId = TrackingProviderId.MDBLIST
    override val changes = library.changes
    override val connectionRefreshIntent = TrackingRefreshIntent.AUTOMATIC
    override val listManager = library.listManager

    override fun ensureLoaded() = ensureAccountLoaded()
    override fun prepare() = library.prepare()
    override suspend fun refresh(intent: TrackingRefreshIntent) = library.refresh(intent)
    override fun snapshot() = library.snapshot()
    override fun contains(contentId: String, contentType: String?): Boolean =
        snapshot().items.any { item ->
            (contentId == item.id || contentId == item.imdbId || contentId == item.tmdbId?.let { "tmdb:$it" }) &&
                (contentType == null || mdbListLibraryType(item.type) == mdbListLibraryType(contentType))
        }

    override fun find(contentId: String): LibraryItem? = snapshot().items.firstOrNull { item ->
        contentId == item.id || contentId == item.imdbId || contentId == item.tmdbId?.let { "tmdb:$it" }
    }

    override suspend fun membership(item: LibraryItem) = library.getMembershipSnapshot(item)

    override fun toggledDefaultMembership(currentMembership: Map<String, Boolean>) = currentMembership.toMutableMap().apply {
        this[MDBLIST_WATCHLIST_KEY] = currentMembership[MDBLIST_WATCHLIST_KEY] != true
    }

    override suspend fun applyMembership(
        profileId: Int,
        item: LibraryItem,
        desiredMembership: Map<String, Boolean>,
        destructiveRemovalConfirmed: Boolean,
    ): TrackingMembershipResolution? {
        if (sync.currentScope().profileId != profileId) throw CancellationException("MDBList profile changed")
        library.applyMembershipChanges(item, desiredMembership)
        return null
    }
}
