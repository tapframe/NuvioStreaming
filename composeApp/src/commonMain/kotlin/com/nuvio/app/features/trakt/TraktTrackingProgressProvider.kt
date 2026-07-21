package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.features.tracking.TrackingProgressProvider
import com.nuvio.app.features.tracking.TrackingProgressSnapshot
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

object TraktTrackingProgressProvider : TrackingProgressProvider {
    private val log = Logger.withTag("TraktProgressPort")

    override val providerId: TrackingProviderId = TrackingProviderId.TRAKT
    override val changes: Flow<Unit> = TraktProgressRepository.uiState.map { Unit }
    override val providesCompleteMetadata: Boolean = true
    override val ownsCompletedHistoryProjection: Boolean = true

    override fun ensureLoaded() = TraktProgressRepository.ensureLoaded()

    override fun onProfileChanged() = TraktProgressRepository.onProfileChanged()

    override fun clearLocalState() = TraktProgressRepository.clearLocalState()

    override fun onActivated() = TraktProgressRepository.clearLocalState()

    override suspend fun refresh(force: Boolean, sourceChanged: Boolean) {
        if (force || sourceChanged) {
            TraktProgressRepository.invalidateAndRefresh()
        } else {
            TraktProgressRepository.refreshNow()
        }
    }

    override fun snapshot(): TrackingProgressSnapshot {
        val state = TraktProgressRepository.uiState.value
        return TrackingProgressSnapshot(
            entries = state.entries,
            hasLoadedRemoteProgress = state.hasLoadedRemoteProgress,
            errorMessage = state.errorMessage,
        )
    }

    override suspend fun removeProgress(entries: Collection<WatchProgressEntry>) {
        entries
            .filter { entry -> isTraktCompatibleId(entry.parentMetaId) }
            .distinctBy { entry -> Triple(entry.parentMetaId, entry.seasonNumber, entry.episodeNumber) }
            .forEach { entry ->
                try {
                    TraktProgressRepository.removeProgress(
                        contentId = entry.parentMetaId,
                        seasonNumber = entry.seasonNumber,
                        episodeNumber = entry.episodeNumber,
                    )
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    log.e(error) { "Failed to remove Trakt progress for ${entry.parentMetaId}" }
                }
            }
    }

    override fun applyOptimisticRemoval(entries: Collection<WatchProgressEntry>) {
        entries
            .distinctBy { entry -> Triple(entry.parentMetaId, entry.seasonNumber, entry.episodeNumber) }
            .forEach { entry ->
                TraktProgressRepository.applyOptimisticRemoval(
                    contentId = entry.parentMetaId,
                    seasonNumber = entry.seasonNumber,
                    episodeNumber = entry.episodeNumber,
                )
            }
    }

    override fun applyOptimisticProgress(entry: WatchProgressEntry) =
        TraktProgressRepository.applyOptimisticProgress(entry)

    override fun normalizeParentContentId(parentContentId: String, videoId: String?): String =
        resolveEffectiveContentId(parentContentId, videoId)

    override fun shouldRetainLocalEntry(entry: WatchProgressEntry): Boolean =
        !isTraktCompatibleId(entry.parentMetaId)

    override suspend fun refreshEpisodeProgress(contentId: String, forceRefresh: Boolean) =
        TraktProgressRepository.refreshEpisodeProgress(contentId, forceRefresh)

    override fun isHiddenFromProgress(contentId: String): Boolean =
        TraktProgressRepository.isShowHiddenFromProgress(contentId)
}
