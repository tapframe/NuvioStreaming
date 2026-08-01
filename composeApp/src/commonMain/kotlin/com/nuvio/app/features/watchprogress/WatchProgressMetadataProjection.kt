package com.nuvio.app.features.watchprogress

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.tracking.WatchProgressSource
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized

internal data class WatchProgressMetadataKey(
    val metaId: String,
    val metaType: String,
)

internal fun WatchProgressEntry.metadataKey(): WatchProgressMetadataKey = WatchProgressMetadataKey(
    metaId = parentMetaId,
    metaType = parentMetaType.ifBlank { contentType },
)

internal fun enrichWatchProgressEntry(
    current: WatchProgressEntry,
    meta: MetaDetails,
): WatchProgressEntry {
    val episodeVideo = if (current.seasonNumber != null && current.episodeNumber != null) {
        meta.videos.firstOrNull { video ->
            video.season == current.seasonNumber && video.episode == current.episodeNumber
        }
    } else {
        null
    }
    return current.copy(
        videoId = if (current.source != WatchProgressSourceLocal && episodeVideo != null) {
            episodeVideo.id.takeIf(String::isNotBlank) ?: current.videoId
        } else {
            current.videoId
        },
        title = meta.name.takeIf(String::isNotBlank) ?: current.title,
        poster = meta.poster?.takeIf(String::isNotBlank) ?: current.poster,
        background = meta.background?.takeIf(String::isNotBlank) ?: current.background,
        logo = meta.logo?.takeIf(String::isNotBlank) ?: current.logo,
        episodeTitle = episodeVideo?.title?.takeIf(String::isNotBlank) ?: current.episodeTitle,
        episodeThumbnail = episodeVideo?.thumbnail?.takeIf(String::isNotBlank) ?: current.episodeThumbnail,
        pauseDescription = episodeVideo?.overview?.takeIf(String::isNotBlank)
            ?: meta.description?.takeIf(String::isNotBlank)
            ?: current.pauseDescription,
    )
}

internal fun WatchProgressEntry.needsRemoteMetadataEnrichment(): Boolean =
    title.isBlank() ||
        title.equals(parentMetaId, ignoreCase = true) ||
        poster.isNullOrBlank() ||
        background.isNullOrBlank()

internal class ProviderProgressMetadataOverlay {
    private val lock = SynchronizedObject()
    private var source: WatchProgressSource? = null
    private val metadataByKey = mutableMapOf<WatchProgressMetadataKey, MetaDetails>()

    fun clear() {
        synchronized(lock) {
            source = null
            metadataByKey.clear()
        }
    }

    fun put(
        source: WatchProgressSource,
        key: WatchProgressMetadataKey,
        metadata: MetaDetails,
    ): Boolean = synchronized(lock) {
        if (this.source != source) {
            this.source = source
            metadataByKey.clear()
        }
        val previous = metadataByKey.put(key, metadata)
        previous != metadata
    }

    fun project(
        source: WatchProgressSource,
        entries: Collection<WatchProgressEntry>,
    ): List<WatchProgressEntry> {
        val metadata = synchronized(lock) {
            if (this.source == source) metadataByKey.toMap() else emptyMap()
        }
        if (metadata.isEmpty()) return entries.toList()
        return entries.map { entry ->
            metadata[entry.metadataKey()]
                ?.let { meta -> enrichWatchProgressEntry(current = entry, meta = meta) }
                ?: entry
        }
    }
}
