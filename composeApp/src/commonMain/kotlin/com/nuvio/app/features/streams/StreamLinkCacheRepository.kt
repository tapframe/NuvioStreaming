package com.nuvio.app.features.streams

import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.features.profiles.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class CachedStreamLink(
    val url: String,
    val streamName: String,
    val addonName: String,
    val addonId: String,
    val cachedAtMs: Long,
    val requestHeaders: Map<String, String> = emptyMap(),
    val responseHeaders: Map<String, String> = emptyMap(),
    val filename: String? = null,
    val videoSize: Long? = null,
    val bingeGroup: String? = null,
)

internal expect fun epochMs(): Long

object StreamLinkCacheRepository {
    private val json = Json { ignoreUnknownKeys = true }
    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    fun contentKey(
        type: String,
        videoId: String,
        parentMetaId: String? = null,
        season: Int? = null,
        episode: Int? = null,
    ): String {
        val normalizedType = type.lowercase()
        return if (!parentMetaId.isNullOrBlank() && season != null && episode != null) {
            "$normalizedType|${parentMetaId.trim()}|s$season|e$episode|$videoId"
        } else {
            "$normalizedType|$videoId"
        }
    }

    fun save(
        contentKey: String,
        url: String,
        streamName: String,
        addonName: String,
        addonId: String,
        requestHeaders: Map<String, String> = emptyMap(),
        responseHeaders: Map<String, String> = emptyMap(),
        filename: String? = null,
        videoSize: Long? = null,
        bingeGroup: String? = null,
        syncToRemote: Boolean = true,
    ) {
        val entry = CachedStreamLink(
            url = url,
            streamName = streamName,
            addonName = addonName,
            addonId = addonId,
            cachedAtMs = epochMs(),
            requestHeaders = requestHeaders,
            responseHeaders = responseHeaders,
            filename = filename,
            videoSize = videoSize,
            bingeGroup = bingeGroup,
        )
        val payload = json.encodeToString(CachedStreamLink.serializer(), entry)
        StreamLinkCacheStorage.saveEntry(hashedKey(contentKey), payload)

        if (!syncToRemote) return

        val profileId = ProfileRepository.activeProfileId
        syncScope.launch {
            runCatching {
                val authState = AuthRepository.state.value
                if (authState !is AuthState.Authenticated || authState.isAnonymous) return@runCatching
                StreamLinkCacheSyncService.push(
                    profileId = profileId,
                    entries = listOf(
                        StreamLinkCacheSyncEntry(
                            contentKey = contentKey,
                            url = entry.url,
                            streamName = entry.streamName,
                            addonName = entry.addonName,
                            addonId = entry.addonId,
                            cachedAtMs = entry.cachedAtMs,
                            requestHeaders = entry.requestHeaders,
                            responseHeaders = entry.responseHeaders,
                            filename = entry.filename,
                            videoSize = entry.videoSize,
                            bingeGroup = entry.bingeGroup,
                        ),
                    ),
                )
            }
        }
    }

    fun remove(contentKey: String) {
        StreamLinkCacheStorage.removeEntry(hashedKey(contentKey))
        syncScope.launch {
            runCatching {
                val authState = AuthRepository.state.value
                if (authState !is AuthState.Authenticated || authState.isAnonymous) return@runCatching
                StreamLinkCacheSyncService.delete(
                    profileId = ProfileRepository.activeProfileId,
                    contentKeys = listOf(contentKey),
                )
            }
        }
    }

    fun getValid(contentKey: String, maxAgeMs: Long): CachedStreamLink? {
        if (maxAgeMs <= 0L) return null
        val raw = StreamLinkCacheStorage.loadEntry(hashedKey(contentKey)) ?: return null
        val entry = runCatching {
            json.decodeFromString(CachedStreamLink.serializer(), raw)
        }.getOrNull() ?: run {
            StreamLinkCacheStorage.removeEntry(hashedKey(contentKey))
            return null
        }
        val age = epochMs() - entry.cachedAtMs
        if (entry.cachedAtMs <= 0L || age > maxAgeMs) {
            StreamLinkCacheStorage.removeEntry(hashedKey(contentKey))
            return null
        }
        if (entry.url.isBlank()) {
            StreamLinkCacheStorage.removeEntry(hashedKey(contentKey))
            return null
        }
        return entry
    }

    suspend fun pullFromServer(profileId: Int) {
        val remoteEntries = runCatching {
            StreamLinkCacheSyncService.pull(profileId)
        }.getOrNull().orEmpty()

        for (remoteEntry in remoteEntries) {
            if (remoteEntry.url.isBlank()) continue
            val localEntry = load(contentKey = remoteEntry.contentKey)
            if (localEntry == null || remoteEntry.cachedAtMs > localEntry.cachedAtMs) {
                save(
                    contentKey = remoteEntry.contentKey,
                    url = remoteEntry.url,
                    streamName = remoteEntry.streamName,
                    addonName = remoteEntry.addonName,
                    addonId = remoteEntry.addonId,
                    requestHeaders = remoteEntry.requestHeaders,
                    responseHeaders = remoteEntry.responseHeaders,
                    filename = remoteEntry.filename,
                    videoSize = remoteEntry.videoSize,
                    bingeGroup = remoteEntry.bingeGroup,
                    syncToRemote = false,
                )
            }
        }
    }

    private fun load(contentKey: String): CachedStreamLink? {
        val raw = StreamLinkCacheStorage.loadEntry(hashedKey(contentKey)) ?: return null
        return runCatching {
            json.decodeFromString(CachedStreamLink.serializer(), raw)
        }.getOrNull()
    }

    private fun hashedKey(contentKey: String): String {
        val hash = contentKey.fold(0L) { acc, c -> acc * 31 + c.code }.toULong()
        return "stream_link_$hash"
    }
}
