package com.nuvio.app.features.addons

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
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

private data class RemoteAddonSnapshot(
    val profileId: Int,
    val rows: List<AddonRow>,
)

private data class PendingAddonPush(
    val profileId: Int,
    val revision: Long,
    val addons: List<AddonPushItem>,
)

private data class ManualRefreshOperation(
    val profileId: Int,
    val deferred: Deferred<AddonRefreshState>,
)

private sealed interface SnapshotApplyResult {
    data class Applied(val addons: List<ManagedAddon>) : SnapshotApplyResult
    data object Conflict : SnapshotApplyResult
}

object AddonRepository {
    private const val MANIFEST_REFRESH_CONCURRENCY = 6
    private const val MANIFEST_REFRESH_TIMEOUT_MS = 15_000L
    private const val MANIFEST_REFRESH_TOTAL_TIMEOUT_MS = 30_000L
    private const val REMOTE_PROFILE_TIMEOUT_MS = 15_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("AddonRepository")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val _uiState = MutableStateFlow(AddonsUiState())
    val uiState: StateFlow<AddonsUiState> = _uiState.asStateFlow()
    private val stateLock = SynchronizedObject()
    private val addonSyncMutex = Mutex()

    private var initialized = false
    private var pulledFromServer = false
    private var currentProfileId: Int = 1
    private var localMutationRevision: Long = 0L
    private var refreshRevision: Long = 0L
    private val pendingPushes = linkedMapOf<Int, PendingAddonPush>()
    private var manualRefreshOperation: ManualRefreshOperation? = null
    private val activeRefreshJobs = mutableMapOf<String, Job>()

    fun initialize() {
        val profileId = synchronized(stateLock) {
            val effectiveProfileId = currentEffectiveProfileId()
            if (initialized && currentProfileId == effectiveProfileId) return
            initialized = true
            currentProfileId = effectiveProfileId
            effectiveProfileId
        }
        log.d { "initialize() — loading local addons for profile $profileId" }

        val storedUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(profileId))
        val enabledByUrl = loadLocalEnabledStates(profileId)
        val namesByUrl = loadLocalNames(profileId)
        log.d { "initialize() — local addon count: ${storedUrls.size}" }
        if (storedUrls.isEmpty()) return

        val urlsToRefresh = synchronized(stateLock) {
            if (currentProfileId != profileId || currentEffectiveProfileId() != profileId) return
            val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
            _uiState.update { current ->
                current.copy(
                    addons = storedUrls.map { manifestUrl ->
                        existingByUrl[manifestUrl].toPendingAddon(
                            manifestUrl = manifestUrl,
                            userSetName = namesByUrl[manifestUrl],
                            enabled = enabledByUrl[manifestUrl],
                        )
                    },
                )
            }
            storedUrls.filter { manifestUrl ->
                val existing = existingByUrl[manifestUrl]
                val addon = _uiState.value.addons.firstOrNull { it.manifestUrl == manifestUrl }
                addon?.enabled == true &&
                    (existing == null || (addon.manifest == null && !addon.isRefreshing))
            }
        }

