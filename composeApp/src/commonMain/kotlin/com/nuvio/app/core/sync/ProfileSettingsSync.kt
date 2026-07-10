package com.nuvio.app.core.sync

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.collection.CollectionMobileSettingsRepository
import com.nuvio.app.features.collection.CollectionMobileSettingsStorage
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.debrid.DebridSettingsStorage
import com.nuvio.app.features.details.MetaScreenSettingsStorage
import com.nuvio.app.features.details.MetaScreenSettingsRepository
import com.nuvio.app.features.mdblist.MdbListMetadataService
import com.nuvio.app.features.mdblist.MdbListSettingsStorage
import com.nuvio.app.features.mdblist.MdbListSettingsRepository
import com.nuvio.app.features.notifications.EpisodeReleaseNotificationsRepository
import com.nuvio.app.features.player.PlayerSettingsStorage
import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.core.ui.PosterCardStyleRepository
import com.nuvio.app.core.ui.PosterCardStyleStorage
import com.nuvio.app.features.settings.ThemeSettingsStorage
import com.nuvio.app.features.settings.ThemeSettingsRepository
import com.nuvio.app.features.streams.StreamBadgeSettingsRepository
import com.nuvio.app.features.streams.StreamBadgeSettingsStorage
import com.nuvio.app.features.tmdb.TmdbSettingsStorage
import com.nuvio.app.features.tmdb.TmdbSettingsRepository
import com.nuvio.app.features.trakt.TraktCommentsStorage
import com.nuvio.app.features.trakt.TraktCommentsSettings
import com.nuvio.app.features.trakt.ProfileSettingsWatchSourceOutbox
import com.nuvio.app.features.trakt.TraktSettingsStorage
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesStorage
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlin.concurrent.Volatile
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put

private const val PUSH_DEBOUNCE_MS = 1500L

private data class ObservedProfileSettingsChange(
    val signature: String,
    val accountId: String?,
)

private data class SkippedProfileSettingsPush(
    val signature: String,
    val accountId: String?,
    val profileId: Int,
)

object ProfileSettingsSync {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("ProfileSettingsSync")
    private val syncMutex = Mutex()
    private val observeLock = SynchronizedObject()
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    @Volatile
    private var isApplyingRemoteBlob: Boolean = false

    @Volatile
    private var isServerSyncInFlight: Boolean = false

    @Volatile
    private var skipNextPush: SkippedProfileSettingsPush? = null

    @Volatile
    private var pushEnabledAccountId: String? = null

    @Volatile
    private var pendingLocalPush: SkippedProfileSettingsPush? = null

    private var observeJob: Job? = null
    private var pendingPushRetryJob: Job? = null

    fun startObserving() = synchronized(observeLock) {
        if (observeJob?.isActive == true) return@synchronized
        ensureRepositoriesLoaded()
        observeLocalChangesAndPush()
    }

    fun clearAccountState() {
        synchronized(observeLock) {
            observeJob?.cancel()
            observeJob = null
        }
        skipNextPush = null
        pushEnabledAccountId = null
        pendingLocalPush = null
        pendingPushRetryJob?.cancel()
        pendingPushRetryJob = null
    }

