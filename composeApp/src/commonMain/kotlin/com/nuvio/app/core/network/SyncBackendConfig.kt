package com.nuvio.app.core.network

import kotlinx.serialization.Serializable

internal const val SYNC_BACKEND_HOSTED_ID = "hosted"
internal const val SYNC_BACKEND_NUVIO_ID = "nuvio"

@Serializable
data class SyncBackendConfig(
    val id: String,
    val displayName: String,
    val supabaseUrl: String,
    val anonKey: String,
    val avatarPublicBaseUrl: String,
    val schemaVersion: Int = 1,
) {
    val normalizedSupabaseUrl: String
        get() = supabaseUrl.trim().trimEnd('/')

    val normalizedAvatarPublicBaseUrl: String
        get() = avatarPublicBaseUrl.trim().trimEnd('/')

    fun avatarStorageUrl(storagePath: String): String =
        "${normalizedAvatarPublicBaseUrl}/${storagePath.trim().trimStart('/')}"

    fun normalized(): SyncBackendConfig =
        copy(
            id = id.trim().lowercase(),
            supabaseUrl = normalizedSupabaseUrl,
            anonKey = anonKey.trim(),
            avatarPublicBaseUrl = normalizedAvatarPublicBaseUrl,
        )
}

@Serializable
data class SyncBackendManifest(
    val version: Int = 1,
    val activeBackend: String,
    val revision: String = "",
    val forceLogoutOnChange: Boolean = true,
)

data class SyncBackendState(
    val selectedBackend: SyncBackendConfig = SyncBackendDefaults.hosted(),
    val appliedRevision: String = "",
    val isLoaded: Boolean = false,
    val lastManifestError: String? = null,
    val isManualDebugOverride: Boolean = false,
)

sealed interface SyncBackendRefreshResult {
    data object NotConfigured : SyncBackendRefreshResult
    data object Unchanged : SyncBackendRefreshResult
    data class Applied(
        val backend: SyncBackendConfig,
        val revision: String,
    ) : SyncBackendRefreshResult
    data class RequiresLogout(
        val currentBackend: SyncBackendConfig,
        val targetBackend: SyncBackendConfig,
        val revision: String,
        val forceLogout: Boolean,
    ) : SyncBackendRefreshResult
    data class Failed(val message: String) : SyncBackendRefreshResult
}

@Serializable
internal data class StoredSyncBackendSelection(
    val backend: SyncBackendConfig? = null,
    val backendId: String = "",
    val appliedRevision: String = "",
    val manualDebugOverride: Boolean = false,
)

object SyncBackendDefaults {
    fun hosted(): SyncBackendConfig =
        SyncBackendConfig(
            id = SYNC_BACKEND_HOSTED_ID,
            displayName = "Hosted",
            supabaseUrl = SupabaseConfig.URL,
            anonKey = SupabaseConfig.ANON_KEY,
            avatarPublicBaseUrl = "${SupabaseConfig.URL.trim().trimEnd('/')}/storage/v1/object/public/avatars",
            schemaVersion = 1,
        ).normalized()

    fun nuvio(): SyncBackendConfig =
        SyncBackendConfig(
            id = SYNC_BACKEND_NUVIO_ID,
            displayName = "Nuvio",
            supabaseUrl = SupabaseConfig.NUVIO_URL,
            anonKey = SupabaseConfig.NUVIO_ANON_KEY,
            avatarPublicBaseUrl = "${SupabaseConfig.NUVIO_URL.trim().trimEnd('/')}/storage/v1/object/public/avatars",
            schemaVersion = 1,
        ).normalized()

    fun byId(id: String): SyncBackendConfig? =
        when (id.trim().lowercase()) {
            SYNC_BACKEND_HOSTED_ID -> hosted()
            SYNC_BACKEND_NUVIO_ID -> nuvio()
            else -> null
        }
}

internal fun SyncBackendConfig.hasSameConnectionIdentity(other: SyncBackendConfig): Boolean =
    id == other.id &&
        normalizedSupabaseUrl == other.normalizedSupabaseUrl &&
        anonKey.trim() == other.anonKey.trim() &&
        schemaVersion == other.schemaVersion

internal fun SyncBackendManifest.backendConfigForActiveBackend(): SyncBackendConfig? {
    if (version != 1) return null

    val activeId = activeBackend.trim().lowercase()
    return SyncBackendDefaults.byId(activeId)
        ?.takeIf { it.isUsableClientConfig() }
}

internal fun SyncBackendConfig.isUsableClientConfig(): Boolean =
    id in setOf(SYNC_BACKEND_HOSTED_ID, SYNC_BACKEND_NUVIO_ID) &&
        normalizedSupabaseUrl.startsWith("https://") &&
        anonKey.isNotBlank() &&
        !anonKey.startsWith("<") &&
        normalizedAvatarPublicBaseUrl.startsWith("https://")
