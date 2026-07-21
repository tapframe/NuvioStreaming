package com.nuvio.app.features.simkl

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

internal data class SimklAllItemsRequest(
    val type: SimklMediaType? = null,
    val dateFrom: String? = null,
    val includeEpisodeDetails: Boolean = false,
    val idsOnly: Boolean = false,
)

internal interface SimklSyncRemote {
    suspend fun fetchActivities(): SimklActivities
    suspend fun fetchAllItems(request: SimklAllItemsRequest): SimklAllItemsResponse
    suspend fun fetchPlayback(): List<SimklPlaybackSession>
}

internal class SimklApiSyncRemote(
    private val client: SimklApiClient = SimklApi.client,
) : SimklSyncRemote {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    override suspend fun fetchActivities(): SimklActivities =
        client.execute(
            SimklApiRequest(
                method = SimklHttpMethod.GET,
                path = "/sync/activities",
            ),
        ).body.decode()

    override suspend fun fetchAllItems(request: SimklAllItemsRequest): SimklAllItemsResponse {
        val path = request.type?.let { type -> "/sync/all-items/${type.apiValue}" }
            ?: "/sync/all-items"
        val query = buildMap {
            request.dateFrom?.let { value -> put("date_from", value) }
            when {
                request.idsOnly -> put("extended", "simkl_ids_only")
                request.includeEpisodeDetails -> {
                    put("extended", "full_anime_seasons")
                    put("episode_watched_at", "yes")
                    put("episode_tvdb_id", "yes")
                    put("include_all_episodes", "original")
                }
            }
        }
        return client.execute(
            SimklApiRequest(
                method = SimklHttpMethod.GET,
                path = path,
                query = query,
            ),
        ).body.decode()
    }

    override suspend fun fetchPlayback(): List<SimklPlaybackSession> =
        client.execute(
            SimklApiRequest(
                method = SimklHttpMethod.GET,
                path = "/sync/playback",
            ),
        ).body.decode()

    private inline fun <reified T> String.decode(): T = json.decodeFromString(this)
}