    suspend fun pull(profileId: Int): Boolean {
        startObserving()
        val accountId = currentCloudAccountId() ?: return false
        return syncMutex.withLock {
            if (!isCurrentSyncTarget(profileId = profileId, accountId = accountId)) {
                log.d { "pull(profileId=$profileId) — skipped because profile is no longer active" }
                return@withLock false
            }
            isServerSyncInFlight = true
            try {
                pushEnabledAccountId = accountId
                hydrateDurableWatchSourcePush(profileId = profileId, accountId = accountId)
                if (
                    !pushCurrentStateLocked(
                        profileId = profileId,
                        accountId = accountId,
                        forceCurrentState = false,
                    )
                ) {
                    schedulePendingPushRetry()
                    return@withLock false
                }
                val observedSignatureAtStart = currentObservedStateSignature()
                val localBlob = exportSettingsBlob()
                if (!isCurrentSyncTarget(profileId = profileId, accountId = accountId)) {
                    throw CancellationException("Profile settings pull target changed")
                }
                val localSignature = buildSignature(localBlob)

                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                    put("p_platform", MOBILE_SYNC_PLATFORM)
                }
                val result = SupabaseProvider.client.postgrest.rpc("sync_pull_profile_settings_blob", params)
                if (!isCurrentSyncTarget(profileId = profileId, accountId = accountId)) {
                    throw CancellationException("Profile settings pull target changed")
                }
                val response = result.decodeList<SettingsBlobResponse>().firstOrNull()
                val remoteJson = response?.settingsJson

                val pendingDuringPull = pendingLocalPush?.let { pending ->
                    pending.accountId == accountId && pending.profileId == profileId
                } == true
                val durableSourceChangeDuringPull =
                    ProfileSettingsWatchSourceOutbox.pendingFor(accountId, profileId) != null
                if (
                    pendingDuringPull ||
                    durableSourceChangeDuringPull ||
                    currentObservedStateSignature() != observedSignatureAtStart
                ) {
                    if (
                        !pushCurrentStateLocked(
                            profileId = profileId,
                            accountId = accountId,
                            forceCurrentState = true,
                        )
                    ) {
                        schedulePendingPushRetry()
                    }
                    return@withLock false
                }

                if (remoteJson == null) {
                    log.i { "pull(profileId=$profileId) — no remote settings blob found" }
                    if (localSignature != defaultSignature()) {
                        pushToRemoteLocked(profileId, localBlob, accountId)
                    }
                    pushEnabledAccountId = accountId
                    return@withLock false
                }

                val remoteBlob = try {
                    json.decodeFromJsonElement(MobileProfileSettingsBlob.serializer(), remoteJson)
                } catch (error: Throwable) {
                    log.e(error) { "pull(profileId=$profileId) — failed to decode remote settings blob" }
                    throw error
                }

                var restoredPendingSourceAfterRemoteApply = false
                isApplyingRemoteBlob = true
                try {
                    val remoteSignature = buildSignature(remoteBlob)
                    if (remoteSignature == localSignature) {
                        log.d { "pull(profileId=$profileId) — remote matches local" }
                        pushEnabledAccountId = accountId
                        return@withLock false
                    }

                    if (!isCurrentSyncTarget(profileId = profileId, accountId = accountId)) {
                        throw CancellationException("Profile settings pull target changed")
                    }
                    applyRemoteBlob(remoteBlob)
                    ProfileSettingsWatchSourceOutbox.pendingFor(accountId, profileId)?.let { pendingSource ->
                        if (TraktSettingsRepository.uiState.value.watchProgressSource != pendingSource.source) {
                            TraktSettingsRepository.setWatchProgressSource(pendingSource.source, profileId)
                        }
                        restoredPendingSourceAfterRemoteApply = true
                    }
                    skipNextPush = SkippedProfileSettingsPush(
                        signature = currentObservedStateSignature(),
                        accountId = currentCloudAccountId(),
                        profileId = profileId,
                    )
                } finally {
                    isApplyingRemoteBlob = false
                }

                if (restoredPendingSourceAfterRemoteApply) {
                    pendingLocalPush = SkippedProfileSettingsPush(
                        signature = currentObservedStateSignature(),
                        accountId = accountId,
                        profileId = profileId,
                    )
                    if (
                        !pushCurrentStateLocked(
                            profileId = profileId,
                            accountId = accountId,
                            forceCurrentState = true,
                        )
                    ) {
                        schedulePendingPushRetry()
                    }
                    return@withLock false
                }

                log.i { "pull(profileId=$profileId) — applied remote settings blob" }
                pushEnabledAccountId = accountId
                true
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                log.e(error) { "pull(profileId=$profileId) — FAILED" }
                throw error
            } finally {
                isServerSyncInFlight = false
            }
        }
    }

    suspend fun pushCurrentProfileToRemote(): Boolean {
        ensureRepositoriesLoaded()
        val accountId = currentCloudAccountId() ?: return false
        return syncMutex.withLock {
            try {
                val profileId = ProfileRepository.activeProfileId
                if (!isCurrentSyncTarget(profileId = profileId, accountId = accountId)) return@withLock false
                pushCurrentStateLocked(
                    profileId = profileId,
                    accountId = accountId,
                    forceCurrentState = true,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.e(error) { "pushCurrentProfileToRemote() — FAILED" }
                false
            }
        }
    }

    @OptIn(FlowPreview::class)
    private fun observeLocalChangesAndPush() {
        val signatureFlows = listOf(
            ThemeSettingsRepository.selectedTheme.map { "theme" },
            ThemeSettingsRepository.amoledEnabled.map { "amoled" },
            ThemeSettingsRepository.liquidGlassNativeTabBarEnabled.map { "liquid_glass_tab_bar" },
            PosterCardStyleRepository.uiState.map { "poster_card_style" },
            PlayerSettingsRepository.uiState.map { "player" },
            StreamBadgeSettingsRepository.uiState.map { "stream_badges" },
            DebridSettingsRepository.uiState.map { "debrid" },
            TmdbSettingsRepository.uiState.map { "tmdb" },
            MdbListSettingsRepository.uiState.map { "mdblist" },
            MetaScreenSettingsRepository.uiState.map { "meta" },
            CollectionMobileSettingsRepository.uiState.map { "collection_mobile_settings" },
            ContinueWatchingPreferencesRepository.uiState.map { "continue_watching" },
            TraktSettingsRepository.uiState.map { "trakt_settings" },
            TraktCommentsSettings.enabled.map { "trakt_comments" },
            EpisodeReleaseNotificationsRepository.uiState.map { "episode_release_alerts" },
        )

        observeJob = scope.launch {
            combine(signatureFlows) {
                ObservedProfileSettingsChange(
                    signature = currentObservedStateSignature(),
                    accountId = currentCloudAccountId(),
                )
            }
                .drop(1)
                .distinctUntilChanged()
                .onEach { change ->
                    val authState = AuthRepository.state.value
                    if (authState !is AuthState.Authenticated || authState.isAnonymous) return@onEach
                    if (change.accountId == null || change.accountId != authState.userId) return@onEach
                    val observedChange = SkippedProfileSettingsPush(
                        signature = change.signature,
                        accountId = change.accountId,
                        profileId = ProfileRepository.activeProfileId,
                    )
                    if (skipNextPush != observedChange) {
                        pendingLocalPush = observedChange
                        schedulePendingPushRetry()
                    }
                }
                .debounce(PUSH_DEBOUNCE_MS)
                .collect { change ->
                    val authState = AuthRepository.state.value
                    if (authState !is AuthState.Authenticated || authState.isAnonymous) return@collect
                    if (change.accountId == null || change.accountId != authState.userId) return@collect
                    val profileId = ProfileRepository.activeProfileId
                    val observedChange = SkippedProfileSettingsPush(
                        signature = change.signature,
                        accountId = change.accountId,
                        profileId = profileId,
                    )
                    if (skipNextPush == observedChange) {
                        skipNextPush = null
                        if (pendingLocalPush == observedChange) {
                            pendingLocalPush = null
                        }
                        return@collect
                    }
                    pendingLocalPush = observedChange
                    if (pushEnabledAccountId != change.accountId) return@collect
                    if (isApplyingRemoteBlob || isServerSyncInFlight) return@collect
                    pushCurrentProfileToRemote()
                }
        }
    }

    private fun schedulePendingPushRetry() {
        if (pendingPushRetryJob?.isActive == true) return
        pendingPushRetryJob = scope.launch {
            var retryDelayMs = 5_000L
            while (pendingLocalPush != null) {
                delay(retryDelayMs)
                val pending = pendingLocalPush ?: break
                if (
                    pending.accountId == currentCloudAccountId() &&
                    pending.profileId == ProfileRepository.activeProfileId &&
                    pushEnabledAccountId == pending.accountId &&
                    !isApplyingRemoteBlob &&
                    !isServerSyncInFlight &&
                    pushCurrentProfileToRemote()
                ) {
                    break
                }
                retryDelayMs = (retryDelayMs * 2L).coerceAtMost(60_000L)
            }
        }
    }

    private suspend fun pushToRemoteLocked(
        profileId: Int,
        blob: MobileProfileSettingsBlob,
        accountId: String,
    ) {
        if (!isCurrentSyncTarget(profileId = profileId, accountId = accountId)) {
            throw CancellationException("Profile settings push target changed")
        }
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", MOBILE_SYNC_PLATFORM)
            put("p_settings_json", json.encodeToJsonElement(MobileProfileSettingsBlob.serializer(), blob))
            putSyncOriginClientId()
        }
        SupabaseProvider.client.postgrest.rpc("sync_push_profile_settings_blob", params)
        if (!isCurrentSyncTarget(profileId = profileId, accountId = accountId)) {
            throw CancellationException("Profile settings push target changed")
        }
        log.d { "pushToRemoteLocked(profileId=$profileId) — success" }
    }

    private fun hydrateDurableWatchSourcePush(profileId: Int, accountId: String) {
        val durableChange = ProfileSettingsWatchSourceOutbox.pendingFor(accountId, profileId) ?: return
        if (TraktSettingsRepository.uiState.value.watchProgressSource != durableChange.source) {
            TraktSettingsRepository.setWatchProgressSource(durableChange.source, profileId)
        }
        pendingLocalPush = SkippedProfileSettingsPush(
            signature = currentObservedStateSignature(),
            accountId = accountId,
            profileId = profileId,
        )
        schedulePendingPushRetry()
    }

    private suspend fun pushCurrentStateLocked(
        profileId: Int,
        accountId: String,
        forceCurrentState: Boolean,
    ): Boolean {
        val durableChange = ProfileSettingsWatchSourceOutbox.pendingFor(accountId, profileId)
        val inMemoryChange = pendingLocalPush?.takeIf { pending ->
            pending.accountId == accountId && pending.profileId == profileId
        }
        if (!forceCurrentState && durableChange == null && inMemoryChange == null) return true

        val signature = currentObservedStateSignature()
        pushToRemoteLocked(profileId, exportSettingsBlob(), accountId)
        if (currentObservedStateSignature() != signature) {
            pendingLocalPush = SkippedProfileSettingsPush(
                signature = currentObservedStateSignature(),
                accountId = accountId,
                profileId = profileId,
            )
            schedulePendingPushRetry()
            return false
        }

        val pushedChange = SkippedProfileSettingsPush(
            signature = signature,
            accountId = accountId,
            profileId = profileId,
        )
        if (pendingLocalPush == pushedChange) {
            pendingLocalPush = null
        }
        if (
            durableChange != null &&
            TraktSettingsRepository.uiState.value.watchProgressSource == durableChange.source
        ) {
            ProfileSettingsWatchSourceOutbox.clearIfMatches(durableChange)
        }

        val durablePushRemains = ProfileSettingsWatchSourceOutbox.pendingFor(accountId, profileId) != null
        val memoryPushRemains = pendingLocalPush?.let { pending ->
            pending.accountId == accountId && pending.profileId == profileId
        } == true
        if (durablePushRemains || memoryPushRemains) {
            schedulePendingPushRetry()
            return false
        }
        return true
    }

    private fun exportSettingsBlob(): MobileProfileSettingsBlob {
        ensureRepositoriesLoaded()
        return MobileProfileSettingsBlob(
            features = MobileProfileSettingsFeatures(
                themeSettings = ThemeSettingsStorage.exportToSyncPayload(),
                posterCardStyleSettingsPayload = PosterCardStyleStorage.loadPayload().orEmpty().trim(),
                playerSettings = PlayerSettingsStorage.exportToSyncPayload(),
                streamBadgeSettings = StreamBadgeSettingsStorage.exportToSyncPayload(),
                debridSettings = DebridSettingsStorage.exportToSyncPayload(),
                tmdbSettings = TmdbSettingsStorage.exportToSyncPayload(),
                mdbListSettings = MdbListSettingsStorage.exportToSyncPayload(),
                metaScreenSettingsPayload = MetaScreenSettingsStorage.loadPayload().orEmpty().trim(),
                collectionMobileSettingsPayload = CollectionMobileSettingsStorage.loadPayload().orEmpty().trim(),
                continueWatchingSettingsPayload = ContinueWatchingPreferencesStorage.loadPayload().orEmpty().trim(),
                traktSettingsPayload = TraktSettingsStorage.loadPayload().orEmpty().trim(),
                traktCommentsSettings = TraktCommentsStorage.exportToSyncPayload(),
                notificationsSettings = NotificationsSettingsPayload(
                    episodeReleaseAlertsEnabled = EpisodeReleaseNotificationsRepository.uiState.value.isEnabled,
                ),
            ),
        )
    }

    private fun applyRemoteBlob(blob: MobileProfileSettingsBlob) {
        ThemeSettingsStorage.replaceFromSyncPayload(blob.features.themeSettings)
        ThemeSettingsRepository.onProfileChanged()

        PosterCardStyleStorage.savePayload(blob.features.posterCardStyleSettingsPayload)
        PosterCardStyleRepository.onProfileChanged()

        PlayerSettingsStorage.replaceFromSyncPayload(blob.features.playerSettings)
        PlayerSettingsRepository.onProfileChanged()

        StreamBadgeSettingsStorage.replaceFromSyncPayload(blob.features.streamBadgeSettings)
        StreamBadgeSettingsRepository.onProfileChanged()

        DebridSettingsStorage.replaceFromSyncPayload(blob.features.debridSettings)
        DebridSettingsRepository.onProfileChanged()

        TmdbSettingsStorage.replaceFromSyncPayload(blob.features.tmdbSettings)
        TmdbSettingsRepository.onProfileChanged()

        MdbListSettingsStorage.replaceFromSyncPayload(blob.features.mdbListSettings)
        MdbListMetadataService.clearCache()
        MdbListSettingsRepository.onProfileChanged()

        MetaScreenSettingsStorage.savePayload(blob.features.metaScreenSettingsPayload)
        MetaScreenSettingsRepository.onProfileChanged()

        CollectionMobileSettingsStorage.savePayload(blob.features.collectionMobileSettingsPayload)
        CollectionMobileSettingsRepository.onProfileChanged()

        ContinueWatchingPreferencesStorage.savePayload(blob.features.continueWatchingSettingsPayload)
        ContinueWatchingPreferencesRepository.onProfileChanged()

        TraktSettingsStorage.savePayload(blob.features.traktSettingsPayload)
        TraktSettingsRepository.onProfileChanged()

        TraktCommentsStorage.replaceFromSyncPayload(blob.features.traktCommentsSettings)
        TraktCommentsSettings.onProfileChanged()

        EpisodeReleaseNotificationsRepository.applyFromSyncEnabled(blob.features.notificationsSettings.episodeReleaseAlertsEnabled)
    }

    private fun ensureRepositoriesLoaded() {
        ThemeSettingsRepository.ensureLoaded()
        PosterCardStyleRepository.ensureLoaded()
        PlayerSettingsRepository.ensureLoaded()
        StreamBadgeSettingsRepository.ensureLoaded()
        DebridSettingsRepository.ensureLoaded()
        TmdbSettingsRepository.ensureLoaded()
        MdbListSettingsRepository.ensureLoaded()
        MetaScreenSettingsRepository.ensureLoaded()
        CollectionMobileSettingsRepository.ensureLoaded()
        ContinueWatchingPreferencesRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        TraktCommentsSettings.ensureLoaded()
        EpisodeReleaseNotificationsRepository.ensureLoaded()
    }

    private fun buildSignature(blob: MobileProfileSettingsBlob): String =
        json.encodeToString(MobileProfileSettingsBlob.serializer(), blob)

    private fun defaultSignature(): String =
        buildSignature(MobileProfileSettingsBlob())

    private fun currentObservedStateSignature(): String = listOf(
        "theme=${ThemeSettingsRepository.selectedTheme.value.name}",
        "amoled=${ThemeSettingsRepository.amoledEnabled.value}",
        "liquid_glass_tab_bar=${ThemeSettingsRepository.liquidGlassNativeTabBarEnabled.value}",
        "poster_card_style=${PosterCardStyleRepository.uiState.value}",
        "player=${PlayerSettingsRepository.uiState.value}",
        "stream_badges=${StreamBadgeSettingsRepository.uiState.value}",
        "debrid=${DebridSettingsRepository.uiState.value}",
        "tmdb=${TmdbSettingsRepository.uiState.value}",
        "mdblist=${MdbListSettingsRepository.uiState.value}",
        "meta=${MetaScreenSettingsRepository.uiState.value}",
        "collection_mobile_settings=${CollectionMobileSettingsRepository.uiState.value}",
        "continue=${ContinueWatchingPreferencesRepository.uiState.value}",
        "trakt_settings=${TraktSettingsRepository.uiState.value}",
        "trakt_comments=${TraktCommentsSettings.enabled.value}",
        "episode_release_alerts=${EpisodeReleaseNotificationsRepository.uiState.value.isEnabled}",
    ).joinToString(separator = "||")

    private fun currentCloudAccountId(): String? =
        (AuthRepository.state.value as? AuthState.Authenticated)
            ?.takeUnless { it.isAnonymous }
            ?.userId

    private fun isCurrentSyncTarget(profileId: Int, accountId: String): Boolean =
        ProfileRepository.activeProfileId == profileId && currentCloudAccountId() == accountId
}

