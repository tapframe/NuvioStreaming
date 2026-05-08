package com.nuvio.app.features.streams

import kotlinx.coroutines.runBlocking
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString

data class StreamItem(
    val name: String? = null,
    val description: String? = null,
    val url: String? = null,
    val infoHash: String? = null,
    val fileIdx: Int? = null,
    val externalUrl: String? = null,
    val sourceName: String? = null,
    val addonName: String,
    val addonId: String,
    val behaviorHints: StreamBehaviorHints = StreamBehaviorHints(),
) {
    val streamLabel: String
        get() = name ?: runBlocking { getString(Res.string.stream_default_name) }

    val streamSubtitle: String?
        get() = description

    val directPlaybackUrl: String?
        get() = url ?: externalUrl

    val isTorrentStream: Boolean
        get() = !infoHash.isNullOrBlank() ||
            url.isMagnetLink() ||
            externalUrl.isMagnetLink()

    val hasPlayableSource: Boolean
        get() = url != null || infoHash != null || externalUrl != null
}

private fun String?.isMagnetLink(): Boolean =
    this?.trimStart()?.startsWith("magnet:", ignoreCase = true) == true

data class StreamBehaviorHints(
    val bingeGroup: String? = null,
    val notWebReady: Boolean = false,
    val videoSize: Long? = null,
    val filename: String? = null,
    val proxyHeaders: StreamProxyHeaders? = null,
)

data class StreamProxyHeaders(
    val request: Map<String, String>? = null,
    val response: Map<String, String>? = null,
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
