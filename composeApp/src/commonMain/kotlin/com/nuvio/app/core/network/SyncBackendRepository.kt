package com.nuvio.app.core.network

import co.touchlab.kermit.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object SyncBackendRepository {
    private val log = Logger.withTag("SyncBackendRepository")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _state = MutableStateFlow(SyncBackendState())
    val state: StateFlow<SyncBackendState> = _state.asStateFlow()

    val selectedBackend: SyncBackendConfig
        get() {
            ensureLoaded()
            return _state.value.selectedBackend
        }

    fun ensureLoaded() {
        if (_state.value.isLoaded) return

        val storedSelection = SyncBackendStorage.loadSelectionPayload()
            ?.takeIf { it.isNotBlank() }
            ?.let { payload ->
                runCatching { json.decodeFromString<StoredSyncBackendSelection>(payload) }
                    .onFailure { error -> log.w(error) { "Failed to parse stored sync backend selection" } }
                    .getOrNull()
            }

        val backend = storedSelection
            ?.let { selection ->
                selection.backendId.ifBlank { selection.backend?.id.orEmpty() }
            }
            ?.let(SyncBackendDefaults::byId)
            ?: SyncBackendDefaults.hosted()

        _state.value = SyncBackendState(
            selectedBackend = backend,
            appliedRevision = storedSelection?.appliedRevision.orEmpty(),
            isLoaded = true,
        )
    }

    suspend fun refreshFromManifest(): SyncBackendRefreshResult {
        ensureLoaded()

        val manifestUrl = SyncBackendBootstrapConfig.SWITCH_MANIFEST_URL.trim()
        if (manifestUrl.isBlank()) {
            return SyncBackendRefreshResult.NotConfigured
        }

        val manifest = runCatching {
            json.decodeFromString<SyncBackendManifest>(
                fetchSyncBackendManifestText(manifestUrl),
            )
        }.onFailure { error ->
            val message = error.message ?: "Failed to fetch sync backend manifest"
            log.w(error) { message }
            _state.value = _state.value.copy(lastManifestError = message)
        }.getOrNull() ?: return SyncBackendRefreshResult.Failed(
            _state.value.lastManifestError ?: "Failed to fetch sync backend manifest",
        )

        val targetBackend = manifest.backendConfigForActiveBackend()
            ?: return SyncBackendRefreshResult.Failed("Sync backend manifest is invalid")
        val revision = manifest.revision.trim()
        val currentBackend = _state.value.selectedBackend

        if (currentBackend.hasSameConnectionIdentity(targetBackend)) {
            saveSelection(targetBackend, revision)
            return SyncBackendRefreshResult.Unchanged
        }

        if (!manifest.forceLogoutOnChange) {
            saveSelection(targetBackend, revision)
            return SyncBackendRefreshResult.Applied(targetBackend, revision)
        }

        return SyncBackendRefreshResult.RequiresLogout(
            currentBackend = currentBackend,
            targetBackend = targetBackend,
            revision = revision,
            forceLogout = true,
        )
    }

    fun applyBackendAfterLogout(
        backend: SyncBackendConfig,
        revision: String,
    ): SyncBackendConfig {
        val normalizedBackend = backend.normalized()
        saveSelection(normalizedBackend, revision)
        return normalizedBackend
    }

    private fun saveSelection(
        backend: SyncBackendConfig,
        revision: String,
    ) {
        val normalizedBackend = backend.normalized()
        val payload = json.encodeToString(
            StoredSyncBackendSelection(
                backendId = normalizedBackend.id,
                appliedRevision = revision,
            ),
        )
        SyncBackendStorage.saveSelectionPayload(payload)
        _state.value = SyncBackendState(
            selectedBackend = normalizedBackend,
            appliedRevision = revision,
            isLoaded = true,
        )
    }
}
