package com.nuvio.app.features.home

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.sync.HOME_CATALOG_LEGACY_SYNC_PLATFORMS
import com.nuvio.app.core.sync.HOME_CATALOG_SHARED_SYNC_PLATFORM
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlin.concurrent.Volatile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

@Serializable
data class SyncCatalogItem(
    @SerialName("addon_id") val addonId: String,
    val type: String,
    @SerialName("catalog_id") val catalogId: String,
    val enabled: Boolean = true,
    val order: Int = 0,
    @SerialName("custom_title") val customTitle: String = "",
    @SerialName("is_collection") val isCollection: Boolean = false,
    @SerialName("collection_id") val collectionId: String = "",
)

@Serializable
data class SyncHomeCatalogPayload(
    @SerialName("hide_unreleased_content") val hideUnreleasedContent: Boolean = false,
    @SerialName("hide_catalog_underline") val hideCatalogUnderline: Boolean = false,
    val items: List<SyncCatalogItem> = emptyList(),
)

@Serializable
private data class SupabaseHomeCatalogSettingsBlob(
    @SerialName("profile_id") val profileId: Int = 1,
    @SerialName("settings_json") val settingsJson: JsonObject = buildJsonObject { },
    @SerialName("updated_at") val updatedAt: String? = null,
)

private data class RemoteHomeCatalogSettings(
    val platform: String,
    val payload: SyncHomeCatalogPayload,
    val updatedAt: String?,
    val hasHideUnreleasedContent: Boolean,
    val hasHideCatalogUnderline: Boolean,
)

private data class PullToken(
    val userId: String,
    val profileId: Int,
)

object HomeCatalogSettingsSyncService {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("HomeCatalogSettingsSyncService")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private const val HIDE_UNRELEASED_CONTENT_KEY = "hide_unreleased_content"
    private const val HIDE_CATALOG_UNDERLINE_KEY = "hide_catalog_underline"

    @Volatile
    var isSyncingFromRemote: Boolean = false

    private var pushJob: Job? = null

    @Volatile
    private var completedInitialPull: PullToken? = null

    suspend fun pullFromServer(profileId: Int) {
        runCatching {
            val pullToken = currentPullToken(profileId) ?: return
            val localPayload = HomeCatalogSettingsRepository.exportToSyncPayload()
            val remote = fetchBestRemotePayload(profileId, localPayload)

            if (remote == null) {
                log.i { "pullFromServer — no remote home catalog settings found; preserving local" }
                markInitialPullComplete(pullToken)
                return
            }

            val remotePayload = remote.payload

            if (remotePayload.items.isEmpty()) {
                log.i { "pullFromServer — remote has empty items, preserving local catalog order" }
                applyRemotePayload(remotePayload)
                markInitialPullComplete(pullToken)
                return
            }

            applyRemotePayload(remotePayload)
            log.i { "pullFromServer — applied ${remotePayload.items.size} items from remote" }
            markInitialPullComplete(pullToken)
        }.onFailure { e ->
            isSyncingFromRemote = false
            log.e(e) { "pullFromServer — FAILED" }
        }
    }

    fun triggerPush() {
        val requestedToken = currentPullToken()
        if (requestedToken == null || !hasCompletedInitialPull(requestedToken)) {
            log.d { "triggerPush — skipped before initial home catalog pull completed" }
            return
        }
        pushJob?.cancel()
        pushJob = scope.launch {
            delay(500)
            if (isSyncingFromRemote) return@launch
            if (currentPullToken() != requestedToken) return@launch
            pushToRemote(requestedToken.profileId)
        }
    }

    private suspend fun pushToRemote(profileId: Int) {
        runCatching {
            val payload = HomeCatalogSettingsRepository.exportToSyncPayload()
            val jsonElement = mergedSharedPayloadJson(profileId, payload)

            val params = buildJsonObject {
                put("p_profile_id", profileId)
                put("p_platform", HOME_CATALOG_SHARED_SYNC_PLATFORM)
                put("p_settings_json", jsonElement)
            }
            SupabaseProvider.client.postgrest.rpc("sync_push_home_catalog_settings", params)
            log.d { "pushToRemote — success" }
        }.onFailure { e ->
            log.e(e) { "pushToRemote — FAILED" }
        }
    }

