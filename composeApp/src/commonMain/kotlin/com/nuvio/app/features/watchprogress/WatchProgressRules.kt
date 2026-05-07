package com.nuvio.app.features.watchprogress

import com.nuvio.app.features.watching.domain.DefaultContinueWatchingLimit
import com.nuvio.app.features.watching.domain.WatchingContentRef
import com.nuvio.app.features.watching.domain.WatchingProgressRecord
import com.nuvio.app.features.watching.domain.continueWatchingProgressEntries
import com.nuvio.app.features.watching.domain.isProgressComplete
import com.nuvio.app.features.watching.domain.resumeProgressForSeries
import com.nuvio.app.features.watching.domain.shouldStoreProgress
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal const val ContinueWatchingLimit = DefaultContinueWatchingLimit

@Serializable
private data class StoredWatchProgressPayload(
    val entries: List<WatchProgressEntry> = emptyList(),
)

internal object WatchProgressCodec {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun decodeEntries(payload: String): List<WatchProgressEntry> =
        runCatching {
            json.decodeFromString<StoredWatchProgressPayload>(payload).entries
                .map(WatchProgressEntry::normalizedCompletion)
        }.getOrDefault(emptyList())

    fun encodeEntries(entries: Collection<WatchProgressEntry>): String =
        json.encodeToString(
            StoredWatchProgressPayload(
                entries = entries.toList().sortedByDescending { it.lastUpdatedEpochMs },
            ),
        )
}

internal fun shouldStoreWatchProgress(
    positionMs: Long,
    durationMs: Long,
): Boolean = shouldStoreProgress(positionMs = positionMs, durationMs = durationMs)

internal fun isWatchProgressComplete(
    positionMs: Long,
    durationMs: Long,
    isEnded: Boolean,
): Boolean = isProgressComplete(
    positionMs = positionMs,
    durationMs = durationMs,
    isEnded = isEnded,
)

internal fun List<WatchProgressEntry>.resumeEntryForSeries(metaId: String): WatchProgressEntry? =
    firstOrNull { entry -> entry.parentMetaId == metaId }?.let { seed ->
        resumeProgressForSeries(
            content = WatchingContentRef(type = seed.parentMetaType, id = metaId),
            progressRecords = map(WatchProgressEntry::toDomainProgressRecord),
        )?.let { record ->
            firstOrNull { entry -> entry.videoId == record.videoId }
        }
    }

internal fun List<WatchProgressEntry>.continueWatchingEntries(
    limit: Int = ContinueWatchingLimit,
): List<WatchProgressEntry> {
    val inProgressEntries = filter { entry -> entry.shouldTreatAsInProgressForContinueWatching() }
    val domainEntries = continueWatchingProgressEntries(
        progressRecords = inProgressEntries.map(WatchProgressEntry::toDomainProgressRecord),
        limit = limit,
    )
    val ids = domainEntries.map { record -> record.videoId }.toSet()
    return inProgressEntries.filter { entry -> entry.videoId in ids }
        .sortedByDescending { it.lastUpdatedEpochMs }
}

internal fun WatchProgressEntry.shouldTreatAsInProgressForContinueWatching(): Boolean {
    val entry = normalizedCompletion()
    if (entry.isEffectivelyCompleted) return false

    val hasStartedPlayback = entry.lastPositionMs > 0L ||
        entry.normalizedProgressPercent?.let { it > 0f } == true
    if (!hasStartedPlayback) return false

    return entry.source != WatchProgressSourceTraktHistory &&
        entry.source != WatchProgressSourceTraktShowProgress
}

internal fun WatchProgressEntry.shouldUseAsCompletedSeedForContinueWatching(): Boolean {
    val entry = normalizedCompletion()
    if (isMalformedNextUpSeedContentId(entry.parentMetaId)) return false
    if (!entry.isEffectivelyCompleted) return false
    if (entry.source != WatchProgressSourceTraktPlayback) return true

    val explicitPercent = entry.normalizedProgressPercent ?: return false
    return explicitPercent >= WatchProgressTraktPlaybackNextUpSeedPercentThreshold
}

internal fun String?.isSeriesTypeForContinueWatching(): Boolean =
    equals("series", ignoreCase = true) || equals("tv", ignoreCase = true)

internal fun isMalformedNextUpSeedContentId(contentId: String?): Boolean {
    val trimmed = contentId?.trim().orEmpty()
    if (trimmed.isEmpty()) return true
    return when (trimmed.lowercase()) {
        "tmdb", "imdb", "trakt", "tmdb:", "imdb:", "trakt:" -> true
        else -> false
    }
}

private fun WatchProgressEntry.toDomainProgressRecord(): WatchingProgressRecord =
    normalizedCompletion().let { entry ->
        WatchingProgressRecord(
        content = WatchingContentRef(
            type = entry.parentMetaType,
            id = entry.parentMetaId,
        ),
        videoId = entry.videoId,
        seasonNumber = entry.seasonNumber,
        episodeNumber = entry.episodeNumber,
        lastUpdatedEpochMs = entry.lastUpdatedEpochMs,
        lastPositionMs = entry.lastPositionMs,
        isCompleted = entry.isCompleted,
        episodeTitle = entry.episodeTitle,
        episodeThumbnail = entry.episodeThumbnail,
    )
    }
