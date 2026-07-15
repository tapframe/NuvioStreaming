package com.nuvio.app.core.sync

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.collection.CollectionSyncService
import com.nuvio.app.features.home.HomeCatalogSettingsSyncService
import com.nuvio.app.features.library.LibrarySourceMode
import com.nuvio.app.features.library.LibraryRepository
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktCredentialSync
import com.nuvio.app.features.trakt.TraktPlatformClock
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.effectiveLibrarySourceMode
import com.nuvio.app.features.trakt.shouldUseTraktProgress
import com.nuvio.app.features.watchprogress.WatchProgressSourceCoordinator
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private const val FOREGROUND_PULL_DELAY_MS = 2500L
private const val FOREGROUND_PULL_MIN_INTERVAL_MS = 30 * 60_000L
private const val PERIODIC_NUVIO_SYNC_PULL_INTERVAL_MS = 240_000L

internal enum class ProfileSyncStep {
    Addons,
    Plugins,
    ProfileSettings,
    TraktCredentials,
    Library,
    ActiveWatchSource,
    Collections,
    HomeCatalogSettings,
}

internal data class ProfileSyncOperations(
    val pullAddons: suspend (Int) -> Unit,
    val pullPlugins: suspend (Int) -> Unit,
    val pullProfileSettings: suspend (Int) -> Unit,
    val pullTraktCredentials: suspend (Int) -> Unit,
    val pullLibrary: suspend (Int) -> Unit,
    val refreshActiveWatchSource: suspend (Int) -> Unit,
    val pullCollections: suspend (Int) -> Unit,
    val pullHomeCatalogSettings: suspend (Int) -> Unit,
)

internal data class ProfileSyncResult(
    val failedSteps: Set<ProfileSyncStep>,
) {
    val succeeded: Boolean
        get() = failedSteps.isEmpty()
}

internal suspend fun runOrderedProfileSync(
    profileId: Int,
    pluginsEnabled: Boolean,
    operations: ProfileSyncOperations,
    onFailure: (ProfileSyncStep, Throwable) -> Unit = { _, _ -> },
): ProfileSyncResult {
    val failureLock = SynchronizedObject()
    val failedSteps = mutableSetOf<ProfileSyncStep>()

    suspend fun runStep(
        step: ProfileSyncStep,
        operation: suspend (Int) -> Unit,
    ) {
        try {
            operation(profileId)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            synchronized(failureLock) {
                failedSteps += step
            }
            onFailure(step, error)
        }
    }

    runStep(ProfileSyncStep.Addons, operations.pullAddons)
    if (pluginsEnabled) {
        runStep(ProfileSyncStep.Plugins, operations.pullPlugins)
    }

    coroutineScope {
        val settingsJob = launch {
            runStep(ProfileSyncStep.ProfileSettings, operations.pullProfileSettings)
        }
        val credentialsJob = launch {
            runStep(ProfileSyncStep.TraktCredentials, operations.pullTraktCredentials)
        }
        settingsJob.join()
        credentialsJob.join()
    }

    coroutineScope {
        launch {
            runStep(ProfileSyncStep.Library, operations.pullLibrary)
        }
        launch {
            runStep(ProfileSyncStep.ActiveWatchSource, operations.refreshActiveWatchSource)
        }
        launch {
            runStep(ProfileSyncStep.Collections, operations.pullCollections)
        }
        launch {
            runStep(ProfileSyncStep.HomeCatalogSettings, operations.pullHomeCatalogSettings)
        }
    }
    return ProfileSyncResult(
        failedSteps = synchronized(failureLock) { failedSteps.toSet() },
    )
}

internal enum class ProfileSyncRequestResult {
    Started,
    Coalesced,
    Replaced,
}

internal class ProfileSyncRequestGate {
    private data class PendingRequest(
        val scope: CoroutineScope,
        val profileId: Int,
        val block: suspend () -> Unit,
    )

    private val lock = SynchronizedObject()
    private var activeProfileId: Int? = null
    private var activeJob: Job? = null
    private var pendingRequest: PendingRequest? = null

