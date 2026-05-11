package com.nuvio.app.features.watchprogress

import com.nuvio.app.core.storage.ProfileScopedKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class CachedNextUpItem(
    val contentId: String,
    val contentType: String,
    val name: String,
    val poster: String? = null,
    val backdrop: String? = null,
    val logo: String? = null,
    val videoId: String,
    val season: Int? = null,
    val episode: Int? = null,
    val episodeTitle: String? = null,
    val episodeThumbnail: String? = null,
    val pauseDescription: String? = null,
    val released: String? = null,
    val hasAired: Boolean = true,
    val lastWatched: Long,
    val sortTimestamp: Long,
    val seedSeason: Int? = null,
    val seedEpisode: Int? = null,
)

@Serializable
data class CachedInProgressItem(
    val contentId: String,
    val contentType: String,
    val name: String,
    val poster: String? = null,
    val backdrop: String? = null,
    val logo: String? = null,
    val videoId: String,
    val season: Int? = null,
    val episode: Int? = null,
    val episodeTitle: String? = null,
    val episodeThumbnail: String? = null,
    val pauseDescription: String? = null,
    val position: Long,
    val duration: Long,
    val lastWatched: Long,
    val progressPercent: Float? = null,
)

@Serializable
private data class CachedEnrichmentPayload(
    val nextUp: List<CachedNextUpItem> = emptyList(),
    val inProgress: List<CachedInProgressItem> = emptyList(),
)

internal object ContinueWatchingEnrichmentCache {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private const val storageKey = "cw_enrichment_cache"

    fun getNextUpSnapshot(): List<CachedNextUpItem> =
        loadPayload()?.nextUp ?: emptyList()

    fun getInProgressSnapshot(): List<CachedInProgressItem> =
        loadPayload()?.inProgress ?: emptyList()

    fun getSnapshots(): Pair<List<CachedNextUpItem>, List<CachedInProgressItem>> {
        val payload = loadPayload()
        return (payload?.nextUp ?: emptyList()) to (payload?.inProgress ?: emptyList())
    }

    fun saveSnapshots(
        nextUp: List<CachedNextUpItem>,
        inProgress: List<CachedInProgressItem>,
    ) {
        val encoded = runCatching {
            json.encodeToString(CachedEnrichmentPayload(nextUp = nextUp, inProgress = inProgress))
        }.getOrNull() ?: return
        ContinueWatchingEnrichmentStorage.savePayload(ProfileScopedKey.of(storageKey), encoded)
    }

    private fun loadPayload(): CachedEnrichmentPayload? {
        val raw = ContinueWatchingEnrichmentStorage.loadPayload(ProfileScopedKey.of(storageKey))
            ?: return null
        return runCatching {
            json.decodeFromString<CachedEnrichmentPayload>(raw)
        }.getOrNull()
    }
}
