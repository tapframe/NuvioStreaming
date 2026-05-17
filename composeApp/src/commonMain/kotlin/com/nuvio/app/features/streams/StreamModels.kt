package com.nuvio.app.features.streams

import kotlinx.coroutines.runBlocking
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString

data class StreamItem(
    val name: String? = null,
    val title: String? = null,
    val description: String? = null,
    val url: String? = null,
    val infoHash: String? = null,
    val fileIdx: Int? = null,
    val externalUrl: String? = null,
    val sources: List<String> = emptyList(),
    val sourceName: String? = null,
    val addonName: String,
    val addonId: String,
    val behaviorHints: StreamBehaviorHints = StreamBehaviorHints(),
    val clientResolve: StreamClientResolve? = null,
) {
    val streamLabel: String
        get() = name ?: runBlocking { getString(Res.string.stream_default_name) }

    val streamSubtitle: String?
        get() = description

    val directPlaybackUrl: String?
        get() = url ?: externalUrl

    val isDirectDebridStream: Boolean
        get() = clientResolve?.isDirectDebridCandidate == true

    val isTorrentStream: Boolean
        get() = !isDirectDebridStream && (
            !infoHash.isNullOrBlank() ||
            url.isMagnetLink() ||
            externalUrl.isMagnetLink()
        )

    val hasPlayableSource: Boolean
        get() = url != null || infoHash != null || externalUrl != null || clientResolve != null
}

private fun String?.isMagnetLink(): Boolean =
    this?.trimStart()?.startsWith("magnet:", ignoreCase = true) == true

data class StreamBehaviorHints(
    val bingeGroup: String? = null,
    val notWebReady: Boolean = false,
    val videoHash: String? = null,
    val videoSize: Long? = null,
    val filename: String? = null,
    val proxyHeaders: StreamProxyHeaders? = null,
)

data class StreamProxyHeaders(
    val request: Map<String, String>? = null,
    val response: Map<String, String>? = null,
)

data class StreamClientResolve(
    val type: String? = null,
    val infoHash: String? = null,
    val fileIdx: Int? = null,
    val magnetUri: String? = null,
    val sources: List<String> = emptyList(),
    val torrentName: String? = null,
    val filename: String? = null,
    val mediaType: String? = null,
    val mediaId: String? = null,
    val mediaOnlyId: String? = null,
    val title: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val service: String? = null,
    val serviceIndex: Int? = null,
    val serviceExtension: String? = null,
    val isCached: Boolean? = null,
    val stream: StreamClientResolveStream? = null,
) {
    val isDirectDebridCandidate: Boolean
        get() = type.equals("debrid", ignoreCase = true) &&
            !service.isNullOrBlank() &&
            isCached == true
}

data class StreamClientResolveStream(
    val raw: StreamClientResolveRaw? = null,
)

data class StreamClientResolveRaw(
    val torrentName: String? = null,
    val filename: String? = null,
    val size: Long? = null,
    val folderSize: Long? = null,
    val tracker: String? = null,
    val indexer: String? = null,
    val network: String? = null,
    val parsed: StreamClientResolveParsed? = null,
)

data class StreamClientResolveParsed(
    val rawTitle: String? = null,
    val parsedTitle: String? = null,
    val year: Int? = null,
    val resolution: String? = null,
    val seasons: List<Int> = emptyList(),
    val episodes: List<Int> = emptyList(),
    val quality: String? = null,
    val hdr: List<String> = emptyList(),
    val codec: String? = null,
    val audio: List<String> = emptyList(),
    val channels: List<String> = emptyList(),
    val languages: List<String> = emptyList(),
    val group: String? = null,
    val network: String? = null,
    val edition: String? = null,
    val duration: Long? = null,
    val bitDepth: String? = null,
    val extended: Boolean? = null,
    val theatrical: Boolean? = null,
    val remastered: Boolean? = null,
    val unrated: Boolean? = null,
)

data class AddonStreamGroup(
    val addonName: String,
    val addonId: String,
    val streams: List<StreamItem>,
    val isLoading: Boolean = false,
    val error: String? = null,
)

enum class StreamsEmptyStateReason {
    NoAddonsInstalled,
    NoCompatibleAddons,
    NoStreamsFound,
    StreamFetchFailed,
}

data class StreamsUiState(
    val requestToken: String? = null,
    val groups: List<AddonStreamGroup> = emptyList(),
    val activeAddonIds: Set<String> = emptySet(),
    val selectedFilter: String? = null,
    val isAnyLoading: Boolean = false,
    val emptyStateReason: StreamsEmptyStateReason? = null,
    val autoPlayStream: StreamItem? = null,
    val isDirectAutoPlayFlow: Boolean = false,
    val showDirectAutoPlayOverlay: Boolean = false,
) {
    val filteredGroups: List<AddonStreamGroup>
        get() = if (selectedFilter == null) groups
                else groups.filter { it.addonId == selectedFilter }

    val allStreams: List<StreamItem>
        get() = filteredGroups.flatMap { it.streams }

    val hasAnyStreams: Boolean
        get() = groups.any { it.streams.isNotEmpty() }
}