@Serializable
private data class MobileProfileSettingsBlob(
    val version: Int = 3,
    val features: MobileProfileSettingsFeatures = MobileProfileSettingsFeatures(),
)

@Serializable
private data class MobileProfileSettingsFeatures(
    @SerialName("theme_settings") val themeSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("poster_card_style_settings_payload") val posterCardStyleSettingsPayload: String = "",
    @SerialName("player_settings") val playerSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("stream_badge_settings") val streamBadgeSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("debrid_settings") val debridSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("tmdb_settings") val tmdbSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("mdblist_settings") val mdbListSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("meta_screen_settings_payload") val metaScreenSettingsPayload: String = "",
    @SerialName("collection_mobile_settings_payload") val collectionMobileSettingsPayload: String = "",
    @SerialName("continue_watching_settings_payload") val continueWatchingSettingsPayload: String = "",
    @SerialName("trakt_settings_payload") val traktSettingsPayload: String = "",
    @SerialName("trakt_comments_settings") val traktCommentsSettings: JsonObject = JsonObject(emptyMap()),
    @SerialName("notifications_settings") val notificationsSettings: NotificationsSettingsPayload = NotificationsSettingsPayload(),
)

@Serializable
private data class NotificationsSettingsPayload(
    @SerialName("episode_release_alerts_enabled") val episodeReleaseAlertsEnabled: Boolean = false,
)

@Serializable
private data class SettingsBlobResponse(
    @SerialName("profile_id") val profileId: Int = 0,
    @SerialName("settings_json") val settingsJson: JsonObject? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)
