package com.nuvio.app.features.home

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.sync.MOBILE_SYNC_PLATFORM
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlin.concurrent.Volatile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
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
    val items: List<SyncCatalogItem> = emptyList(),
)

@Serializable
private data class SupabaseHomeCatalogSettingsBlob(
    @SerialName("profile_id") val profileId: Int = 1,
    @SerialName("settings_json") val settingsJson: JsonObject = buildJsonObject { },
    @SerialName("updated_at") val updatedAt: String? = null,
)

object HomeCatalogSettingsSyncService {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("HomeCatalogSettingsSyncService")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private const val PUSH_DEBOUNCE_MS = 1500L

    @Volatile
    var isSyncingFromRemote: Boolean = false

    private var pushJob: Job? = null
    private var observeJob: Job? = null

    fun startObserving() {
        if (observeJob?.isActive == true) return
        observeLocalChangesAndPush()
    }

    suspend fun pullFromServer(profileId: Int) {
        runCatching {
            val params = buildJsonObject {
                put("p_profile_id", profileId)
                put("p_platform", MOBILE_SYNC_PLATFORM)
            }
            val result = SupabaseProvider.client.postgrest.rpc("sync_pull_home_catalog_settings", params)
            val blobs = result.decodeList<SupabaseHomeCatalogSettingsBlob>()
            val blob = blobs.firstOrNull()

            if (blob == null) {
                log.i { "pullFromServer — no remote home catalog settings found" }
                val localPayload = HomeCatalogSettingsRepository.exportToSyncPayload()
                if (localPayload.items.isNotEmpty()) {
                    pushToRemote(profileId)
                }
                return
            }

            val remotePayload = runCatching {
                json.decodeFromJsonElement(SyncHomeCatalogPayload.serializer(), blob.settingsJson)
            }.getOrNull()

            if (remotePayload == null) {
                log.w { "pullFromServer — failed to parse remote home catalog settings" }
                return
            }

            if (remotePayload.items.isEmpty()) {
                log.i { "pullFromServer — remote has empty items, preserving local catalog order" }
                isSyncingFromRemote = true
                HomeCatalogSettingsRepository.applyFromRemote(remotePayload)
                isSyncingFromRemote = false
                val localPayload = HomeCatalogSettingsRepository.exportToSyncPayload()
                if (localPayload.items.isNotEmpty()) {
                    pushToRemote(profileId)
                }
                return
            }

            isSyncingFromRemote = true
            HomeCatalogSettingsRepository.applyFromRemote(remotePayload)
            isSyncingFromRemote = false
            log.i { "pullFromServer — applied ${remotePayload.items.size} items from remote" }
        }.onFailure { e ->
            isSyncingFromRemote = false
            log.e(e) { "pullFromServer — FAILED" }
        }
    }

    fun triggerPush() {
        pushJob?.cancel()
        pushJob = scope.launch {
            delay(500)
            if (isSyncingFromRemote) return@launch
            val authState = AuthRepository.state.value
            if (authState !is AuthState.Authenticated || authState.isAnonymous) return@launch
            pushToRemote()
        }
    }

    private suspend fun pushToRemote() {
        pushToRemote(ProfileRepository.activeProfileId)
    }

    private suspend fun pushToRemote(profileId: Int) {
        runCatching {
            val payload = HomeCatalogSettingsRepository.exportToSyncPayload()
            val jsonElement = json.encodeToJsonElement(SyncHomeCatalogPayload.serializer(), payload)

            val params = buildJsonObject {
                put("p_profile_id", profileId)
                put("p_platform", MOBILE_SYNC_PLATFORM)
                put("p_settings_json", jsonElement)
            }
            SupabaseProvider.client.postgrest.rpc("sync_push_home_catalog_settings", params)
            log.d { "pushToRemote — success" }
        }.onFailure { e ->
            log.e(e) { "pushToRemote — FAILED" }
        }
    }

    @OptIn(FlowPreview::class)
    private fun observeLocalChangesAndPush() {
        observeJob = scope.launch {
            HomeCatalogSettingsRepository.uiState
                .map { it.signature }
                .drop(1)
                .distinctUntilChanged()
                .debounce(PUSH_DEBOUNCE_MS)
                .collect {
                    if (isSyncingFromRemote) return@collect
                    val authState = AuthRepository.state.value
                    if (authState !is AuthState.Authenticated || authState.isAnonymous) return@collect
                    pushToRemote()
                }
        }
    }
}
