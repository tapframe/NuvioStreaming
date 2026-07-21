package com.nuvio.app.features.simkl

import co.touchlab.kermit.Logger
import com.nuvio.app.features.library.LibraryItem
import com.nuvio.app.features.library.LibrarySection
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.tracking.TrackingHistoryItem
import com.nuvio.app.features.tracking.TrackingLibraryProvider
import com.nuvio.app.features.tracking.TrackingLibrarySnapshot
import com.nuvio.app.features.tracking.TrackingLibraryTab
import com.nuvio.app.features.tracking.TrackingLibraryTabKind
import com.nuvio.app.features.tracking.TrackingListStatus
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingWatchedProvider
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

data class SimklLibraryUiState(
    val items: List<LibraryItem> = emptyList(),
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val errorMessage: String? = null,
)

object SimklLibraryRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _uiState = MutableStateFlow(SimklLibraryUiState())
    val uiState: StateFlow<SimklLibraryUiState> = _uiState.asStateFlow()

    init {
        scope.launch {
            SimklSyncRepository.state.collectLatest(::publish)
        }
    }

    fun ensureLoaded() {
        SimklAuthRepository.ensureLoaded()
        SimklSyncRepository.ensureLoaded()
        publish(SimklSyncRepository.state.value)
    }

    suspend fun refreshNow() {
        SimklSyncRepository.refreshNow()
        publish(SimklSyncRepository.state.value)
    }

    fun isInWatchlist(contentId: String, contentType: String? = null): Boolean {
        ensureLoaded()
        return uiState.value.items.any { item ->
            item.id == contentId && (contentType == null || item.type.equals(contentType, ignoreCase = true))
        }
    }

    suspend fun setWatchlistMembership(
        profileId: Int,
        item: LibraryItem,
        isMember: Boolean,
    ) {
        if (profileId != ProfileRepository.activeProfileId) return
        ensureLoaded()
        val snapshot = SimklSyncRepository.state.value.snapshot
        val media = snapshot.mediaReference(
            contentId = item.id,
            contentType = item.type,
            title = item.name,
            releaseInfo = item.releaseInfo,
        )
        val result = if (isMember) {
            SimklMutationRepository.moveToList(
                profileId = profileId,
                items = listOf(media),
                destination = TrackingListStatus.PLAN_TO_WATCH,
            )
        } else {
            require(snapshot.canSafelyRemoveFromSimklWatchlist(item.id)) {
                "Removing this item from Simkl would also clear watched history or a rating"
            }
            SimklMutationRepository.removeFromList(profileId = profileId, items = listOf(media))
        }
        check(result.isComplete) {
            "Simkl could not match ${result.notFoundCount} of ${result.attemptedCount} library items"
        }
        refreshNow()
    }

    private fun publish(syncState: SimklSyncUiState) {
        _uiState.value = SimklLibraryUiState(
            items = syncState.snapshot.toSimklLibraryItems(),
            isLoading = syncState.isLoading,
            hasLoaded = syncState.hasLoaded,
            errorMessage = syncState.errorMessage,
        )
    }
}

object SimklTrackingLibraryProvider : TrackingLibraryProvider {
    override val providerId: TrackingProviderId = TrackingProviderId.SIMKL
    override val changes: Flow<Unit> = SimklLibraryRepository.uiState.map { Unit }

    override fun ensureLoaded() = SimklLibraryRepository.ensureLoaded()

    override suspend fun refresh() = SimklLibraryRepository.refreshNow()

    override fun snapshot(): TrackingLibrarySnapshot {
        val state = SimklLibraryRepository.uiState.value
        val items = state.items.sortedByDescending(LibraryItem::savedAtEpochMs)
        return TrackingLibrarySnapshot(
            items = items,
            sections = listOf(
                LibrarySection(
                    type = SIMKL_WATCHLIST_KEY,
                    displayTitle = SIMKL_WATCHLIST_TITLE,
                    items = items,
                ),
            ),
            tabs = listOf(
                TrackingLibraryTab(
                    key = SIMKL_WATCHLIST_KEY,
                    title = SIMKL_WATCHLIST_TITLE,
                    providerId = TrackingProviderId.SIMKL,
                    kind = TrackingLibraryTabKind.WATCHLIST,
                ),
            ),
            hasLoaded = state.hasLoaded,
            isLoading = state.isLoading,
            errorMessage = state.errorMessage,
        )
    }

    override fun contains(contentId: String, contentType: String?): Boolean =
        SimklLibraryRepository.isInWatchlist(contentId, contentType)

    override fun find(contentId: String): LibraryItem? =
        SimklLibraryRepository.uiState.value.items.firstOrNull { item -> item.id == contentId }

    override suspend fun membership(item: LibraryItem): Map<String, Boolean> =
        mapOf(SIMKL_WATCHLIST_KEY to SimklLibraryRepository.isInWatchlist(item.id, item.type))

    override suspend fun applyMembership(
        profileId: Int,
        item: LibraryItem,
        desiredMembership: Map<String, Boolean>,
    ) {
        val desired = desiredMembership[SIMKL_WATCHLIST_KEY] == true
        if (desired != SimklLibraryRepository.isInWatchlist(item.id, item.type)) {
            SimklLibraryRepository.setWatchlistMembership(
                profileId = profileId,
                item = item,
                isMember = desired,
            )
        }
    }

    override suspend fun toggleDefaultMembership(profileId: Int, item: LibraryItem) {
        SimklLibraryRepository.setWatchlistMembership(
            profileId = profileId,
            item = item,
            isMember = !SimklLibraryRepository.isInWatchlist(item.id, item.type),
        )
    }
}

