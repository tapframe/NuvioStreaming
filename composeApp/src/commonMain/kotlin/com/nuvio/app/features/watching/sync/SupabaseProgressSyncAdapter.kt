package com.nuvio.app.features.watching.sync

import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

object SupabaseProgressSyncAdapter : ProgressSyncAdapter {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override suspend fun pull(profileId: Int): List<ProgressSyncRecord> {
        val params = buildJsonObject { put("p_profile_id", profileId) }
        val result = SupabaseProvider.client.postgrest.rpc("sync_pull_watch_progress", params)
        val serverEntries = result.decodeList<WatchProgressSyncEntry>()
        val records = serverEntries.map { entry ->
            ProgressSyncRecord(
                contentId = entry.contentId,
                contentType = entry.contentType,
                videoId = entry.videoId,
                season = entry.season,
                episode = entry.episode,
                position = entry.position,
                duration = entry.duration,
                lastWatched = entry.lastWatched,
            )
        }
        return records
    }

    override suspend fun push(
        profileId: Int,
        entries: Collection<WatchProgressEntry>,
    ) {
        val syncEntries = entries.map { entry ->
            WatchProgressSyncEntry(
                contentId = entry.parentMetaId,
                contentType = entry.contentType,
                videoId = entry.videoId,
                season = entry.seasonNumber,
                episode = entry.episodeNumber,
                position = entry.lastPositionMs,
                duration = entry.durationMs,
                lastWatched = entry.lastUpdatedEpochMs,
            )
        }
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_entries", json.encodeToJsonElement(syncEntries))
        }
        SupabaseProvider.client.postgrest.rpc("sync_push_watch_progress", params)
    }

    override suspend fun delete(
        profileId: Int,
        entries: Collection<WatchProgressEntry>,
    ) {
        val progressKeys = entries.map { entry ->
            if (entry.seasonNumber != null && entry.episodeNumber != null) {
                "${entry.parentMetaId}_s${entry.seasonNumber}e${entry.episodeNumber}"
            } else {
                entry.parentMetaId
            }
        }
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_keys", json.encodeToJsonElement(progressKeys))
        }
        SupabaseProvider.client.postgrest.rpc("sync_delete_watch_progress", params)
    }
}

@Serializable
private data class WatchProgressSyncEntry(
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
    @SerialName("video_id") val videoId: String,
    val season: Int? = null,
    val episode: Int? = null,
    val position: Long = 0,
    val duration: Long = 0,
    @SerialName("last_watched") val lastWatched: Long = 0,
    @SerialName("progress_key") val progressKey: String = "",
)
