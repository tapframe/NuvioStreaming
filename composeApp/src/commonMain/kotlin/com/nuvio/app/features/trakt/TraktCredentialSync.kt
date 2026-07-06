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
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

private const val TRAKT_PROVIDER = "trakt"
private const val TRAKT_TOKEN_FALLBACK_LIFETIME_SECONDS = 86_400

@Serializable
private data class ProviderCredentialRow(
    val provider: String,
    @SerialName("credential_json") val credentialJson: JsonObject,
    @SerialName("updated_at") val updatedAt: String? = null,
)

object TraktCredentialSync {
    private val log = Logger.withTag("TraktCredentialSync")
    private val mutex = Mutex()

    suspend fun pushCurrentToRemote(profileId: Int = ProfileRepository.activeProfileId): Boolean =
        mutex.withLock {
            val authState = AuthRepository.state.value
            if (authState !is AuthState.Authenticated || authState.isAnonymous) return@withLock false

            val state = TraktAuthRepository.currentStateForSync()
            val credentialJson = state.toCredentialJson() ?: return@withLock false
            runCatching {
                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                    put("p_credentials", buildJsonArray {
                        addJsonObject {
                            put("provider", TRAKT_PROVIDER)
                            put("credential_json", credentialJson)
                        }
                    })
                    putSyncOriginClientId()
                }
                SupabaseProvider.client.postgrest.rpc("sync_push_provider_credentials", params)
                true
            }.getOrElse { error ->
                log.e(error) { "pushCurrentToRemote(profileId=$profileId) failed" }
                false
            }
        }

    suspend fun pullFromRemote(profileId: Int = ProfileRepository.activeProfileId): Boolean =
        mutex.withLock {
            val authState = AuthRepository.state.value
            if (authState !is AuthState.Authenticated || authState.isAnonymous) return@withLock false

            runCatching {
                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                }
                val result = SupabaseProvider.client.postgrest.rpc("sync_pull_provider_credentials", params)
                val rows = result.decodeList<ProviderCredentialRow>()
                val row = rows.firstOrNull { it.provider.equals(TRAKT_PROVIDER, ignoreCase = true) }
                    ?: return@runCatching false
                val remoteState = row.credentialJson.toTraktAuthState() ?: return@runCatching false
                TraktAuthRepository.replaceStateFromSync(remoteState)
            }.getOrElse { error ->
                log.e(error) { "pullFromRemote(profileId=$profileId) failed" }
                false
            }
        }

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

private fun TraktAuthState.toCredentialJson(): JsonObject? {
    val accessTokenValue = accessToken?.takeIf { it.isNotBlank() } ?: return null
    val refreshTokenValue = refreshToken?.takeIf { it.isNotBlank() } ?: return null
    return buildJsonObject {
        put("access_token", accessTokenValue)
        put("refresh_token", refreshTokenValue)
        put("token_type", tokenType ?: "bearer")
        put("created_at", createdAt ?: (TraktPlatformClock.nowEpochMs() / 1_000L))
        put("expires_in", normalizeTraktTokenLifetime(expiresIn ?: TRAKT_TOKEN_FALLBACK_LIFETIME_SECONDS))
        username?.takeIf { it.isNotBlank() }?.let { put("username", it) }
        userSlug?.takeIf { it.isNotBlank() }?.let { put("user_slug", it) }
    }
}

private fun JsonObject.toTraktAuthState(): TraktAuthState? {
    val accessTokenValue = stringValue("access_token")?.takeIf { it.isNotBlank() } ?: return null
    val refreshTokenValue = stringValue("refresh_token")?.takeIf { it.isNotBlank() } ?: return null
    return TraktAuthState(
        accessToken = accessTokenValue,
        refreshToken = refreshTokenValue,
        tokenType = stringValue("token_type") ?: "bearer",
        createdAt = longValue("created_at") ?: (TraktPlatformClock.nowEpochMs() / 1_000L),
        expiresIn = normalizeTraktTokenLifetime(intValue("expires_in") ?: TRAKT_TOKEN_FALLBACK_LIFETIME_SECONDS),
        username = stringValue("username"),
        userSlug = stringValue("user_slug"),
    )
}

private fun normalizeTraktTokenLifetime(expiresIn: Int): Int {
    if (expiresIn <= 0) return TRAKT_TOKEN_FALLBACK_LIFETIME_SECONDS
    return expiresIn.coerceAtMost(TRAKT_TOKEN_FALLBACK_LIFETIME_SECONDS)
}

private fun JsonObject.stringValue(key: String): String? =
    this[key]?.jsonPrimitive?.contentOrNull

private fun JsonObject.longValue(key: String): Long? =
    this[key]?.jsonPrimitive?.longOrNull

private fun JsonObject.intValue(key: String): Int? =
    this[key]?.jsonPrimitive?.intOrNull
