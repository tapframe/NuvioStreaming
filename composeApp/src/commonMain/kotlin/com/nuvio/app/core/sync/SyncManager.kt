package com.nuvio.app.core.sync

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.collection.CollectionSyncService
import com.nuvio.app.features.home.HomeCatalogSettingsSyncService
import com.nuvio.app.features.library.LibraryRepository
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktPlatformClock
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val FOREGROUND_PULL_DELAY_MS = 2500L
private const val FOREGROUND_PULL_MIN_INTERVAL_MS = 30 * 60_000L

object SyncManager {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("SyncManager")
    private var foregroundPullJob: Job? = null
    private var lastForegroundPullAtMs: Long = 0L

    fun pullAllForProfile(profileId: Int) {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated) return
        if (authState.isAnonymous) return

        scope.launch {
            log.i { "pullAllForProfile($profileId) — auth=${(authState as AuthState.Authenticated).isAnonymous}" }

            log.i { "pullAllForProfile — pulling addons first (await)..." }
            runCatching { AddonRepository.pullFromServer(profileId) }
                .onSuccess { log.i { "pullAllForProfile — addons pull completed" } }
                .onFailure { log.e(it) { "Addon pull failed" } }

            if (AppFeaturePolicy.pluginsEnabled) {
                log.i { "pullAllForProfile — pulling plugins (await)..." }
                runCatching { PluginRepository.pullFromServer(profileId) }
                    .onSuccess { log.i { "pullAllForProfile — plugins pull completed" } }
                    .onFailure { log.e(it) { "Plugin pull failed" } }
            }

            log.i { "pullAllForProfile — launching remaining pulls in parallel" }
            launch {
                runCatching { LibraryRepository.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Library pull failed" } }
            }
            launch {
                runCatching { WatchProgressRepository.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "WatchProgress pull failed" } }
            }
            launch {
                runCatching { WatchedRepository.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Watched pull failed" } }
            }
            launch {
                runCatching { ProfileSettingsSync.pull(profileId) }
                    .onFailure { log.e(it) { "ProfileSettings pull failed" } }
            }
            launch {
                runCatching { CollectionSyncService.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Collections pull failed" } }
            }
            launch {
                runCatching { HomeCatalogSettingsSyncService.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "HomeCatalogSettings pull failed" } }
            }

            log.i { "pullAllForProfile($profileId) — all pulls launched" }
        }
    }

    fun requestForegroundPull(profileId: Int, force: Boolean = false) {
        val authState = AuthRepository.state.value
        if (authState !is AuthState.Authenticated || authState.isAnonymous) return

        val now = TraktPlatformClock.nowEpochMs()
        if (!force && foregroundPullJob?.isActive == true) return
        if (!force && now - lastForegroundPullAtMs < FOREGROUND_PULL_MIN_INTERVAL_MS) return

        foregroundPullJob = scope.launch {
            if (!force) {
                delay(FOREGROUND_PULL_DELAY_MS)
            }

            val currentAuthState = AuthRepository.state.value
            if (currentAuthState !is AuthState.Authenticated || currentAuthState.isAnonymous) return@launch

            lastForegroundPullAtMs = TraktPlatformClock.nowEpochMs()
            pullForegroundForProfile(profileId)
        }
    }

    private fun pullForegroundForProfile(profileId: Int) {
        scope.launch {
            log.i { "pullForegroundForProfile($profileId) — syncing watch progress + library" }

            launch {
                runCatching { LibraryRepository.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Foreground library pull failed" } }
            }

            launch {
                runCatching { WatchProgressRepository.pullFromServer(profileId) }
                    .onFailure { log.e(it) { "Foreground watch progress pull failed" } }
            }
        }
    }
}
