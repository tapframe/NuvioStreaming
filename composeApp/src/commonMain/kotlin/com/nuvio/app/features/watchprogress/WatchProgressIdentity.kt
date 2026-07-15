package com.nuvio.app.features.watchprogress

import com.nuvio.app.features.watching.sync.ProgressDeltaEvent
import com.nuvio.app.features.watching.sync.ProgressSyncRecord

/**
 * Stable storage/sync identity for a progress row.
 *
 * [WatchProgressEntry.videoId] identifies the playable video and is not unique
 * across metadata aliases. The server's progress key identifies the logical
 * row and must therefore be used for snapshot merges and delta deletes.
 */
internal fun buildWatchProgressKey(
    contentId: String,
    seasonNumber: Int?,
    episodeNumber: Int?,
): String =
    if (seasonNumber != null && episodeNumber != null) {
        "${contentId}_s${seasonNumber}e${episodeNumber}"
    } else {
        contentId
    }

internal fun WatchProgressEntry.resolvedProgressKey(): String =
    progressKey
        ?.takeIf(String::isNotBlank)
        ?: buildWatchProgressKey(
            contentId = parentMetaId,
            seasonNumber = seasonNumber,
            episodeNumber = episodeNumber,
        )

internal fun WatchProgressEntry.withResolvedProgressKey(): WatchProgressEntry {
    val resolved = resolvedProgressKey()
    return if (progressKey == resolved) this else copy(progressKey = resolved)
}

internal fun ProgressSyncRecord.resolvedProgressKey(): String =
    progressKey.takeIf(String::isNotBlank) ?: run {
        buildWatchProgressKey(
            contentId = contentId,
            seasonNumber = season,
            episodeNumber = episode,
        )
    }

internal fun ProgressDeltaEvent.resolvedProgressKey(): String =
    progressKey.takeIf(String::isNotBlank) ?: run {
        buildWatchProgressKey(
            contentId = contentId,
            seasonNumber = season,
            episodeNumber = episode,
        )
    }

internal val watchProgressEntryFreshnessComparator: Comparator<WatchProgressEntry> =
    compareBy<WatchProgressEntry> { entry -> entry.lastUpdatedEpochMs }
        .thenBy { entry -> entry.lastPositionMs }
        .thenBy { entry -> entry.durationMs }
        .thenBy { entry -> entry.videoId }
        .thenBy { entry -> entry.parentMetaId }
        .thenBy { entry -> entry.contentType }
        .thenBy { entry -> entry.seasonNumber ?: Int.MIN_VALUE }
        .thenBy { entry -> entry.episodeNumber ?: Int.MIN_VALUE }
        .thenBy(WatchProgressEntry::isCompleted)
        .thenBy { entry -> entry.normalizedProgressPercent ?: Float.NEGATIVE_INFINITY }
        .thenBy(WatchProgressEntry::source)
        .thenBy(WatchProgressEntry::parentMetaType)
        .thenBy(WatchProgressEntry::title)
        .thenBy { entry -> entry.logo.orEmpty() }
        .thenBy { entry -> entry.poster.orEmpty() }
        .thenBy { entry -> entry.background.orEmpty() }
        .thenBy { entry -> entry.episodeTitle.orEmpty() }
        .thenBy { entry -> entry.episodeThumbnail.orEmpty() }
        .thenBy { entry -> entry.providerName.orEmpty() }
        .thenBy { entry -> entry.providerAddonId.orEmpty() }
        .thenBy { entry -> entry.lastStreamTitle.orEmpty() }
        .thenBy { entry -> entry.lastStreamSubtitle.orEmpty() }
        .thenBy { entry -> entry.pauseDescription.orEmpty() }
        .thenBy { entry -> entry.lastSourceUrl.orEmpty() }
        .thenBy { entry -> entry.progressKey.orEmpty() }

internal fun WatchProgressEntry.isFresherThan(other: WatchProgressEntry): Boolean =
    watchProgressEntryFreshnessComparator.compare(this, other) > 0