        urlsToRefresh.forEach { manifestUrl ->
            refreshAddon(manifestUrl, expectedProfileId = profileId)
        }
    }

    fun onProfileChanged(profileId: Int) {
        val effectiveProfileId = resolveEffectiveProfileId(profileId)
        synchronized(stateLock) {
            if (effectiveProfileId == currentProfileId && initialized) return
            activeRefreshJobs.values.forEach(Job::cancel)
            activeRefreshJobs.clear()
            manualRefreshOperation?.deferred?.cancel()
            manualRefreshOperation = null
            currentProfileId = effectiveProfileId
            initialized = false
            pulledFromServer = false
            _uiState.value = AddonsUiState(refreshRevision = refreshRevision)
        }
    }

    fun clearLocalState() {
        synchronized(stateLock) {
            activeRefreshJobs.values.forEach(Job::cancel)
            activeRefreshJobs.clear()
            manualRefreshOperation?.deferred?.cancel()
            manualRefreshOperation = null
            pendingPushes.clear()
            currentProfileId = 1
            initialized = false
            pulledFromServer = false
            _uiState.value = AddonsUiState(refreshRevision = refreshRevision)
        }
    }

    suspend fun pullFromServer(profileId: Int) {
        val effectiveProfileId = resolveEffectiveProfileId(profileId)
        log.i {
            "pullFromServer() — profileId=$profileId, effectiveProfileId=$effectiveProfileId, " +
                "initialized=$initialized, pulledFromServer=$pulledFromServer"
        }
        runCatching {
            addonSyncMutex.withLock {
                if (currentEffectiveProfileId() != effectiveProfileId) {
                    log.d { "pullFromServer() — ignored stale request for profile $effectiveProfileId" }
                    return@withLock
                }
                if (!flushPendingPushLocked(effectiveProfileId)) {
                    log.w { "pullFromServer() — skipped because pending local addon changes could not be uploaded" }
                    return@withLock
                }
                if (currentEffectiveProfileId() != effectiveProfileId) {
                    log.d { "pullFromServer() — profile changed while pending changes were uploaded" }
                    return@withLock
                }
                performAutomaticPull(effectiveProfileId)
                if (!flushPendingPushLocked(effectiveProfileId)) {
                    log.w { "pullFromServer() — refreshed state applied but pending changes remain" }
                }
            }
        }.onFailure { error ->
            log.e(error) { "pullFromServer() — FAILED" }
        }
    }

    suspend fun refreshAll(): AddonRefreshState {
        initialize()
        val effectiveProfileId = resolveEffectiveProfileId(ProfileRepository.activeProfileId)
        val operation = synchronized(stateLock) {
            manualRefreshOperation
                ?.takeIf { it.profileId == effectiveProfileId && it.deferred.isActive }
                ?: run {
                    manualRefreshOperation
                        ?.takeIf { it.profileId != effectiveProfileId }
                        ?.deferred
                        ?.cancel()
                    _uiState.update { current ->
                        current.copy(refreshState = AddonRefreshState.Refreshing)
                    }
                    val deferred = scope.async {
                        performManualRefresh(effectiveProfileId)
                    }
                    ManualRefreshOperation(
                        profileId = effectiveProfileId,
                        deferred = deferred,
                    ).also { created ->
                        manualRefreshOperation = created
                        deferred.invokeOnCompletion {
                            scope.launch {
                                synchronized(stateLock) {
                                    if (manualRefreshOperation === created) {
                                        manualRefreshOperation = null
                                    }
                                }
                            }
                        }
                    }
                }
        }
        return operation.deferred.await()
    }

    suspend fun awaitManifestsLoaded() {
        if (_uiState.value.addons.isEmpty()) return
        uiState.first { state ->
            state.addons.isEmpty() ||
                state.addons.any { it.manifest != null } ||
                state.addons.none { it.isRefreshing }
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

        synchronized(stateLock) {
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
            persistLocked(currentProfileId)
            queueCurrentStatePushLocked()
        }
        schedulePendingPush()
        return AddAddonResult.Success(manifest)
    }

    fun removeAddon(manifestUrl: String) {
        if (isUsingPrimaryAddonsFromSecondaryProfile()) return
        log.i { "removeAddon() — $manifestUrl" }
        synchronized(stateLock) {
            _uiState.update { current ->
                current.copy(
                    addons = current.addons.filterNot { it.manifestUrl == manifestUrl },
                )
            }
            persistLocked(currentProfileId)
            queueCurrentStatePushLocked()
        }
        schedulePendingPush()
    }

    fun moveAddon(fromIndex: Int, toIndex: Int) {
        if (isUsingPrimaryAddonsFromSecondaryProfile()) return
        var changed = false
        synchronized(stateLock) {
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
                changed = true
                current.copy(addons = reordered)
            }
            if (changed) {
                persistLocked(currentProfileId)
                queueCurrentStatePushLocked()
            }
        }
        if (changed) schedulePendingPush()
    }

    fun setAddonEnabled(manifestUrl: String, enabled: Boolean) {
        if (isUsingPrimaryAddonsFromSecondaryProfile()) return
        var shouldRefresh = false
        var changed = false
        synchronized(stateLock) {
            _uiState.update { current ->
                current.copy(
                    addons = current.addons.map { addon ->
                        if (addon.manifestUrl != manifestUrl || addon.enabled == enabled) {
                            addon
                        } else {
                            changed = true
                            shouldRefresh = enabled && addon.manifest == null && !addon.isRefreshing
                            addon.copy(enabled = enabled)
                        }
                    },
                )
            }
            if (changed) {
                persistLocked(currentProfileId)
                queueCurrentStatePushLocked()
            }
        }
        if (changed) schedulePendingPush()
        if (shouldRefresh) {
            refreshAddon(manifestUrl)
        }
    }

    fun refreshAddon(
        manifestUrl: String,
        expectedProfileId: Int? = null,
    ) {
        lateinit var refreshJob: Job
        val shouldStart = synchronized(stateLock) {
            val profileId = expectedProfileId ?: currentProfileId
            if (
                currentProfileId != profileId ||
                activeRefreshJobs[manifestUrl]?.isActive == true
            ) {
                false
            } else {
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
                refreshJob = scope.launch(start = CoroutineStart.LAZY) {
                    try {
                        applyManifestResult(
                            manifestUrl = manifestUrl,
                            result = fetchManifest(manifestUrl),
                            expectedProfileId = profileId,
                        )
                    } finally {
                        synchronized(stateLock) {
                            if (activeRefreshJobs[manifestUrl] === refreshJob) {
                                activeRefreshJobs.remove(manifestUrl)
                            }
                        }
                    }
                }
                activeRefreshJobs[manifestUrl] = refreshJob
                true
            }
        }
        if (shouldStart) {
            refreshJob.start()
        }
    }

    private suspend fun performAutomaticPull(profileId: Int) {
        val isCurrentProfile = synchronized(stateLock) {
            if (currentEffectiveProfileId() != profileId) {
                false
            } else {
                currentProfileId = profileId
                true
            }
        }
        if (!isCurrentProfile) return
        val expectedRevision = synchronized(stateLock) { localMutationRevision }
        val snapshot = fetchRemoteSnapshot(profileId)
        val rowsByUrl = snapshot.normalizedRowsByUrl()
        val urls = rowsByUrl.keys.toList()
        log.i { "pullFromServer() — server returned ${snapshot.rows.size} addons" }

        val shouldAttemptMigration = synchronized(stateLock) { !pulledFromServer }
        if (urls.isEmpty() && shouldAttemptMigration) {
            val localUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(profileId))
            log.i { "pullFromServer() — server empty, local has ${localUrls.size} addons" }
            if (localUrls.isNotEmpty()) {
                if (currentEffectiveProfileId() != profileId) return
                log.i { "pullFromServer() — migrating local addons to server for profile $profileId" }
                val enabledByUrl = loadLocalEnabledStates(profileId)
                val namesByUrl = loadLocalNames(profileId)
                val existingByUrl = synchronized(stateLock) {
                    if (currentProfileId != profileId) return
                    _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
                }
                val request = PendingAddonPush(
                    profileId = profileId,
                    revision = expectedRevision,
                    addons = localUrls.mapIndexed { index, url ->
                        AddonPushItem(
                            url = url,
                            name = namesByUrl[url]
                                ?: existingByUrl[url]?.userSetName
                                ?: "",
                            enabled = enabledByUrl[url] ?: true,
                            sortOrder = index,
                        )
                    },
                )
                if (currentEffectiveProfileId() != profileId) return
                if (!pushSnapshot(request)) {
                    error("Failed to migrate local addons to Nuvio Sync")
                }
                synchronized(stateLock) {
                    if (currentProfileId == profileId && currentEffectiveProfileId() == profileId) {
                        _uiState.update { current ->
                            current.copy(
                                addons = localUrls.map { url ->
                                    existingByUrl[url].toPendingAddon(
                                        manifestUrl = url,
                                        userSetName = namesByUrl[url],
                                        enabled = enabledByUrl[url],
                                    )
                                },
                            )
                        }
                        persistLocked(profileId)
                        pulledFromServer = true
                        initialized = true
                    }
                }
                refreshMissingManifests(
                    profileId = profileId,
                    existingByUrl = existingByUrl,
                )
                log.i { "pullFromServer() — migration push done (${request.addons.size} addons)" }
                return
            }
        }

        if (urls.isEmpty()) {
            val localUrls = dedupeManifestUrls(AddonStorage.loadInstalledAddonUrls(profileId))
            if (localUrls.isNotEmpty()) {
                log.w {
                    "pullFromServer() — remote empty while local has ${localUrls.size} addons; " +
                        "preserving existing startup behavior"
                }
                val enabledByUrl = loadLocalEnabledStates(profileId)
                val namesByUrl = loadLocalNames(profileId)
                val existingByUrl = _uiState.value.addons.associateBy(ManagedAddon::manifestUrl)
                synchronized(stateLock) {
                    if (
                        !canApplyRemoteAddonSnapshot(
                            currentProfileId = currentProfileId,
                            snapshotProfileId = profileId,
                            currentMutationRevision = localMutationRevision,
                            expectedMutationRevision = expectedRevision,
                            hasPendingPush = pendingPushes.containsKey(profileId),
                        )
                    ) {
                        log.w { "pullFromServer() — local addons changed while the cloud request was running" }
                        return
                    }
                    _uiState.update { current ->
                        current.copy(
                            addons = localUrls.map { url ->
                                existingByUrl[url].toPendingAddon(
                                    manifestUrl = url,
                                    userSetName = namesByUrl[url],
                                    enabled = enabledByUrl[url],
                                )
                            },
                        )
                    }
                    persistLocked(profileId)
                    pulledFromServer = true
                    initialized = true
                }
                refreshMissingManifests(
                    profileId = profileId,
                    existingByUrl = existingByUrl,
                )
                return
            }
        }

        when (
            val applied = applyRemoteSnapshot(
                snapshot = snapshot,
                expectedRevision = expectedRevision,
                forceManifestRefresh = false,
            )
        ) {
            is SnapshotApplyResult.Applied -> {
                applied.addons
                    .filter { it.enabled && it.manifest == null }
                    .forEach {
                        refreshAddon(
                            manifestUrl = it.manifestUrl,
                            expectedProfileId = profileId,
                        )
                    }
                synchronized(stateLock) {
                    if (currentProfileId == profileId && currentEffectiveProfileId() == profileId) {
                        pulledFromServer = true
                        initialized = true
                    }
                }
                log.i { "pullFromServer() — applied ${applied.addons.size} addons to state" }
            }

            SnapshotApplyResult.Conflict -> {
                log.w { "pullFromServer() — local addon changes won; remote snapshot was not applied" }
            }
        }
    }

    private suspend fun performManualRefresh(profileId: Int): AddonRefreshState {
        val result = try {
            addonSyncMutex.withLock {
                val authState = AuthRepository.state.value
                val usesCloudSync = authState is AuthState.Authenticated && !authState.isAnonymous
                if (usesCloudSync && !flushPendingPushLocked(profileId)) {
                    return@withLock AddonRefreshState.Failed(
                        getString(Res.string.addons_refresh_error_pending_upload),
                    )
                }
                if (currentEffectiveProfileId() != profileId) {
                    return@withLock AddonRefreshState.Conflict
                }

                val addons = when (authState) {
                    is AuthState.Authenticated -> {
                        if (authState.isAnonymous) {
                            prepareLocalManifestRefresh(profileId)
                        } else {
                            val expectedRevision = synchronized(stateLock) { localMutationRevision }
                            val snapshot = try {
                                withTimeoutOrNull(REMOTE_PROFILE_TIMEOUT_MS) {
                                    fetchRemoteSnapshot(profileId)
                                } ?: return@withLock AddonRefreshState.Failed(
                                    getString(Res.string.addons_refresh_error_sync_timeout),
                                )
                            } catch (error: CancellationException) {
                                throw error
                            } catch (error: Throwable) {
                                return@withLock AddonRefreshState.Failed(
                                    error.message ?: getString(Res.string.addons_refresh_error_sync),
                                )
                            }

                            when (
                                val applied = applyRemoteSnapshot(
                                    snapshot = snapshot,
                                    expectedRevision = expectedRevision,
                                    forceManifestRefresh = true,
                                )
                            ) {
                                is SnapshotApplyResult.Applied -> applied.addons
                                SnapshotApplyResult.Conflict -> {
                                    return@withLock if (flushPendingPushLocked(profileId)) {
                                        AddonRefreshState.Conflict
                                    } else {
                                        AddonRefreshState.Failed(
                                            getString(Res.string.addons_refresh_error_pending_upload),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    AuthState.Loading,
                    AuthState.Unauthenticated,
                    -> prepareLocalManifestRefresh(profileId)
                }

                val manifestResult = refreshEnabledManifests(
                    addons = addons,
                    profileId = profileId,
                )
                if (!usesCloudSync || flushPendingPushLocked(profileId)) {
                    manifestResult
                } else {
                    manifestResult.withPendingPushWarning()
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.e(error) { "refreshAll() — FAILED" }
            AddonRefreshState.Failed(
                error.message ?: getString(Res.string.addons_refresh_error_default),
            )
        }

        synchronized(stateLock) {
            if (currentEffectiveProfileId() == profileId) {
                if (
                    result is AddonRefreshState.Complete ||
                    result is AddonRefreshState.Partial
                ) {
                    refreshRevision += 1
                }
                _uiState.update { current ->
                    current.copy(
                        refreshState = result,
                        refreshRevision = refreshRevision,
                    )
                }
            }
        }
        return result
    }

    private suspend fun fetchRemoteSnapshot(profileId: Int): RemoteAddonSnapshot =
        RemoteAddonSnapshot(
            profileId = profileId,
            rows = SupabaseProvider.client.postgrest
                .from("addons")
                .select {
                    filter { eq("profile_id", profileId) }
                    order("sort_order", Order.ASCENDING)
                }
                .decodeList<AddonRow>(),
        )

    private fun applyRemoteSnapshot(
        snapshot: RemoteAddonSnapshot,
        expectedRevision: Long,
        forceManifestRefresh: Boolean,
    ): SnapshotApplyResult {
        val rowsByUrl = snapshot.normalizedRowsByUrl()
        return synchronized(stateLock) {
            if (
                !canApplyRemoteAddonSnapshot(
                    currentProfileId = currentProfileId,
                    snapshotProfileId = snapshot.profileId,
                    currentMutationRevision = localMutationRevision,
                    expectedMutationRevision = expectedRevision,
                    hasPendingPush = pendingPushes.containsKey(snapshot.profileId),
                )
            ) {
                return@synchronized SnapshotApplyResult.Conflict
            }

            if (forceManifestRefresh) {
                activeRefreshJobs.values.forEach(Job::cancel)
                activeRefreshJobs.clear()
            }
            val addons = mergeRemoteAddonSnapshot(
                existingAddons = _uiState.value.addons,
                remoteAddons = rowsByUrl.map { (url, row) ->
                    RemoteAddonValue(
                        manifestUrl = url,
                        userSetName = row.name,
                        enabled = row.enabled,
                    )
                },
                forceManifestRefresh = forceManifestRefresh,
            )
            _uiState.update { current ->
                current.copy(addons = addons)
            }
            persistLocked(snapshot.profileId)
            SnapshotApplyResult.Applied(addons)
        }
    }

    private fun prepareLocalManifestRefresh(profileId: Int): List<ManagedAddon> {
        return synchronized(stateLock) {
            if (currentProfileId != profileId) return@synchronized emptyList()
            activeRefreshJobs.values.forEach(Job::cancel)
            activeRefreshJobs.clear()
            val addons = _uiState.value.addons.map { addon ->
                if (addon.enabled) {
                    addon.copy(isRefreshing = true, errorMessage = null)
                } else {
                    addon
                }
            }
            _uiState.update { current -> current.copy(addons = addons) }
            addons
        }
    }

    private suspend fun refreshEnabledManifests(
        addons: List<ManagedAddon>,
        profileId: Int,
    ): AddonRefreshState {
        val enabledUrls = addons
            .filter(ManagedAddon::enabled)
            .map(ManagedAddon::manifestUrl)
            .distinct()
        if (enabledUrls.isEmpty()) {
            return AddonRefreshState.Complete(
                addonCount = addons.size,
                refreshedManifestCount = 0,
            )
        }

        val semaphore = Semaphore(MANIFEST_REFRESH_CONCURRENCY)
        val manifestTimeoutMessage = getString(Res.string.addons_refresh_error_manifest_timeout)
        val completed = withTimeoutOrNull(MANIFEST_REFRESH_TOTAL_TIMEOUT_MS) {
            coroutineScope {
                enabledUrls.map { manifestUrl ->
                    async {
                        semaphore.withPermit {
                            val result = withTimeoutOrNull(MANIFEST_REFRESH_TIMEOUT_MS) {
                                fetchManifest(manifestUrl)
                            } ?: Result.failure(IllegalStateException(manifestTimeoutMessage))
                            applyManifestResult(
                                manifestUrl = manifestUrl,
                                result = result,
                                expectedProfileId = profileId,
                            )
                            result.isSuccess
                        }
                    }
                }.awaitAll()
            }
        }

        val refreshedCount = completed?.count { it } ?: synchronized(stateLock) {
            enabledUrls.count { url ->
                _uiState.value.addons.firstOrNull { it.manifestUrl == url }
                    ?.let { !it.isRefreshing && it.errorMessage == null && it.manifest != null }
                    ?: false
            }
        }
        val failedCount = enabledUrls.size - refreshedCount
        if (completed == null) {
            finishTimedOutManifests(
                manifestUrls = enabledUrls,
                expectedProfileId = profileId,
            )
        }

        return if (failedCount == 0) {
            AddonRefreshState.Complete(
                addonCount = addons.size,
                refreshedManifestCount = refreshedCount,
            )
        } else {
            AddonRefreshState.Partial(
                addonCount = addons.size,
                refreshedManifestCount = refreshedCount,
                failedManifestCount = failedCount,
            )
        }
    }

    private suspend fun AddonRefreshState.withPendingPushWarning(): AddonRefreshState {
        val warning = getString(Res.string.addons_refresh_warning_pending_upload)
        return when (this) {
            is AddonRefreshState.Complete -> AddonRefreshState.Partial(
                addonCount = addonCount,
                refreshedManifestCount = refreshedManifestCount,
                failedManifestCount = 0,
                warningMessage = warning,
            )
            is AddonRefreshState.Partial -> copy(warningMessage = warning)
            else -> this
        }
    }

    private suspend fun fetchManifest(manifestUrl: String): Result<AddonManifest> =
        try {
            val payload = httpGetText(manifestUrl)
            Result.success(
                AddonManifestParser.parse(
                    manifestUrl = manifestUrl,
                    payload = payload,
                ),
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            Result.failure(error)
        }

    private suspend fun applyManifestResult(
        manifestUrl: String,
        result: Result<AddonManifest>,
        expectedProfileId: Int,
    ) {
        val fallbackError = if (result.isFailure) {
            getString(Res.string.addon_load_manifest_failed)
        } else {
            ""
        }
        synchronized(stateLock) {
            if (currentProfileId != expectedProfileId) return
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
                                        errorMessage = error.message ?: fallbackError,
                                    )
                                },
                            )
                        }
                    },
                )
            }
        }
    }

    private suspend fun finishTimedOutManifests(
        manifestUrls: List<String>,
        expectedProfileId: Int,
    ) {
        val timeoutMessage = getString(Res.string.addon_load_manifest_failed)
        synchronized(stateLock) {
            if (currentProfileId != expectedProfileId) return
            _uiState.update { current ->
                current.copy(
                    addons = current.addons.map { addon ->
                        if (addon.manifestUrl in manifestUrls && addon.isRefreshing) {
                            addon.copy(
                                isRefreshing = false,
                                errorMessage = timeoutMessage,
                            )
                        } else {
                            addon
                        }
                    },
                )
            }
        }
    }

    private fun refreshMissingManifests(
        profileId: Int,
        existingByUrl: Map<String, ManagedAddon>,
    ) {
        val urlsToRefresh = synchronized(stateLock) {
            if (currentProfileId != profileId) return
            _uiState.value.addons.mapNotNull { addon ->
                val existing = existingByUrl[addon.manifestUrl]
                addon.manifestUrl.takeIf {
                    addon.enabled &&
                        (existing == null || (addon.manifest == null && !addon.isRefreshing))
                }
            }
        }
        urlsToRefresh.forEach { manifestUrl ->
            refreshAddon(
                manifestUrl = manifestUrl,
                expectedProfileId = profileId,
            )
        }
    }

    private fun queueCurrentStatePushLocked() {
        localMutationRevision += 1
        pendingPushes[currentProfileId] = buildPushRequestLocked(
            profileId = currentProfileId,
            revision = localMutationRevision,
        )
    }

    private fun buildPushRequestLocked(
        profileId: Int,
        revision: Long,
    ): PendingAddonPush =
        PendingAddonPush(
            profileId = profileId,
            revision = revision,
            addons = _uiState.value.addons
                .distinctBy(ManagedAddon::manifestUrl)
                .mapIndexed { index, addon ->
                    AddonPushItem(
                        url = addon.manifestUrl,
                        name = addon.userSetName?.takeIf { it.isNotBlank() }.orEmpty(),
                        enabled = addon.enabled,
                        sortOrder = index,
                    )
                },
        )

    private fun schedulePendingPush() {
        scope.launch {
            val authState = AuthRepository.state.value
            if (authState !is AuthState.Authenticated || authState.isAnonymous) {
                return@launch
            }
            addonSyncMutex.withLock {
                flushAllPendingPushesLocked()
            }
        }
    }

    private suspend fun flushPendingPushLocked(profileId: Int): Boolean {
        while (true) {
            val request = synchronized(stateLock) { pendingPushes[profileId] } ?: return true
            if (!pushSnapshot(request)) return false
            synchronized(stateLock) {
                if (pendingPushes[profileId]?.revision == request.revision) {
                    pendingPushes.remove(profileId)
                }
            }
        }
    }

    private suspend fun flushAllPendingPushesLocked(): Boolean {
        val profileIds = synchronized(stateLock) { pendingPushes.keys.toList() }
        var allSucceeded = true
        profileIds.forEach { profileId ->
            if (!flushPendingPushLocked(profileId)) {
                allSucceeded = false
            }
        }
        return allSucceeded
    }

    private suspend fun pushSnapshot(request: PendingAddonPush): Boolean =
        runCatching {
            log.d {
                "pushToServer() — profileId=${request.profileId}, " +
                    "pushing ${request.addons.size} addons"
            }
            val params = buildJsonObject {
                put("p_profile_id", request.profileId)
                put("p_addons", json.encodeToJsonElement(request.addons))
                putSyncOriginClientId()
            }
            SupabaseProvider.client.postgrest.rpc("sync_push_addons", params)
            log.d { "pushToServer() — success" }
        }.onFailure { error ->
            log.e(error) { "pushToServer() — FAILED" }
        }.isSuccess

    private fun RemoteAddonSnapshot.normalizedRowsByUrl(): LinkedHashMap<String, AddonRow> =
        linkedMapOf<String, AddonRow>().apply {
            rows.forEach { row ->
                if (row.url.isBlank()) return@forEach
                val manifestUrl = ensureManifestSuffix(row.url)
                if (!containsKey(manifestUrl)) {
                    put(manifestUrl, row.copy(url = manifestUrl))
                }
            }
        }

    private fun currentEffectiveProfileId(): Int =
        resolveEffectiveProfileId(ProfileRepository.activeProfileId)

    private fun persistLocked(profileId: Int) {
        val addons = _uiState.value.addons
        AddonStorage.saveInstalledAddonUrls(
            profileId,
            dedupeManifestUrls(addons.map { it.manifestUrl }),
        )
        AddonStorage.saveAddonEnabledStates(
            profileId,
            addons.associate { it.manifestUrl to it.enabled },
        )
        AddonStorage.saveAddonNames(
            profileId,
            addons.mapNotNull { addon ->
                addon.userSetName
                    ?.takeIf(String::isNotBlank)
                    ?.let { addon.manifestUrl to it }
            }.toMap(),
        )
    }

    private fun loadLocalEnabledStates(profileId: Int): Map<String, Boolean> =
        AddonStorage.loadAddonEnabledStates(profileId)
            .mapKeys { (url, _) -> ensureManifestSuffix(url) }

    private fun loadLocalNames(profileId: Int): Map<String, String> =
        AddonStorage.loadAddonNames(profileId)
            .mapKeys { (url, _) -> ensureManifestSuffix(url) }

    private fun resolveEffectiveProfileId(profileId: Int): Int {
        val active = ProfileRepository.state.value.activeProfile
        return if (active != null && active.profileIndex != 1 && active.usesPrimaryAddons) 1 else profileId
    }

    private fun isUsingPrimaryAddonsFromSecondaryProfile(): Boolean {
        val active = ProfileRepository.state.value.activeProfile
        return active != null && active.profileIndex != 1 && active.usesPrimaryAddons
    }
}

internal fun ManagedAddon?.toPendingAddon(
    manifestUrl: String,
    userSetName: String? = null,
    enabled: Boolean? = null,
): ManagedAddon =
    when {
        this == null -> ManagedAddon(
            manifestUrl = manifestUrl,
            isRefreshing = enabled ?: true,
            userSetName = userSetName,
            enabled = enabled ?: true,
        )
        manifest != null -> copy(
            manifestUrl = manifestUrl,
            isRefreshing = false,
            userSetName = userSetName ?: this.userSetName,
            enabled = enabled ?: this.enabled,
        )
        isRefreshing -> copy(
            manifestUrl = manifestUrl,
            userSetName = userSetName ?: this.userSetName,
            enabled = enabled ?: this.enabled,
        )
        else -> copy(
            manifestUrl = manifestUrl,
            isRefreshing = enabled ?: this.enabled,
            errorMessage = null,
            userSetName = userSetName ?: this.userSetName,
            enabled = enabled ?: this.enabled,
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
    require(trimmed.isNotEmpty()) { runBlocking { getString(Res.string.addons_error_enter_url) } }

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