    fun launch(
        scope: CoroutineScope,
        profileId: Int,
        queueIfCoalesced: Boolean = false,
        block: suspend () -> Unit,
    ): ProfileSyncRequestResult {
        lateinit var newJob: Job
        var previousJob: Job? = null
        val result = synchronized(lock) {
            val active = activeJob?.takeUnless(Job::isCompleted)
            if (active != null && activeProfileId == profileId) {
                if (queueIfCoalesced) {
                    pendingRequest = PendingRequest(scope = scope, profileId = profileId, block = block)
                }
                return ProfileSyncRequestResult.Coalesced
            }

            previousJob = active
            pendingRequest = null
            val requestResult = if (active == null) {
                ProfileSyncRequestResult.Started
            } else {
                ProfileSyncRequestResult.Replaced
            }

            newJob = scope.launch(start = CoroutineStart.LAZY) {
                block()
            }
            activeProfileId = profileId
            activeJob = newJob
            newJob.invokeOnCompletion {
                var pending: PendingRequest? = null
                synchronized(lock) {
                    if (activeJob === newJob) {
                        activeJob = null
                        activeProfileId = null
                        pending = pendingRequest
                        pendingRequest = null
                    }
                }
                pending?.let { request ->
                    launch(
                        scope = request.scope,
                        profileId = request.profileId,
                        queueIfCoalesced = false,
                        block = request.block,
                    )
                }
            }
            requestResult
        }

        previousJob?.cancel()
        newJob.start()
        return result
    }

    fun cancel() {
        val job = synchronized(lock) {
            activeJob.also {
                activeJob = null
                activeProfileId = null
                pendingRequest = null
            }
        }
        job?.cancel()
    }
}

object SyncManager {
    private val log = Logger.withTag("SyncManager")
    private val fullSyncRequestGate = ProfileSyncRequestGate()
    private val accountScopeLock = SynchronizedObject()
    private var accountScopeJob: Job = SupervisorJob()
    private var accountScope = CoroutineScope(accountScopeJob + Dispatchers.Default)
    private val pullStateLock = SynchronizedObject()
    private var foregroundPullJob: Job? = null
    private var foregroundPullProfileId: Int? = null
    private var periodicNuvioSyncPullJob: Job? = null
    private var periodicNuvioSyncProfileId: Int? = null
    private var lastFullPullAtMs: Long = 0L
    private var lastFullPullProfileId: Int? = null

    private val profileSyncOperations = ProfileSyncOperations(
        pullAddons = { profileId -> AddonRepository.pullFromServer(profileId) },
        pullPlugins = { profileId -> PluginRepository.pullFromServer(profileId) },
        pullProfileSettings = { profileId -> ProfileSettingsSync.pull(profileId) },
        pullTraktCredentials = { profileId -> TraktCredentialSync.pullFromRemoteOrThrow(profileId) },
        pullLibrary = { profileId -> LibraryRepository.pullFromServer(profileId) },
        refreshActiveWatchSource = { profileId ->
            val result = WatchProgressSourceCoordinator.refreshActiveSource(profileId = profileId, force = true)
            check(result.succeeded) {
                "Active watch source refresh was incomplete: " +
                    "progress=${result.progressRefreshed} watched=${result.watchedHistoryRefreshed}"
            }
        },
        pullCollections = { profileId -> CollectionSyncService.pullFromServer(profileId) },
        pullHomeCatalogSettings = { profileId -> HomeCatalogSettingsSyncService.pullFromServer(profileId) },
    )

    fun pullAllForProfile(profileId: Int) {
        startFullProfilePull(profileId = profileId, reason = "requested")
    }

    internal fun cancelAccountSync() {
        fullSyncRequestGate.cancel()
        val previousAccountJob = synchronized(accountScopeLock) {
            accountScopeJob.also {
                accountScopeJob = SupervisorJob()
                accountScope = CoroutineScope(accountScopeJob + Dispatchers.Default)
            }
        }
        previousAccountJob.cancel()
        val foregroundJob = synchronized(pullStateLock) {
            foregroundPullJob.also {
                foregroundPullJob = null
                foregroundPullProfileId = null
                lastFullPullAtMs = 0L
                lastFullPullProfileId = null
            }
        }
        foregroundJob?.cancel()
        stopPeriodicNuvioSyncPull()
    }

    private fun accountScopeSnapshot(): CoroutineScope = synchronized(accountScopeLock) {
        accountScope
    }

    fun requestForegroundPull(profileId: Int, force: Boolean = false) {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) return