/** Keeps one newest row per logical progress key, independent of input order. */
internal fun Collection<WatchProgressEntry>.newestByProgressKey(): Map<String, WatchProgressEntry> {
    val result = linkedMapOf<String, WatchProgressEntry>()
    forEach { rawEntry ->
        val entry = rawEntry.withResolvedProgressKey()
        val key = entry.resolvedProgressKey()
        val existing = result[key]
        if (existing == null || entry.isFresherThan(existing)) {
            result[key] = entry
        }
    }
    return result
}

/**
 * Reuses an existing opaque server key when playback updates the same logical
 * content row. Exact playback-id matches win; freshness breaks remaining ties.
 */
internal fun Collection<WatchProgressEntry>.resolveIdentityForUpsert(
    candidate: WatchProgressEntry,
): WatchProgressEntry {
    val logicalMatches = filter { existing ->
        existing.parentMetaId == candidate.parentMetaId &&
            existing.seasonNumber == candidate.seasonNumber &&
            existing.episodeNumber == candidate.episodeNumber
    }
    val existing = logicalMatches
        .filter { entry -> entry.videoId == candidate.videoId }
        .maxWithOrNull(watchProgressEntryFreshnessComparator)
        ?: logicalMatches.maxWithOrNull(watchProgressEntryFreshnessComparator)
    val progressKey = existing?.resolvedProgressKey() ?: candidate.resolvedProgressKey()
    return candidate.copy(progressKey = progressKey)
}

internal fun Collection<WatchProgressEntry>.resolveProgressForVideo(
    videoId: String,
    parentMetaId: String? = null,
    seasonNumber: Int? = null,
    episodeNumber: Int? = null,
): WatchProgressEntry? {
    val candidates = asSequence()
        .filter { entry -> entry.videoId == videoId }
        .filter { entry -> parentMetaId == null || entry.parentMetaId == parentMetaId }
        .filter { entry -> seasonNumber == null || entry.seasonNumber == seasonNumber }
        .filter { entry -> episodeNumber == null || entry.episodeNumber == episodeNumber }
        .toList()
    if (candidates.isEmpty()) return null
    val logicalIdentities = candidates.mapTo(mutableSetOf()) { entry ->
        Triple(entry.parentMetaId, entry.seasonNumber, entry.episodeNumber)
    }
    if (logicalIdentities.size > 1) return null
    return candidates.maxWithOrNull(watchProgressEntryFreshnessComparator)
}

internal data class WatchProgressIdentityReconciliation(
    val entries: List<WatchProgressEntry>,
    val migratedKeys: Map<String, String>,
)

/**
 * Migrates a legacy synthetic local key to the server's sole opaque key for
 * the same logical content row. Exact keys always win, and ambiguous server
 * identities are intentionally left untouched.
 */
internal fun reconcileLocalProgressKeysWithSnapshot(
    serverEntries: Collection<ProgressSyncRecord>,
    localEntries: Collection<WatchProgressEntry>,
): WatchProgressIdentityReconciliation {
    val serverKeys = serverEntries.mapTo(mutableSetOf(), ProgressSyncRecord::resolvedProgressKey)
    val uniqueServerKeyByLogicalIdentity = serverEntries
        .groupBy { record ->
            Triple(record.contentId, record.season, record.episode)
        }
        .mapNotNull { (identity, records) ->
            records.map(ProgressSyncRecord::resolvedProgressKey)
                .distinct()
                .singleOrNull()
                ?.let { key -> identity to key }
        }
        .toMap()
    val migrations = linkedMapOf<String, String>()
    val reconciled = localEntries.map { entry ->
        val localKey = entry.resolvedProgressKey()
        if (localKey in serverKeys) return@map entry

        val syntheticKey = buildWatchProgressKey(
            contentId = entry.parentMetaId,
            seasonNumber = entry.seasonNumber,
            episodeNumber = entry.episodeNumber,
        )
        val serverKey = uniqueServerKeyByLogicalIdentity[
            Triple(entry.parentMetaId, entry.seasonNumber, entry.episodeNumber)
        ]
        if (localKey == syntheticKey && serverKey != null && serverKey != localKey) {
            migrations[localKey] = serverKey
            entry.copy(progressKey = serverKey)
        } else {
            entry
        }
    }
    return WatchProgressIdentityReconciliation(
        entries = reconciled,
        migratedKeys = migrations,
    )
}
