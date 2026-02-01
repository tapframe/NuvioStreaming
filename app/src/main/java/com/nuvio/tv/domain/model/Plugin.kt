package com.nuvio.tv.domain.model

import com.squareup.moshi.JsonClass

/**
 * Represents a plugin repository containing scrapers
 */
data class PluginRepository(
    val id: String,
    val name: String,
    val url: String,
    val description: String? = null,
    val enabled: Boolean = true,
    val lastUpdated: Long = 0L,
    val scraperCount: Int = 0
)

/**
 * Represents manifest.json from a plugin repository
 */
@JsonClass(generateAdapter = true)
data class PluginManifest(
    val name: String,
    val version: String,
    val description: String? = null,
    val author: String? = null,
    val scrapers: List<ScraperManifestInfo>
)

/**
 * Scraper info from manifest.json
 */
@JsonClass(generateAdapter = true)
data class ScraperManifestInfo(
    val id: String,
    val name: String,
    val description: String? = null,
    val version: String,
    val filename: String,
    val supportedTypes: List<String> = listOf("movie", "tv"),
    val enabled: Boolean = true,
    val logo: String? = null,
    val contentLanguage: List<String>? = null,
    val supportedPlatforms: List<String>? = null,
    val disabledPlatforms: List<String>? = null,
    val formats: List<String>? = null,
    val supportedFormats: List<String>? = null,
    val supportsExternalPlayer: Boolean? = null,
    val limited: Boolean? = null
)

/**
 * Installed scraper info with runtime state
 */
data class ScraperInfo(
    val id: String,
    val name: String,
    val description: String,
    val version: String,
    val filename: String,
    val supportedTypes: List<String>,
    val enabled: Boolean,
    val manifestEnabled: Boolean,
    val logo: String?,
    val contentLanguage: List<String>,
    val repositoryId: String,
    val formats: List<String>?
) {
    fun supportsType(type: String): Boolean {
        val normalizedType = when (type.lowercase()) {
            "series", "other" -> "tv"
            else -> type.lowercase()
        }
        return supportedTypes.map { it.lowercase() }.contains(normalizedType)
    }
}

/**
 * Result from a local scraper execution
 */
data class LocalScraperResult(
    val title: String,
    val name: String? = null,
    val url: String,
    val quality: String? = null,
    val size: String? = null,
    val language: String? = null,
    val provider: String? = null,
    val type: String? = null,
    val seeders: Int? = null,
    val peers: Int? = null,
    val infoHash: String? = null,
    val headers: Map<String, String>? = null
)

/**
 * Convert LocalScraperResult to Stream
 */
fun LocalScraperResult.toStream(scraper: ScraperInfo): com.nuvio.tv.domain.model.Stream {
    val displayTitle = buildString {
        append(title)
        if (!quality.isNullOrBlank() && !title.contains(quality)) {
            append(" $quality")
        }
    }
    
    val displayName = buildString {
        append(name ?: scraper.name)
        if (!quality.isNullOrBlank() && !(name ?: "").contains(quality)) {
            append(" - $quality")
        }
    }
    
    return Stream(
        name = displayName,
        title = displayTitle,
        description = size,
        url = url,
        ytId = null,
        infoHash = infoHash,
        fileIdx = null,
        externalUrl = null,
        behaviorHints = StreamBehaviorHints(
            notWebReady = null,
            bingeGroup = "local-plugin-${scraper.id}",
            countryWhitelist = null,
            proxyHeaders = headers?.let { ProxyHeaders(request = it, response = null) }
        ),
        addonName = scraper.name,
        addonLogo = scraper.logo
    )
}
