package com.nuvio.app.features.collection

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.sync.putSyncOriginClientId
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
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object CollectionSyncService {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("CollectionSyncService")
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
        if (ProfileRepository.activeProfileId != profileId) return
        runCatching {
            val params = buildJsonObject {
                put("p_profile_id", profileId)
            }
            val result = SupabaseProvider.client.postgrest.rpc("sync_pull_collections", params)
            if (ProfileRepository.activeProfileId != profileId) return@runCatching
            val blobs = result.decodeList<SupabaseCollectionBlob>()
            val blob = blobs.firstOrNull()

            if (blob == null) {
                log.i { "pullFromServer — no remote collections found" }
                return
            }

            val remoteCollectionsJson = if (blob.collectionsJson == JsonNull) {
                JsonArray(emptyList())
            } else {
                blob.collectionsJson
            }
            val remoteJson = remoteCollectionsJson.toString()
            val localJson = CollectionRepository.exportToJson()
            if (ProfileRepository.activeProfileId != profileId) return@runCatching

            if (remoteJson == localJson) {
                log.d { "pullFromServer — remote matches local, no update needed" }
                return
            }

            val remoteCollections = runCatching {
                json.decodeFromString<List<Collection>>(remoteJson)
            }.getOrNull()

            if (remoteCollections != null) {
                if (ProfileRepository.activeProfileId != profileId) return@runCatching
                isSyncingFromRemote = true
                CollectionRepository.applyFromRemote(remoteCollections, remoteCollectionsJson)
                isSyncingFromRemote = false
                log.i { "pullFromServer — applied ${remoteCollections.size} collections from remote" }
            } else {
                log.w { "pullFromServer — failed to parse remote collections JSON" }
            }
        }.onFailure { e ->
            isSyncingFromRemote = false
            log.e(e) { "pullFromServer — FAILED" }
        }
    }

    fun triggerPush() {
        pushJob?.cancel()
        pushJob = scope.launch {
            val profileId = ProfileRepository.activeProfileId
            delay(500)
            if (ProfileRepository.activeProfileId != profileId) return@launch
            if (isSyncingFromRemote) return@launch
            val authState = AuthRepository.state.value
            if (authState !is AuthState.Authenticated || authState.isAnonymous) return@launch
            pushToRemote(profileId)
        }
    }

    private suspend fun pushToRemote(profileId: Int) {
        runCatching {
            if (ProfileRepository.activeProfileId != profileId) return@runCatching
            val collectionsJson = CollectionRepository.exportToJson()
            if (ProfileRepository.activeProfileId != profileId) return@runCatching
            val jsonElement = runCatching {
                json.parseToJsonElement(collectionsJson)
            }.getOrDefault(JsonArray(emptyList()))

            val params = buildJsonObject {
                put("p_profile_id", profileId)
                put("p_collections_json", jsonElement)
                putSyncOriginClientId()
            }
            SupabaseProvider.client.postgrest.rpc("sync_push_collections", params)
            log.d { "pushToRemote — success" }
        }.onFailure { e ->
            log.e(e) { "pushToRemote — FAILED" }
        }
    }

    @OptIn(FlowPreview::class)
    private fun observeLocalChangesAndPush() {
        observeJob = scope.launch {
            CollectionRepository.localChangeEvents
                .debounce(PUSH_DEBOUNCE_MS)
                .collect {
                    val profileId = ProfileRepository.activeProfileId
                    if (isSyncingFromRemote) return@collect
                    val authState = AuthRepository.state.value
                    if (authState !is AuthState.Authenticated || authState.isAnonymous) return@collect
                    pushToRemote(profileId)
                }
        }
    }
}
