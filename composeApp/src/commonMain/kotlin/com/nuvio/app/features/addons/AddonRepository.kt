package com.nuvio.app.features.addons

import co.touchlab.kermit.Logger
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString

@Serializable
private data class AddonRow(
    val url: String,
    val name: String? = null,
    val enabled: Boolean = true,
    @SerialName("sort_order") val sortOrder: Int = 0,
)

@Serializable
private data class AddonPushItem(
    val url: String,
    val name: String = "",
    val enabled: Boolean = true,
    @SerialName("sort_order") val sortOrder: Int = 0,
)

object AddonRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("AddonRepository")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val _uiState = MutableStateFlow(AddonsUiState())
    val uiState: StateFlow<AddonsUiState> = _uiState.asStateFlow()

    private var initialized = false
    private var pulledFromServer = false
    private var currentProfileId: Int = 1
    private val activeRefreshJobs = mutableMapOf<String, Job>()

    fun initialize() {
        val effectiveProfileId = resolveEffectiveProfileId(ProfileRepository.activeProfileId)
        if (initialized) return
        initialized = true
        currentProfileId = effectiveProfileId
        log.d { "initialize() — loading local addons for profile $currentProfileId" }

        val storedUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(currentProfileId))
        log.d { "initialize() — local addon count: ${storedUrls.size}" }
        if (storedUrls.isEmpty()) return

        val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
        _uiState.value = AddonsUiState(
            addons = storedUrls.map { manifestUrl ->
                existingByUrl[manifestUrl].toPendingAddon(manifestUrl)
            },
        )

        storedUrls.forEach { manifestUrl ->
            val existing = existingByUrl[manifestUrl]
            if (existing == null || (existing.manifest == null && !existing.isRefreshing)) {
                refreshAddon(manifestUrl)
            }
        }
    }

    fun onProfileChanged(profileId: Int) {
        val effectiveProfileId = resolveEffectiveProfileId(profileId)
        if (effectiveProfileId == currentProfileId && initialized) return
        cancelActiveRefreshes()
        currentProfileId = effectiveProfileId
        initialized = false
        pulledFromServer = false
        _uiState.value = AddonsUiState()
    }

    fun clearLocalState() {
        cancelActiveRefreshes()
        currentProfileId = 1
        initialized = false
        pulledFromServer = false
        _uiState.value = AddonsUiState()
    }

    suspend fun pullFromServer(profileId: Int) {
        currentProfileId = resolveEffectiveProfileId(profileId)
        log.i { "pullFromServer() — profileId=$profileId, initialized=$initialized, pulledFromServer=$pulledFromServer" }
        runCatching {
            val rows = SupabaseProvider.client.postgrest
                .from("addons")
                .select {
                    filter { eq("profile_id", currentProfileId) }
                    order("sort_order", Order.ASCENDING)
                }
                .decodeList<AddonRow>()

            val namesByUrl = mutableMapOf<String, String>()
            rows.forEach { row ->
                if (!row.name.isNullOrBlank()) {
                    namesByUrl[ensureManifestSuffix(row.url)] = row.name
                }
            }

            val urls = dedupeManifestUrls(rows.map { it.url })
            log.i { "pullFromServer() — server returned ${rows.size} addons" }
            urls.forEachIndexed { i, u -> log.d { "  server[$i]: $u" } }

            if (urls.isEmpty() && !pulledFromServer) {
                val localUrls = AddonStorage.loadInstalledAddonUrls(currentProfileId)
                log.i { "pullFromServer() — server empty, local has ${localUrls.size} addons" }
                if (localUrls.isNotEmpty()) {
                    log.i { "pullFromServer() — migrating local addons to server for profile $currentProfileId" }
                    initialize()
                    pulledFromServer = true
                    val addons = localUrls.mapIndexed { index, addonUrl ->
                        AddonPushItem(
                            url = addonUrl,
                            name = _uiState.value.addons
                                .find { it.manifestUrl == addonUrl }?.manifest?.name ?: "",
                            enabled = true,
                            sortOrder = index,
                        )
                    }
                    val params = buildJsonObject {
                        put("p_profile_id", currentProfileId)
                        put("p_addons", json.encodeToJsonElement(addons))
                    }
                    SupabaseProvider.client.postgrest.rpc("sync_push_addons", params)
                    log.i { "pullFromServer() — migration push done (${addons.size} addons)" }
                    return
                }
            }

            if (urls.isEmpty()) {
                val localUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(currentProfileId))
                if (localUrls.isNotEmpty()) {
                    log.w { "pullFromServer() — remote empty while local has ${localUrls.size} addons; preserving local addons" }
                    val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
                    _uiState.value = AddonsUiState(
                        addons = localUrls.map { url ->
                            existingByUrl[url].toPendingAddon(url)
                        },
                    )
                    persist()
                    localUrls.forEach { url ->
                        val existing = existingByUrl[url]
                        if (existing == null || (existing.manifest == null && !existing.isRefreshing)) {
                            refreshAddon(url)
                        }
                    }
                    pulledFromServer = true
                    initialized = true
                    return
                }
            }

            val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
            _uiState.value = AddonsUiState(
                addons = urls.map { url ->
                    existingByUrl[url].toPendingAddon(url, namesByUrl[url])
                },
            )
            persist()
            urls.forEach { url ->
                val existing = existingByUrl[url]
                if (existing == null || (existing.manifest == null && !existing.isRefreshing)) {
                    refreshAddon(url)
                }
            }
            pulledFromServer = true
            initialized = true
            log.i { "pullFromServer() — applied ${urls.size} addons to state" }
        }.onFailure { e ->
            log.e(e) { "pullFromServer() — FAILED" }
        }
    }

    suspend fun awaitManifestsLoaded() {
        if (_uiState.value.addons.isEmpty()) return
        uiState.first { state ->
            state.addons.isEmpty() || state.addons.any { it.manifest != null }
        }
    }

    suspend fun addAddon(rawUrl: String): AddAddonResult {
        if (isUsingPrimaryAddonsFromSecondaryProfile()) {
            return AddAddonResult.Error(getString(Res.string.profile_primary_addons_required))
        }
        log.i { "addAddon() — rawUrl=$rawUrl" }
        val manifestUrl = try {
            normalizeManifestUrl(rawUrl)
        } catch (error: IllegalArgumentException) {
            return AddAddonResult.Error(error.message ?: getString(Res.string.addon_invalid_url))
        }

        if (_uiState.value.addons.any { it.manifestUrl == manifestUrl }) {
            return AddAddonResult.Error(getString(Res.string.addon_already_installed))
        }

        val manifest = try {
            withContext(Dispatchers.Default) {
                val payload = httpGetText(manifestUrl)
                AddonManifestParser.parse(
                    manifestUrl = manifestUrl,
                    payload = payload,
                )
            }
        } catch (error: Throwable) {
            return AddAddonResult.Error(error.message ?: getString(Res.string.addon_load_manifest_failed))
        }

        _uiState.update { current ->
            current.copy(
                addons = current.addons + ManagedAddon(
                    manifestUrl = manifestUrl,
                    manifest = manifest,
                    isRefreshing = false,
                    errorMessage = null,
                ),
            )
        }
        persist()
        pushToServer()
        return AddAddonResult.Success(manifest)
    }

    fun removeAddon(manifestUrl: String) {
        if (isUsingPrimaryAddonsFromSecondaryProfile()) return
        log.i { "removeAddon() — $manifestUrl" }
        _uiState.update { current ->
            current.copy(
                addons = current.addons.filterNot { it.manifestUrl == manifestUrl },
            )
        }
        persist()
        pushToServer()
    }

    fun moveAddon(fromIndex: Int, toIndex: Int) {
        if (isUsingPrimaryAddonsFromSecondaryProfile()) return
        _uiState.update { current ->
            val addons = current.addons
            if (
                fromIndex !in addons.indices ||
                toIndex !in addons.indices ||
                fromIndex == toIndex
            ) {
                return@update current
            }

            val reordered = addons.toMutableList()
            val movingAddon = reordered.removeAt(fromIndex)
            reordered.add(toIndex, movingAddon)
            current.copy(addons = reordered)
        }
        persist()
        pushToServer()
    }

    fun refreshAll() {
        _uiState.value.addons.distinctBy { it.manifestUrl }.forEach { addon ->
            refreshAddon(addon.manifestUrl)
        }
    }

    fun refreshAddon(manifestUrl: String) {
        val existingJob = activeRefreshJobs[manifestUrl]
        if (existingJob?.isActive == true) return

        markRefreshing(manifestUrl)
        var refreshJob: Job? = null
        refreshJob = scope.launch {
            try {
                val result = runCatching {
                    val payload = httpGetText(manifestUrl)
                    AddonManifestParser.parse(
                        manifestUrl = manifestUrl,
                        payload = payload,
                    )
                }

                _uiState.update { current ->
                    current.copy(
                        addons = current.addons.map { addon ->
                            if (addon.manifestUrl != manifestUrl) {
                                addon
                            } else {
                                result.fold(
                                    onSuccess = { manifest ->
                                        addon.copy(
                                            manifest = manifest,
                                            isRefreshing = false,
                                            errorMessage = null,
                                        )
                                    },
                                    onFailure = { error ->
                                        addon.copy(
                                            isRefreshing = false,
                                            errorMessage = error.message ?: getString(Res.string.addon_load_manifest_failed),
                                        )
                                    },
                                )
                            }
                        },
                    )
                }
            } finally {
                if (activeRefreshJobs[manifestUrl] === refreshJob) {
                    activeRefreshJobs.remove(manifestUrl)
                }
            }
        }
        activeRefreshJobs[manifestUrl] = refreshJob
    }

    private fun pushToServer() {
        scope.launch {
            runCatching {
                if (isUsingPrimaryAddonsFromSecondaryProfile()) {
                    return@runCatching
                }
                val profileId = currentProfileId
                val addons = _uiState.value.addons
                    .distinctBy { it.manifestUrl }
                    .mapIndexed { index, addon ->
                    AddonPushItem(
                        url = addon.manifestUrl,
                        name = addon.userSetName?.takeIf { it.isNotBlank() } ?: addon.manifest?.name ?: "",
                        enabled = true,
                        sortOrder = index,
                    )
                }
                log.d { "pushToServer() — profileId=$profileId, pushing ${addons.size} addons" }
                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                    put("p_addons", json.encodeToJsonElement(addons))
                }
                SupabaseProvider.client.postgrest.rpc("sync_push_addons", params)
                log.d { "pushToServer() — success" }
            }.onFailure { e ->
                log.e(e) { "pushToServer() — FAILED" }
            }
        }
    }

    private fun markRefreshing(manifestUrl: String) {
        _uiState.update { current ->
            current.copy(
                addons = current.addons.map { addon ->
                    if (addon.manifestUrl == manifestUrl) {
                        addon.copy(
                            isRefreshing = true,
                            errorMessage = null,
                        )
                    } else {
                        addon
                    }
                },
            )
        }
    }

    private fun persist() {
        AddonStorage.saveInstalledAddonUrls(
            currentProfileId,
            dedupeManifestUrls(_uiState.value.addons.map { it.manifestUrl }),
        )
    }

    private fun cancelActiveRefreshes() {
        activeRefreshJobs.values.forEach(Job::cancel)
        activeRefreshJobs.clear()
    }

    private fun resolveEffectiveProfileId(profileId: Int): Int {
        val active = ProfileRepository.state.value.activeProfile
        return if (active != null && active.profileIndex != 1 && active.usesPrimaryAddons) 1 else profileId
    }

    private fun isUsingPrimaryAddonsFromSecondaryProfile(): Boolean {
        val active = ProfileRepository.state.value.activeProfile
        return active != null && active.profileIndex != 1 && active.usesPrimaryAddons
    }
}

