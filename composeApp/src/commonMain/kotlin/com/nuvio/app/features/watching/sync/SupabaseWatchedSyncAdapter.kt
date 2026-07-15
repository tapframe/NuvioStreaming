package com.nuvio.app.features.watching.sync

import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.normalizeWatchedMarkedAtEpochMs
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

object SupabaseWatchedSyncAdapter : WatchedSyncAdapter {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override suspend fun getDeltaCursor(profileId: Int): Long {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
        }
        return SupabaseProvider.client.postgrest
            .rpc("sync_get_watched_items_delta_cursor", params)
            .decodeAs<Long>()
    }

    override suspend fun pullDelta(
        profileId: Int,
        sinceEventId: Long,
        limit: Int,
    ): List<WatchedDeltaEvent> {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_since_event_id", sinceEventId)
            put("p_limit", limit)
        }
        val result = SupabaseProvider.client.postgrest.rpc("sync_pull_watched_items_delta", params)
        return result.decodeList<WatchedDeltaSyncItem>().map { event ->
            WatchedDeltaEvent(
                eventId = event.eventId,
                operation = event.operation,
                contentId = event.contentId,
                contentType = event.contentType,
                title = event.title,
                season = event.season,
                episode = event.episode,
                watchedAt = event.watchedAt,
            )
        }
    }

    override suspend fun pull(
        profileId: Int,
        pageSize: Int,
    ): List<WatchedItem> {
        val serverItems = mutableListOf<WatchedSyncItem>()
        var page = 1

        while (true) {
            val params = buildJsonObject {
                put("p_profile_id", profileId)
                put("p_page", page)
                put("p_page_size", pageSize)
            }
            val result = SupabaseProvider.client.postgrest.rpc("sync_pull_watched_items", params)
            val pageItems = result.decodeList<WatchedSyncItem>()
            serverItems += pageItems

            if (pageItems.size < pageSize) break
            page += 1
        }

        return serverItems.map { syncItem ->
            WatchedItem(
                id = syncItem.contentId,
                type = syncItem.contentType,
                name = syncItem.title,
                season = syncItem.season,
                episode = syncItem.episode,
                markedAtEpochMs = normalizeWatchedMarkedAtEpochMs(syncItem.watchedAt),
            )
        }
    }

    override suspend fun push(
        profileId: Int,
        items: Collection<WatchedItem>,
    ) {
        val syncItems = items.map { item ->
            WatchedSyncItem(
                contentId = item.id,
                contentType = item.type,
                title = item.name,
                season = item.season,
                episode = item.episode,
                watchedAt = normalizeWatchedMarkedAtEpochMs(item.markedAtEpochMs),
            )
        }
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_items", json.encodeToJsonElement(syncItems))
            putSyncOriginClientId()
        }
        SupabaseProvider.client.postgrest.rpc("sync_push_watched_items", params)
    }

    override suspend fun delete(
        profileId: Int,
        items: Collection<WatchedItem>,
    ) {
        val keys = items.map { item ->
            WatchedDeleteKey(
                contentId = item.id,
                season = item.season,
                episode = item.episode,
            )
        }
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_keys", json.encodeToJsonElement(keys))
            putSyncOriginClientId()
        }
        SupabaseProvider.client.postgrest.rpc("sync_delete_watched_items", params)
    }
}

@Serializable
private data class WatchedSyncItem(
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
    val title: String = "",
    val season: Int? = null,
    val episode: Int? = null,
    @SerialName("watched_at") val watchedAt: Long = 0,
)

@Serializable
private data class WatchedDeltaSyncItem(
    @SerialName("event_id") val eventId: Long,
    val operation: String,
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
    val title: String = "",
    val season: Int? = null,
    val episode: Int? = null,
    @SerialName("watched_at") val watchedAt: Long = 0,
)

@Serializable
private data class WatchedDeleteKey(
    @SerialName("content_id") val contentId: String,
    val season: Int? = null,
    val episode: Int? = null,
)
