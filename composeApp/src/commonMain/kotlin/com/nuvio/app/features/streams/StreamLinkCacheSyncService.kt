package com.nuvio.app.features.streams

import com.nuvio.app.core.network.SupabaseProvider
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement

object StreamLinkCacheSyncService {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    suspend fun pull(profileId: Int): List<StreamLinkCacheSyncEntry> {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
        }
        val result = SupabaseProvider.client.postgrest.rpc("sync_pull_stream_link_cache", params)
        return result.decodeList<StreamLinkCacheSyncEntry>()
    }

    suspend fun push(profileId: Int, entries: Collection<StreamLinkCacheSyncEntry>) {
        if (entries.isEmpty()) return
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_entries", json.encodeToJsonElement(entries))
        }
        SupabaseProvider.client.postgrest.rpc("sync_push_stream_link_cache", params)
    }

    suspend fun delete(profileId: Int, contentKeys: Collection<String>) {
        if (contentKeys.isEmpty()) return
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_keys", json.encodeToJsonElement(contentKeys))
        }
        SupabaseProvider.client.postgrest.rpc("sync_delete_stream_link_cache", params)
    }
}

@Serializable
internal data class StreamLinkCacheSyncEntry(
    @SerialName("content_key") val contentKey: String,
    val url: String,
    @SerialName("stream_name") val streamName: String,
    @SerialName("addon_name") val addonName: String,
    @SerialName("addon_id") val addonId: String,
    @SerialName("cached_at_ms") val cachedAtMs: Long = 0,
    @SerialName("request_headers") val requestHeaders: Map<String, String> = emptyMap(),
    @SerialName("response_headers") val responseHeaders: Map<String, String> = emptyMap(),
    val filename: String? = null,
    @SerialName("video_size") val videoSize: Long? = null,
    @SerialName("binge_group") val bingeGroup: String? = null,
)