    private fun currentPullToken(profileId: Int = ProfileRepository.activeProfileId): PullToken? {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) return null
        return PullToken(
            userId = authState.userId,
            profileId = profileId,
        )
    }

    private fun hasCompletedInitialPull(token: PullToken): Boolean =
        completedInitialPull == token

    private fun markInitialPullComplete(token: PullToken) {
        completedInitialPull = token
    }

    private fun applyRemotePayload(
        payload: SyncHomeCatalogPayload,
    ) {
        isSyncingFromRemote = true
        try {
            HomeCatalogSettingsRepository.applyFromRemote(payload)
        } finally {
            isSyncingFromRemote = false
        }
    }

    private suspend fun fetchBestRemotePayload(
        profileId: Int,
        localPayload: SyncHomeCatalogPayload,
    ): RemoteHomeCatalogSettings? {
        val shared = fetchRemotePayload(
            profileId = profileId,
            platform = HOME_CATALOG_SHARED_SYNC_PLATFORM,
            localPayload = localPayload,
        )
        val legacyRows = HOME_CATALOG_LEGACY_SYNC_PLATFORMS
            .mapNotNull { platform ->
                fetchRemotePayload(
                    profileId = profileId,
                    platform = platform,
                    localPayload = localPayload,
                )
            }
        val rows = listOfNotNull(shared) + legacyRows
        val selected = rows
            .filter { it.payload.items.isNotEmpty() }
            .maxByOrNull { it.updatedAt.orEmpty() }
            ?: shared
            ?: legacyRows.maxByOrNull { it.updatedAt.orEmpty() }

        return selected?.withNewestStandaloneSettings(rows)
    }

    private suspend fun fetchRemotePayload(
        profileId: Int,
        platform: String,
        localPayload: SyncHomeCatalogPayload,
    ): RemoteHomeCatalogSettings? {
        val blob = fetchRemoteBlob(profileId, platform) ?: return null
        val payload = decodePayloadPreservingLocalDefaults(blob.settingsJson, localPayload)
        if (payload == null) {
            log.w { "pullFromServer — failed to parse remote home catalog settings for platform=$platform" }
            return null
        }
        return RemoteHomeCatalogSettings(
            platform = platform,
            payload = payload,
            updatedAt = blob.updatedAt,
            hasHideUnreleasedContent = blob.settingsJson.containsKey(HIDE_UNRELEASED_CONTENT_KEY),
            hasHideCatalogUnderline = blob.settingsJson.containsKey(HIDE_CATALOG_UNDERLINE_KEY),
        )
    }

    private fun RemoteHomeCatalogSettings.withNewestStandaloneSettings(
        rows: List<RemoteHomeCatalogSettings>,
    ): RemoteHomeCatalogSettings {
        val hideUnreleasedSource = rows
            .filter { it.hasHideUnreleasedContent }
            .maxByOrNull { it.updatedAt.orEmpty() }
        val hideUnderlineSource = rows
            .filter { it.hasHideCatalogUnderline }
            .maxByOrNull { it.updatedAt.orEmpty() }

        return copy(
            payload = payload.copy(
                hideUnreleasedContent = hideUnreleasedSource?.payload?.hideUnreleasedContent
                    ?: payload.hideUnreleasedContent,
                hideCatalogUnderline = hideUnderlineSource?.payload?.hideCatalogUnderline
                    ?: payload.hideCatalogUnderline,
            ),
        )
    }

    private suspend fun fetchRemoteBlob(
        profileId: Int,
        platform: String,
    ): SupabaseHomeCatalogSettingsBlob? {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", platform)
        }
        val result = SupabaseProvider.client.postgrest.rpc("sync_pull_home_catalog_settings", params)
        return result.decodeList<SupabaseHomeCatalogSettingsBlob>().firstOrNull()
    }

    private fun decodePayloadPreservingLocalDefaults(
        settingsJson: JsonObject,
        localPayload: SyncHomeCatalogPayload,
    ): SyncHomeCatalogPayload? = runCatching {
        val decoded = json.decodeFromJsonElement(SyncHomeCatalogPayload.serializer(), settingsJson)
        decoded.copy(
            hideUnreleasedContent = if (settingsJson.containsKey(HIDE_UNRELEASED_CONTENT_KEY)) {
                decoded.hideUnreleasedContent
            } else {
                localPayload.hideUnreleasedContent
            },
            hideCatalogUnderline = if (settingsJson.containsKey(HIDE_CATALOG_UNDERLINE_KEY)) {
                decoded.hideCatalogUnderline
            } else {
                localPayload.hideCatalogUnderline
            },
        )
    }.getOrNull()

    private suspend fun mergedSharedPayloadJson(
        profileId: Int,
        payload: SyncHomeCatalogPayload,
    ): JsonObject {
        val localJson = json.encodeToJsonElement(SyncHomeCatalogPayload.serializer(), payload).jsonObject
        val remoteJson = fetchRemoteBlob(profileId, HOME_CATALOG_SHARED_SYNC_PLATFORM)?.settingsJson
        return buildJsonObject {
            remoteJson?.forEach { (key, value) -> put(key, value) }
            localJson.forEach { (key, value) -> put(key, value) }
        }
    }
}
