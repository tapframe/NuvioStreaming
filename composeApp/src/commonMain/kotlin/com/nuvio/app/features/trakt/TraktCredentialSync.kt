package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private const val TRAKT_PROVIDER = "trakt"

object TraktCredentialSync {
    private val log = Logger.withTag("TraktCredentialSync")
    private val mutex = Mutex()

    suspend fun deleteRemote(profileId: Int = ProfileRepository.activeProfileId): Boolean =
        mutex.withLock {
            val authState = AuthRepository.state.value
            if (authState !is AuthState.Authenticated || authState.isAnonymous) return@withLock false

            runCatching {
                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                    put("p_provider", TRAKT_PROVIDER)
                    putSyncOriginClientId()
                }
                SupabaseProvider.client.postgrest.rpc("sync_delete_provider_credentials", params)
                true
            }.getOrElse { error ->
                log.e(error) { "deleteRemote(profileId=$profileId) failed" }
                false
            }
        }
}