private fun ManagedAddon?.toPendingAddon(manifestUrl: String, userSetName: String? = null): ManagedAddon =
    when {
        this == null -> ManagedAddon(
            manifestUrl = manifestUrl,
            isRefreshing = true,
            userSetName = userSetName,
        )
        manifest != null -> copy(
            manifestUrl = manifestUrl,
            isRefreshing = false,
            userSetName = userSetName ?: this.userSetName,
        )
        isRefreshing -> copy(
            manifestUrl = manifestUrl,
            userSetName = userSetName ?: this.userSetName,
        )
        else -> copy(
            manifestUrl = manifestUrl,
            isRefreshing = true,
            errorMessage = null,
            userSetName = userSetName ?: this.userSetName,
        )
    }

private fun dedupeManifestUrls(urls: List<String>): List<String> =
    urls.map(::ensureManifestSuffix).distinct()

private fun ensureManifestSuffix(url: String): String {
    val path = url.substringBefore("?").trimEnd('/')
    val query = url.substringAfter("?", "")
    val withSuffix = if (path.endsWith("/manifest.json")) path else "$path/manifest.json"
    return if (query.isEmpty()) withSuffix else "$withSuffix?$query"
}

private fun normalizeManifestUrl(rawUrl: String): String {
    val trimmed = rawUrl.trim()
    require(trimmed.isNotEmpty()) { "Enter an addon URL." }

    val normalizedScheme = when {
        trimmed.startsWith("http://") || trimmed.startsWith("https://") -> trimmed
        trimmed.startsWith("stremio://") -> "https://${trimmed.removePrefix("stremio://")}"
        else -> "https://$trimmed"
    }

    val withoutFragment = normalizedScheme.substringBefore("#")
    val query = withoutFragment.substringAfter("?", "")
    val path = withoutFragment.substringBefore("?").trimEnd('/')
    val manifestPath = if (path.endsWith("/manifest.json")) {
        path
    } else {
        "$path/manifest.json"
    }

    return if (query.isEmpty()) manifestPath else "$manifestPath?$query"
}
