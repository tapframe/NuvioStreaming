package com.nuvio.tv.domain.model

/**
 * Represents a stream source from a Stremio addon
 */
data class Stream(
    val name: String?,
    val title: String?,
    val description: String?,
    val url: String?,
    val ytId: String?,
    val infoHash: String?,
    val fileIdx: Int?,
    val externalUrl: String?,
    val behaviorHints: StreamBehaviorHints?,
    val addonName: String,
    val addonLogo: String?
) {
    /**
     * Returns the primary stream source URL
     */
    fun getStreamUrl(): String? = url ?: externalUrl

    /**
     * Returns true if this is a torrent stream
     */
    fun isTorrent(): Boolean = infoHash != null

    /**
     * Returns true if this is a YouTube stream
     */
    fun isYouTube(): Boolean = ytId != null

    /**
     * Returns true if this is an external URL (opens in browser)
     */
    fun isExternal(): Boolean = externalUrl != null && url == null

    /**
     * Returns a display name for the stream
     */
    fun getDisplayName(): String = name ?: title ?: description ?: "Unknown Stream"

    /**
     * Returns a display description for the stream
     */
    fun getDisplayDescription(): String? = description ?: title
}

data class StreamBehaviorHints(
    val notWebReady: Boolean?,
    val bingeGroup: String?,
    val countryWhitelist: List<String>?,
    val proxyHeaders: ProxyHeaders?
)

data class ProxyHeaders(
    val request: Map<String, String>?,
    val response: Map<String, String>?
)

/**
 * Represents streams grouped by addon source
 */
data class AddonStreams(
    val addonName: String,
    val addonLogo: String?,
    val streams: List<Stream>
)
