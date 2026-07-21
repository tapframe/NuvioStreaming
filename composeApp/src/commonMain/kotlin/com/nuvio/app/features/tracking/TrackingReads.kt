package com.nuvio.app.features.tracking

import com.nuvio.app.features.library.LibraryItem
import com.nuvio.app.features.library.LibrarySection
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
