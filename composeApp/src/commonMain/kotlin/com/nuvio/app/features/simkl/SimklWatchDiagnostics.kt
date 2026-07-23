package com.nuvio.app.features.simkl

import co.touchlab.kermit.Logger
import com.nuvio.app.features.tracking.TrackingRefreshIntent

internal enum class SimklRefreshOrigin {
    AUTHORIZATION,
    LIBRARY,
    MANUAL_SYNC,
    MUTATION,
    PLAYBACK_REMOVAL,
    PROGRESS,
    UNKNOWN,
    WATCHED_ITEMS,
    WATCHED_SERIES,
}

internal object SimklWatchDiagnostics {
    private val log = Logger.withTag("SimklDiag")

    fun logSnapshot(
        stage: String,
        snapshot: SimklSyncSnapshot,
    ) {
        val entries = snapshot.entries
        val episodeRows = entries.sumOf { entry ->
            entry.seasons.sumOf { season -> season.episodes.size }
        }
        val exactWatchedEpisodeRows = entries.sumOf { entry ->
            entry.seasons.sumOf { season ->
                season.episodes.count { episode -> !episode.watchedAt.isNullOrBlank() }
            }
        }
        log.d {
            "snapshot stage=$stage initialized=${snapshot.isInitialized} entries=${entries.size} " +
                "movies=${entries.count { it.mediaType == SimklMediaType.MOVIES }} " +
                "shows=${entries.count { it.mediaType == SimklMediaType.SHOWS }} " +
                "anime=${entries.count { it.mediaType == SimklMediaType.ANIME }} " +
                "completedMovies=${entries.count { it.mediaType == SimklMediaType.MOVIES && it.status == SimklListStatus.COMPLETED }} " +
                "completedSeries=${entries.count { it.mediaType != SimklMediaType.MOVIES && it.status == SimklListStatus.COMPLETED }} " +
                "aggregateWatchedEntries=${entries.count { it.watchedEpisodesCount > 0 }} " +
                "aggregateWatchedEpisodes=${entries.sumOf { it.watchedEpisodesCount }} " +
                "episodeRows=$episodeRows exactWatchedEpisodeRows=$exactWatchedEpisodeRows " +
                "playbackMovies=${snapshot.playback.count { it.mediaType == SimklMediaType.MOVIES }} " +
                "playbackEpisodes=${snapshot.playback.count { it.mediaType != SimklMediaType.MOVIES }} " +
                "missingCanonicalIds=${entries.count { it.media?.canonicalContentId() == null }} " +
                "hasWatermark=${snapshot.watermark != null} hasLastChecked=${snapshot.lastCheckedAtEpochMs != null}"
        }
    }

    fun logRefreshRequest(
        requestId: Long,
        origin: SimklRefreshOrigin,
        intent: TrackingRefreshIntent,
        profileId: Int,
        profileGeneration: Long,
        authenticated: Boolean,
        snapshot: SimklSyncSnapshot,
        errorMessage: String?,
    ) {
        log.i {
            "refresh request id=$requestId origin=$origin intent=$intent profile=$profileId " +
                "generation=$profileGeneration authenticated=$authenticated " +
                "initialized=${snapshot.isInitialized} hasLastChecked=${snapshot.lastCheckedAtEpochMs != null} " +
                "hasWatermark=${snapshot.watermark != null} hasError=${errorMessage != null}"
        }
    }

    fun logRefreshDecision(
        requestId: Long,
        origin: SimklRefreshOrigin,
        intent: TrackingRefreshIntent,
        nowEpochMs: Long,
        lastCheckedAtEpochMs: Long?,
        authenticated: Boolean,
        hasError: Boolean,
        eligible: Boolean,
    ) {
        log.i {
            "refresh decision id=$requestId origin=$origin intent=$intent eligible=$eligible " +
                "authenticated=$authenticated " +
                "hasError=$hasError " +
                "elapsedMs=${lastCheckedAtEpochMs?.let { nowEpochMs - it }}"
        }
    }

    fun logRefreshCompletion(
        requestId: Long,
        origin: SimklRefreshOrigin,
        intent: TrackingRefreshIntent,
        outcome: SimklRefreshGateOutcome,
        before: SimklSyncUiState,
        after: SimklSyncUiState,
    ) {
        log.i {
            "refresh completion id=$requestId origin=$origin intent=$intent outcome=$outcome " +
                "checkedChanged=" +
                "${before.snapshot.lastCheckedAtEpochMs != after.snapshot.lastCheckedAtEpochMs} " +
                "watermarkChanged=${before.snapshot.watermark != after.snapshot.watermark} " +
                "entriesBefore=${before.snapshot.entries.size} entriesAfter=${after.snapshot.entries.size} " +
                "playbackBefore=${before.snapshot.playback.size} playbackAfter=${after.snapshot.playback.size} " +
                "loading=${after.isLoading} hasLoaded=${after.hasLoaded} hasError=${after.errorMessage != null}"
        }
    }

    fun logProjection(
        stage: String,
        snapshot: SimklSyncSnapshot,
        projection: SimklWatchedProjection,
    ) {
        val items = projection.items
        log.d {
            "watched projection stage=$stage inputEntries=${snapshot.entries.size} " +
                "inputExactEpisodeRows=${snapshot.exactWatchedEpisodeRowCount()} " +
                "outputItems=${items.size} outputMovies=${items.count { it.type == "movie" }} " +
                "outputEpisodes=${items.count { it.season != null && it.episode != null }} " +
                "outputSeriesSummaries=${items.count { it.type == "series" && it.season == null }} " +
                "fullyWatchedSeries=${projection.fullyWatchedSeriesKeys.size}"
        }
    }
}

private fun SimklSyncSnapshot.exactWatchedEpisodeRowCount(): Int = entries.sumOf { entry ->
    entry.seasons.sumOf { season ->
        season.episodes.count { episode -> !episode.watchedAt.isNullOrBlank() }
    }
}