        if (!force && hasRecentFullPull(profileId)) {
            return
        }
        lateinit var requestJob: Job
        var previousJob: Job? = null
        synchronized(pullStateLock) {
            if (
                !force &&
                foregroundPullJob?.isCompleted == false &&
                foregroundPullProfileId == profileId
            ) {
                return
            }

            previousJob = foregroundPullJob
            requestJob = accountScopeSnapshot().launch(start = CoroutineStart.LAZY) {
                try {
                    if (!force) {
                        delay(FOREGROUND_PULL_DELAY_MS)
                    }
                    if (!force && hasRecentFullPull(profileId)) return@launch
                    if (ProfileRepository.activeProfileId != profileId) return@launch
                    pullForegroundForProfile(profileId)
                } finally {
                    synchronized(pullStateLock) {
                        if (foregroundPullJob === requestJob) {
                            foregroundPullJob = null
                            foregroundPullProfileId = null
                        }
                    }
                }
            }
            foregroundPullProfileId = profileId
            foregroundPullJob = requestJob
        }
        previousJob?.cancel()
        requestJob.start()
    }

    private fun hasRecentFullPull(profileId: Int): Boolean =
        synchronized(pullStateLock) {
            lastFullPullProfileId == profileId &&
                TraktPlatformClock.nowEpochMs() - lastFullPullAtMs < FOREGROUND_PULL_MIN_INTERVAL_MS
        }

    private suspend fun pullForegroundForProfile(profileId: Int) {
        log.i { "Foreground sync started profile=$profileId" }

        runCatching { ProfileRepository.pullProfiles() }
            .onFailure { log.e(it) { "Foreground profiles pull failed" } }
        runCatching { ProfileSettingsSync.pull(profileId) }
            .onFailure { log.e(it) { "Foreground profile settings pull failed" } }

        coroutineScope {
            launch {
                runCatching { AddonRepository.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Foreground addons pull failed" } }
            }
            if (AppFeaturePolicy.pluginsEnabled) {
                launch {
                    runCatching { PluginRepository.pullFromServer(profileId) }
                        .onFailure { log.e(it) { "Foreground plugins pull failed" } }
                }
            }
            launch {
                runCatching { LibraryRepository.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Foreground library pull failed" } }
            }
            launch {
                runCatching {
                    WatchProgressSourceCoordinator.refreshActiveSource(profileId = profileId, force = true)
                }.onFailure { log.e(it) { "Foreground active watch source pull failed" } }
            }
            launch {
                runCatching { CollectionSyncService.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Foreground collections pull failed" } }
            }
            launch {
                runCatching { HomeCatalogSettingsSyncService.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Foreground home catalog settings pull failed" } }
            }
        }

        log.i { "Foreground sync completed profile=$profileId" }
    }

    private fun startFullProfilePull(
        profileId: Int,
        reason: String,
        queueIfCoalesced: Boolean = false,
    ) {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) return
        if (ProfileRepository.activeProfileId != profileId) return

        val result = fullSyncRequestGate.launch(
            scope = accountScopeSnapshot(),
            profileId = profileId,
            queueIfCoalesced = queueIfCoalesced,
        ) {
            val currentAuthState = AuthRepository.state.value
            if (currentAuthState !is AuthState.Authenticated || currentAuthState.isAnonymous) return@launch
            if (ProfileRepository.activeProfileId != profileId) return@launch

            log.i { "Full profile sync started profile=$profileId reason=$reason" }
            WatchProgressSourceCoordinator.pauseAutomaticTransitions()
            val syncResult = try {
                runOrderedProfileSync(
                    profileId = profileId,
                    pluginsEnabled = AppFeaturePolicy.pluginsEnabled,
                    operations = profileSyncOperations,
                    onFailure = { step, error ->
                        log.e(error) { "Full profile sync step failed profile=$profileId step=$step" }
                    },
                )
            } finally {
                WatchProgressSourceCoordinator.resumeAutomaticTransitions()
            }
            if (syncResult.succeeded) {
                synchronized(pullStateLock) {
                    lastFullPullAtMs = TraktPlatformClock.nowEpochMs()
                    lastFullPullProfileId = profileId
                }
            } else {
                log.w {
                    "Full profile sync incomplete profile=$profileId reason=$reason " +
                        "failedSteps=${syncResult.failedSteps}"
                }
            }
            log.i { "Full profile sync completed profile=$profileId reason=$reason" }
        }

        when (result) {
            ProfileSyncRequestResult.Started -> Unit
            ProfileSyncRequestResult.Coalesced -> {
                log.d { "Full profile sync coalesced profile=$profileId reason=$reason" }
            }
            ProfileSyncRequestResult.Replaced -> {
                log.d { "Full profile sync replaced stale profile request with profile=$profileId reason=$reason" }
            }
        }
    }

    fun startPeriodicNuvioSyncPull(profileId: Int) {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) {
            stopPeriodicNuvioSyncPull()
            return
        }
        if (periodicNuvioSyncPullJob?.isActive == true && periodicNuvioSyncProfileId == profileId) return

        stopPeriodicNuvioSyncPull()
        periodicNuvioSyncProfileId = profileId
        periodicNuvioSyncPullJob = accountScopeSnapshot().launch {
            while (isActive) {
                delay(PERIODIC_NUVIO_SYNC_PULL_INTERVAL_MS)

                val currentAuthState = AuthRepository.state.value
                if (currentAuthState !is AuthState.Authenticated || currentAuthState.isAnonymous) {
                    continue
                }
                if (ProfileRepository.activeProfileId != profileId) {
                    continue
                }

                TraktAuthRepository.ensureLoaded()
                TraktSettingsRepository.ensureLoaded()

                val traktAuthenticated = TraktAuthRepository.isAuthenticated.value
                val settings = TraktSettingsRepository.uiState.value
                val shouldPullLibrary = effectiveLibrarySourceMode(
                    isAuthenticated = traktAuthenticated,
                    source = settings.librarySourceMode,
                ) == LibrarySourceMode.LOCAL
                val shouldPullWatchProgress = !shouldUseTraktProgress(
                    isAuthenticated = traktAuthenticated,
                    source = settings.watchProgressSource,
                )

                if (!shouldPullLibrary && !shouldPullWatchProgress) {
                    continue
                }

                log.i {
                    "Periodic Nuvio sync pull profile=$profileId " +
                        "library=$shouldPullLibrary watchProgress=$shouldPullWatchProgress"
                }
                if (shouldPullLibrary) {
                    runCatching { LibraryRepository.pullFromServer(profileId) }
                        .onFailure { log.e(it) { "Periodic Nuvio library pull failed" } }
                }
                if (shouldPullWatchProgress) {
                    runCatching {
                        WatchProgressSourceCoordinator.refreshActiveSource(profileId = profileId, force = false)
                    }.onFailure { log.e(it) { "Periodic Nuvio watch source pull failed" } }
                }
            }
        }
    }

    fun stopPeriodicNuvioSyncPull() {
        periodicNuvioSyncPullJob?.cancel()
        periodicNuvioSyncPullJob = null
        periodicNuvioSyncProfileId = null
    }

    fun requestRealtimeSurfacePull(profileId: Int, surface: String) {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) return

        accountScopeSnapshot().launch {
            log.i { "requestRealtimeSurfacePull($profileId, $surface)" }
            when (surface) {
                "addons" -> {
                    runCatching { AddonRepository.pullFromServer(profileId) }
                        .onFailure { log.e(it) { "Realtime addons pull failed" } }
                }
                "plugins" -> {
                    if (AppFeaturePolicy.pluginsEnabled) {
                        runCatching { PluginRepository.pullFromServer(profileId) }
                            .onFailure { log.e(it) { "Realtime plugins pull failed" } }
                    }
                }
                "library" -> {
                    runCatching { LibraryRepository.pullFromServer(profileId) }
                        .onFailure { log.e(it) { "Realtime library pull failed" } }
                }
                "watch_progress", "watched_items" -> {
                    runCatching {
                        WatchProgressSourceCoordinator.refreshActiveSource(profileId = profileId, force = false)
                    }.onFailure { log.e(it) { "Realtime active watch source pull failed" } }
                }
                "profile_settings" -> {
                    runCatching { ProfileSettingsSync.pull(profileId) }
                        .onFailure { log.e(it) { "Realtime profile settings pull failed" } }
                }
                "collections" -> {
                    runCatching { CollectionSyncService.pullFromServer(profileId) }
                        .onFailure { log.e(it) { "Realtime collections pull failed" } }
                }
                "home_catalog_settings" -> {
                    runCatching { HomeCatalogSettingsSyncService.pullFromServer(profileId) }
                        .onFailure { log.e(it) { "Realtime home catalog settings pull failed" } }
                }
                "profiles" -> {
                    runCatching { ProfileRepository.pullProfiles() }
                        .onFailure { log.e(it) { "Realtime profiles pull failed" } }
                }
            }
        }
    }
}