object SimklWatchedSyncAdapter : TrackingWatchedProvider {
    override val providerId: TrackingProviderId = TrackingProviderId.SIMKL
    override suspend fun pull(profileId: Int, pageSize: Int): List<WatchedItem> {
        if (profileId != ProfileRepository.activeProfileId) return emptyList()
        SimklSyncRepository.ensureFresh()
        return SimklSyncRepository.state.value.snapshot.toSimklWatchedProjection().items
    }

    override suspend fun pullFullyWatchedSeriesKeys(profileId: Int): Set<String>? {
        if (profileId != ProfileRepository.activeProfileId) return null
        SimklSyncRepository.ensureFresh()
        return SimklSyncRepository.state.value.snapshot.toSimklWatchedProjection().fullyWatchedSeriesKeys
    }

    override suspend fun push(profileId: Int, items: Collection<WatchedItem>) {
        if (profileId != ProfileRepository.activeProfileId || items.isEmpty()) return
        SimklSyncRepository.ensureLoaded()
        val snapshot = SimklSyncRepository.state.value.snapshot
        val historyItems = items.map { item ->
            TrackingHistoryItem(
                media = snapshot.mediaReference(
                    contentId = item.id,
                    contentType = item.type,
                    title = item.name,
                    releaseInfo = item.releaseInfo,
                    season = item.season,
                    episode = item.episode,
                ),
                watchedAtEpochMs = item.markedAtEpochMs,
            )
        }
        val result = SimklMutationRepository.addToHistory(profileId = profileId, items = historyItems)
        check(result.isComplete) {
            "Simkl could not match ${result.notFoundCount} of ${result.attemptedCount} watched items"
        }
    }

    override suspend fun delete(profileId: Int, items: Collection<WatchedItem>) {
        if (profileId != ProfileRepository.activeProfileId || items.isEmpty()) return
        SimklSyncRepository.ensureLoaded()
        val snapshot = SimklSyncRepository.state.value.snapshot
        val media = items.map { item ->
            snapshot.mediaReference(
                contentId = item.id,
                contentType = item.type,
                title = item.name,
                releaseInfo = item.releaseInfo,
                season = item.season,
                episode = item.episode,
            )
        }
        val result = SimklMutationRepository.removeFromHistory(profileId = profileId, items = media)
        check(result.isComplete) {
            "Simkl could not match ${result.notFoundCount} of ${result.attemptedCount} watched items"
        }
    }
}

data class SimklProgressUiState(
    val entries: List<WatchProgressEntry> = emptyList(),
    val isLoading: Boolean = false,
    val hasLoadedRemoteProgress: Boolean = false,
    val errorMessage: String? = null,
)

object SimklProgressRepository {
    private val log = Logger.withTag("SimklProgress")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _uiState = MutableStateFlow(SimklProgressUiState())
    val uiState: StateFlow<SimklProgressUiState> = _uiState.asStateFlow()

    init {
        scope.launch {
            SimklSyncRepository.state.collectLatest(::publish)
        }
    }

    fun ensureLoaded() {
        SimklAuthRepository.ensureLoaded()
        SimklSyncRepository.ensureLoaded()
        publish(SimklSyncRepository.state.value)
    }

    suspend fun refreshNow() {
        SimklSyncRepository.refreshNow()
        publish(SimklSyncRepository.state.value)
    }

    suspend fun removeProgress(entries: Collection<WatchProgressEntry>) {
        val sessionIds = entries.mapNotNullTo(linkedSetOf()) { entry ->
            entry.progressKey
                ?.removePrefix(SIMKL_PLAYBACK_PROGRESS_KEY_PREFIX)
                ?.takeIf { entry.progressKey.startsWith(SIMKL_PLAYBACK_PROGRESS_KEY_PREFIX) }
                ?.toLongOrNull()
                ?.takeIf { it > 0L }
        }
        if (sessionIds.isEmpty()) return

        val removed = linkedSetOf<Long>()
        for (sessionId in sessionIds) {
            try {
                SimklApi.client.execute(
                    SimklApiRequest(
                        method = SimklHttpMethod.DELETE,
                        path = "/sync/playback/$sessionId",
                    ),
                )
                removed += sessionId
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w { "Failed to remove Simkl playback $sessionId: ${error.message}" }
            }
        }
        SimklSyncRepository.commitPlaybackRemoval(removed)
        if (removed.isNotEmpty()) SimklSyncRepository.refreshAsync()
    }

    private fun publish(syncState: SimklSyncUiState) {
        _uiState.value = SimklProgressUiState(
            entries = syncState.snapshot.toSimklProgressEntries(),
            isLoading = syncState.isLoading,
            hasLoadedRemoteProgress = syncState.hasLoaded && syncState.errorMessage == null,
            errorMessage = syncState.errorMessage,
        )
    }
}

private fun SimklSyncSnapshot.canSafelyRemoveFromSimklWatchlist(contentId: String): Boolean =
    entries.firstOrNull { entry -> entry.media?.canonicalContentId().equals(contentId, ignoreCase = true) }
        ?.let { entry ->
            entry.status == SimklListStatus.PLAN_TO_WATCH &&
                entry.lastWatchedAt == null &&
                entry.userRating == null &&
                entry.seasons.none { season -> season.episodes.any { episode -> episode.watchedAt != null } }
        }
        ?: true

private const val SIMKL_PLAYBACK_PROGRESS_KEY_PREFIX = "simkl-playback:"
