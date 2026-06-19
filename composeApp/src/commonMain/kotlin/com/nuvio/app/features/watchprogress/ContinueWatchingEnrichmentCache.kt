package com.nuvio.app.features.watchprogress

import com.nuvio.app.core.storage.ProfileScopedKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    val isReleaseAlert: Boolean = false,
    val isNewSeasonRelease: Boolean = false,
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
    private val lastPayloadHashByProfile = mutableMapOf<Int, Int>()
    private val _cacheCleared = MutableStateFlow(0)
    val cacheCleared: StateFlow<Int> = _cacheCleared.asStateFlow()

    fun getNextUpSnapshot(profileId: Int): List<CachedNextUpItem> =
        loadPayload(profileId)?.nextUp ?: emptyList()

    fun getInProgressSnapshot(profileId: Int): List<CachedInProgressItem> =
        loadPayload(profileId)?.inProgress ?: emptyList()

    fun getSnapshots(profileId: Int): Pair<List<CachedNextUpItem>, List<CachedInProgressItem>> {
        val payload = loadPayload(profileId)
        val nextUp = payload?.nextUp ?: emptyList()
        val inProgress = payload?.inProgress ?: emptyList()
        return nextUp to inProgress
    }

    fun saveSnapshots(
        profileId: Int,
        nextUp: List<CachedNextUpItem>,
        inProgress: List<CachedInProgressItem>,
        force: Boolean = false,
    ) {
        val payload = CachedEnrichmentPayload(nextUp = nextUp, inProgress = inProgress)
        val payloadHash = payload.hashCode()
        if (!force && lastPayloadHashByProfile[profileId] == payloadHash) {
            return
        }

        val encoded = runCatching {
            json.encodeToString(payload)
        }.getOrNull() ?: return
        ContinueWatchingEnrichmentStorage.savePayload(profileScopedStorageKey(profileId), encoded)
        lastPayloadHashByProfile[profileId] = payloadHash
    }

    fun clearAll(profileId: Int) {
        ContinueWatchingEnrichmentStorage.removePayload(profileScopedStorageKey(profileId))
        lastPayloadHashByProfile.remove(profileId)
        _cacheCleared.value += 1
    }

    fun onProfileChanged() {
        _cacheCleared.value += 1
    }

    private fun loadPayload(profileId: Int): CachedEnrichmentPayload? {
        val raw = ContinueWatchingEnrichmentStorage.loadPayload(profileScopedStorageKey(profileId))
            ?: return null
        return runCatching {
            json.decodeFromString<CachedEnrichmentPayload>(raw)
        }.getOrNull()?.also { payload ->
            lastPayloadHashByProfile[profileId] = payload.hashCode()
        }
    }

    private fun profileScopedStorageKey(profileId: Int): String =
        ProfileScopedKey.of(storageKey, profileId)
}
