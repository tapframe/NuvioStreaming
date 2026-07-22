package com.nuvio.app.features.simkl

import co.touchlab.kermit.Logger
import com.nuvio.app.features.tracking.TrackingRefreshIntent
import com.nuvio.app.features.watched.watchedItemKey

internal object SimklWatchDiagnostics {
    private const val SAMPLE_LIMIT = 10
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
        val entrySamples = entries
            .asSequence()
            .filter { entry ->
                entry.status == SimklListStatus.COMPLETED ||
                    entry.watchedEpisodesCount > 0 ||
                    entry.seasons.isNotEmpty()
            }
            .take(SAMPLE_LIMIT)
            .joinToString(separator = ",") { entry ->
                val exactRows = entry.seasons.sumOf { season ->
                    season.episodes.count { episode -> !episode.watchedAt.isNullOrBlank() }
                }
                "${entry.mediaType.apiValue}:${entry.media?.canonicalContentId() ?: "missing"}:" +
                    "${entry.status?.apiValue ?: "none"}:" +
                    "${entry.watchedEpisodesCount}/${entry.totalEpisodesCount}:exact=$exactRows"
            }

        log.i {
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
                "watermark=${snapshot.watermark} lastChecked=${snapshot.lastCheckedAtEpochMs} " +
                "samples=[$entrySamples]"
        }
    }

    fun logRefreshRequest(
        intent: TrackingRefreshIntent,
        profileGeneration: Long,
        authenticated: Boolean,
        snapshot: SimklSyncSnapshot,
        errorMessage: String?,
    ) {
        log.i {
            "refresh request intent=$intent generation=$profileGeneration authenticated=$authenticated " +
                "initialized=${snapshot.isInitialized} lastChecked=${snapshot.lastCheckedAtEpochMs} " +
                "watermark=${snapshot.watermark} hasError=${errorMessage != null}"
        }
    }

    fun logRefreshDecision(
        intent: TrackingRefreshIntent,
        nowEpochMs: Long,
        lastCheckedAtEpochMs: Long?,
        authenticated: Boolean,
        hasError: Boolean,
        eligible: Boolean,
    ) {
        log.i {
            "refresh decision intent=$intent eligible=$eligible authenticated=$authenticated " +
                "hasError=$hasError now=$nowEpochMs lastChecked=$lastCheckedAtEpochMs " +
                "elapsedMs=${lastCheckedAtEpochMs?.let { nowEpochMs - it }}"
        }
    }

    fun logRefreshCompletion(
        intent: TrackingRefreshIntent,
        before: SimklSyncUiState,
        after: SimklSyncUiState,
    ) {
        log.i {
            "refresh completion intent=$intent checkedBefore=${before.snapshot.lastCheckedAtEpochMs} " +
                "checkedAfter=${after.snapshot.lastCheckedAtEpochMs} " +
                "watermarkBefore=${before.snapshot.watermark} watermarkAfter=${after.snapshot.watermark} " +
                "entriesBefore=${before.snapshot.entries.size} entriesAfter=${after.snapshot.entries.size} " +
                "playbackBefore=${before.snapshot.playback.size} playbackAfter=${after.snapshot.playback.size} " +
                "loading=${after.isLoading} hasLoaded=${after.hasLoaded} error=${after.errorMessage}"
        }
    }

    fun logProjection(
        stage: String,
        profileId: Int,
        snapshot: SimklSyncSnapshot,
        projection: SimklWatchedProjection,
    ) {
        val items = projection.items
        val itemSamples = items
            .asSequence()
            .take(SAMPLE_LIMIT)
            .joinToString(separator = ",") { item ->
                watchedItemKey(item.type, item.id, item.season, item.episode)
            }
        val fullyWatchedSamples = projection.fullyWatchedSeriesKeys
            .asSequence()
            .take(SAMPLE_LIMIT)
            .joinToString(separator = ",")

        log.i {
            "watched projection stage=$stage profile=$profileId inputEntries=${snapshot.entries.size} " +
                "inputExactEpisodeRows=${snapshot.exactWatchedEpisodeRowCount()} " +
                "outputItems=${items.size} outputMovies=${items.count { it.type == "movie" }} " +
                "outputEpisodes=${items.count { it.season != null && it.episode != null }} " +
                "outputSeriesSummaries=${items.count { it.type == "series" && it.season == null }} " +
                "fullyWatchedSeries=${projection.fullyWatchedSeriesKeys.size} " +
                "itemKeys=[$itemSamples] fullyWatchedKeys=[$fullyWatchedSamples]"
        }
    }
}

private fun SimklSyncSnapshot.exactWatchedEpisodeRowCount(): Int = entries.sumOf { entry ->
    entry.seasons.sumOf { season ->
        season.episodes.count { episode -> !episode.watchedAt.isNullOrBlank() }
    }
}
