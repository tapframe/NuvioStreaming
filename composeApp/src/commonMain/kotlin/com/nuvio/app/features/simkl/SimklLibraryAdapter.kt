package com.nuvio.app.features.simkl

import com.nuvio.app.features.library.LibraryItem
import com.nuvio.app.features.library.LibrarySection
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.tracking.TrackingLibraryProvider
import com.nuvio.app.features.tracking.TrackingLibrarySnapshot
import com.nuvio.app.features.tracking.TrackingLibraryTab
import com.nuvio.app.features.tracking.TrackingLibraryTabKind
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingRefreshIntent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

data class SimklLibraryUiState(
    val items: List<LibraryItem> = emptyList(),
    val sections: List<LibrarySection> = emptyList(),
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

    suspend fun refresh(intent: TrackingRefreshIntent) {
        SimklSyncRepository.refresh(intent)
        publish(SimklSyncRepository.state.value)
    }

    fun isTracked(contentId: String, contentType: String? = null): Boolean {
        ensureLoaded()
        return findItem(contentId, contentType) != null
    }

    fun statusMembership(contentId: String, contentType: String? = null): Map<String, Boolean> {
        ensureLoaded()
        val listKeys = findItem(contentId, contentType)?.listKeys.orEmpty()
        return simklLibraryStatusDefinitions.associate { definition ->
            definition.key to (definition.key in listKeys)
        }
    }

    suspend fun applyStatusMembership(
        profileId: Int,
        item: LibraryItem,
        desiredMembership: Map<String, Boolean>,
    ) {
        if (profileId != ProfileRepository.activeProfileId) return
        ensureLoaded()
        val desiredStatuses = simklLibraryStatusDefinitions.filter { definition ->
            desiredMembership[definition.key] == true
        }
        require(desiredStatuses.size <= 1) { "A Simkl item can have only one list status" }
        val desiredStatus = desiredStatuses.singleOrNull()
        require(desiredStatus == null || desiredStatus.supportedContentTypes.any { supported ->
            supported.equals(item.type, ignoreCase = true)
        }) { "${desiredStatus?.title} does not support ${item.type}" }
        val currentStatus = findItem(item.id, item.type)?.listKeys.orEmpty()
            .firstNotNullOfOrNull(::simklLibraryStatusDefinition)
        if (desiredStatus == currentStatus) return

        val snapshot = SimklSyncRepository.state.value.snapshot
        val media = snapshot.mediaReference(
            contentId = item.id,
            contentType = item.type,
            title = item.name,
            releaseInfo = item.releaseInfo,
        )
        val result = when {
            desiredStatus != null -> SimklMutationRepository.moveToList(
                profileId = profileId,
                items = listOf(media),
                destination = desiredStatus.trackingStatus,
            )

            currentStatus != null -> {
                require(snapshot.canSafelyRemoveFromSimklLibrary(item.id)) {
                    "Removing this item from Simkl would also clear watched history or a rating"
                }
                SimklMutationRepository.removeFromList(profileId = profileId, items = listOf(media))
            }

            else -> return
        }
        check(result.isComplete) {
            "Simkl could not match ${result.notFoundCount} of ${result.attemptedCount} library items"
        }
        refresh(TrackingRefreshIntent.INVALIDATED)
    }

    private fun publish(syncState: SimklSyncUiState) {
        val projection = syncState.snapshot.toSimklLibraryProjection()
        _uiState.value = SimklLibraryUiState(
            items = projection.items,
            sections = projection.sections,
            isLoading = syncState.isLoading,
            hasLoaded = syncState.hasLoaded,
            errorMessage = syncState.errorMessage,
        )
    }

    private fun findItem(contentId: String, contentType: String?): LibraryItem? =
        uiState.value.items.firstOrNull { item ->
            item.id.equals(contentId, ignoreCase = true) &&
                (contentType == null || item.type.equals(contentType, ignoreCase = true))
        }
}

object SimklTrackingLibraryProvider : TrackingLibraryProvider {
    override val providerId: TrackingProviderId = TrackingProviderId.SIMKL
    override val changes: Flow<Unit> = SimklLibraryRepository.uiState.map { Unit }

    override fun ensureLoaded() = SimklLibraryRepository.ensureLoaded()

    override fun onProfileChanged() = SimklLibraryRepository.ensureLoaded()

    override suspend fun refresh(intent: TrackingRefreshIntent) =
        SimklLibraryRepository.refresh(intent)

    override fun snapshot(): TrackingLibrarySnapshot {
        val state = SimklLibraryRepository.uiState.value
        return TrackingLibrarySnapshot(
            items = state.items.sortedByDescending(LibraryItem::savedAtEpochMs),
            sections = state.sections,
            tabs = simklLibraryStatusDefinitions.map { definition ->
                TrackingLibraryTab(
                    key = definition.key,
                    title = definition.title,
                    providerId = TrackingProviderId.SIMKL,
                    kind = if (definition.status == SimklListStatus.PLAN_TO_WATCH) {
                        TrackingLibraryTabKind.WATCHLIST
                    } else {
                        TrackingLibraryTabKind.STATUS
                    },
                    selectionGroup = SIMKL_STATUS_SELECTION_GROUP,
                    supportedContentTypes = definition.supportedContentTypes,
                )
            },
            hasLoaded = state.hasLoaded,
            isLoading = state.isLoading,
            errorMessage = state.errorMessage,
        )
    }

    override fun contains(contentId: String, contentType: String?): Boolean =
        SimklLibraryRepository.isTracked(contentId, contentType)

    override fun find(contentId: String): LibraryItem? =
        SimklLibraryRepository.uiState.value.items.firstOrNull { item ->
            item.id.equals(contentId, ignoreCase = true)
        }

    override suspend fun membership(item: LibraryItem): Map<String, Boolean> =
        SimklLibraryRepository.statusMembership(item.id, item.type)

    override suspend fun applyMembership(
        profileId: Int,
        item: LibraryItem,
        desiredMembership: Map<String, Boolean>,
    ) {
        SimklLibraryRepository.applyStatusMembership(
            profileId = profileId,
            item = item,
            desiredMembership = desiredMembership,
        )
    }

    override suspend fun toggleDefaultMembership(profileId: Int, item: LibraryItem) {
        val current = SimklLibraryRepository.statusMembership(item.id, item.type)
        val desired = current.mapValues { false }.toMutableMap()
        if (current.values.none { isSelected -> isSelected }) {
            desired[simklLibraryStatusDefinitions.single { definition ->
                definition.status == SimklListStatus.PLAN_TO_WATCH
            }.key] = true
        }
        SimklLibraryRepository.applyStatusMembership(
            profileId = profileId,
            item = item,
            desiredMembership = desired,
        )
    }
}

private fun SimklSyncSnapshot.canSafelyRemoveFromSimklLibrary(contentId: String): Boolean =
    entries.firstOrNull { entry -> entry.media?.canonicalContentId().equals(contentId, ignoreCase = true) }
        ?.let { entry ->
            entry.status == SimklListStatus.PLAN_TO_WATCH &&
                entry.lastWatchedAt == null &&
                entry.userRating == null &&
                entry.seasons.none { season -> season.episodes.any { episode -> episode.watchedAt != null } }
        }
        ?: true
