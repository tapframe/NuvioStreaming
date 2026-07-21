package com.nuvio.app.features.tracking

import com.nuvio.app.features.library.LibraryItem
import com.nuvio.app.features.library.LibrarySection
import com.nuvio.app.features.watching.sync.WatchedSyncAdapter
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import kotlinx.coroutines.flow.Flow

enum class TrackingLibraryTabKind {
    WATCHLIST,
    PERSONAL,
}

data class TrackingLibraryTab(
    val key: String,
    val title: String,
    val providerId: TrackingProviderId?,
    val kind: TrackingLibraryTabKind,
)

data class TrackingLibrarySnapshot(
    val items: List<LibraryItem> = emptyList(),
    val sections: List<LibrarySection> = emptyList(),
    val tabs: List<TrackingLibraryTab> = emptyList(),
    val hasLoaded: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Provider-owned projection of remote library state into application models.
 *
 * Application repositories consume this port through [TrackingProviderRegistry]; provider DTOs,
 * list semantics, cache policy, and mutation details stay inside the provider package.
 */
interface TrackingLibraryProvider {
    val providerId: TrackingProviderId
    val changes: Flow<Unit>

    fun ensureLoaded()
    fun prepare() = Unit
    fun onProfileChanged() = Unit
    fun clearLocalState() = Unit
    suspend fun refresh()
    fun snapshot(): TrackingLibrarySnapshot
    fun contains(contentId: String, contentType: String? = null): Boolean
    fun find(contentId: String): LibraryItem?
    suspend fun membership(item: LibraryItem): Map<String, Boolean>
    suspend fun applyMembership(
        profileId: Int,
        item: LibraryItem,
        desiredMembership: Map<String, Boolean>,
    )
    suspend fun toggleDefaultMembership(profileId: Int, item: LibraryItem)
}

/** Provider adapter for watched-history projection and explicit history mutations. */
interface TrackingWatchedProvider : WatchedSyncAdapter {
    val providerId: TrackingProviderId
}

data class TrackingProgressSnapshot(
    val entries: List<WatchProgressEntry> = emptyList(),
    val hasLoadedRemoteProgress: Boolean = false,
    val errorMessage: String? = null,
)

/** Provider-owned projection and policy for remote playback progress. */
interface TrackingProgressProvider {
    val providerId: TrackingProviderId
    val changes: Flow<Unit>

    /** True when the provider projection already contains display-ready metadata. */
    val providesCompleteMetadata: Boolean
        get() = false

    /** True when completed progress is already reconciled into watched history by the provider. */
    val ownsCompletedHistoryProjection: Boolean
        get() = false

    fun ensureLoaded()
    fun onProfileChanged() = Unit
    fun clearLocalState() = Unit
    fun onActivated() = Unit
    suspend fun refresh(force: Boolean, sourceChanged: Boolean)
    fun snapshot(): TrackingProgressSnapshot
    suspend fun removeProgress(entries: Collection<WatchProgressEntry>)
    fun applyOptimisticRemoval(entries: Collection<WatchProgressEntry>) = Unit
    fun applyOptimisticProgress(entry: WatchProgressEntry) = Unit
    fun normalizeParentContentId(parentContentId: String, videoId: String?): String = parentContentId
    fun shouldRetainLocalEntry(entry: WatchProgressEntry): Boolean = true
    suspend fun refreshEpisodeProgress(contentId: String, forceRefresh: Boolean) = Unit
    fun isHiddenFromProgress(contentId: String): Boolean = false
}
