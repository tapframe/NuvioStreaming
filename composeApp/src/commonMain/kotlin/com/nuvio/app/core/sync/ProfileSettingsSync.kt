package com.nuvio.app.core.sync

import co.touchlab.kermit.Logger
import com.nuvio.app.isDesktop
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
import com.nuvio.app.features.trakt.TraktSettingsStorage
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesStorage
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlin.concurrent.Volatile
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

object ProfileSettingsSync {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("ProfileSettingsSync")
    private val syncMutex = Mutex()
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    @Volatile
    private var isApplyingRemoteBlob: Boolean = false

    @Volatile
    private var isServerSyncInFlight: Boolean = false

    @Volatile
    private var skipNextPushSignature: String? = null

    @Volatile
    private var preservedRemotePlayerSettings: JsonObject? = null

    @Volatile
    private var preservedRemotePlayerSettingsProfileId: Int? = null

    private var observeJob: Job? = null

    private val syncPlayerSettings: Boolean
        get() = !isDesktop

    fun startObserving() {
        if (observeJob?.isActive == true) return
        ensureRepositoriesLoaded()
        observeLocalChangesAndPush()
    }

    suspend fun pull(profileId: Int): Boolean {
        ensureRepositoriesLoaded()
        return syncMutex.withLock {
            isServerSyncInFlight = true
            try {
                val remoteJson = fetchRemoteSettingsJson(profileId)

                if (remoteJson == null) {
                    log.i { "pull(profileId=$profileId) — no remote settings blob found" }
                    clearPreservedRemotePlayerSettings(profileId)
                    val localBlob = exportSettingsBlob(profileId)
                    val localSignature = buildSignature(localBlob)
                    if (localSignature != defaultSignature()) {
                        pushToRemoteLocked(profileId, localBlob)
                    }
                    return@withLock false
                }

                isApplyingRemoteBlob = true
                try {
                    val remoteBlob = runCatching {
                        json.decodeFromJsonElement(MobileProfileSettingsBlob.serializer(), remoteJson)
                    }.getOrElse { error ->
                        log.e(error) { "pull(profileId=$profileId) — failed to decode remote settings blob" }
                        return@withLock false
                    }

                    preserveRemotePlayerSettings(profileId, remoteBlob)

                    val localBlob = exportSettingsBlob(profileId)
                    val localSignature = buildSignature(localBlob)
                    val remoteSignature = buildSignature(remoteBlob)
                    if (remoteSignature == localSignature) {
                        log.d { "pull(profileId=$profileId) — remote matches local" }
                        return@withLock false
                    }

                    applyRemoteBlob(profileId, remoteBlob)
                    skipNextPushSignature = currentObservedStateSignature()
                } finally {
                    isApplyingRemoteBlob = false
                }

                log.i { "pull(profileId=$profileId) — applied remote settings blob" }
                true
            } catch (error: Exception) {
                log.e(error) { "pull(profileId=$profileId) — FAILED" }
                false
            } finally {
                isServerSyncInFlight = false
            }
        }
    }

    suspend fun pushCurrentProfileToRemote() {
        ensureRepositoriesLoaded()
        syncMutex.withLock {
            runCatching {
                val profileId = ProfileRepository.activeProfileId
                pushToRemoteLocked(profileId, exportSettingsBlob(profileId))
            }.onFailure { error ->
                log.e(error) { "pushCurrentProfileToRemote() — FAILED" }
            }
        }
    }

    @OptIn(FlowPreview::class)
    private fun observeLocalChangesAndPush() {
        val signatureFlows = buildList {
            add(ThemeSettingsRepository.selectedTheme.map { "theme" })
            add(ThemeSettingsRepository.amoledEnabled.map { "amoled" })
            add(ThemeSettingsRepository.liquidGlassNativeTabBarEnabled.map { "liquid_glass_tab_bar" })
            add(PosterCardStyleRepository.uiState.map { "poster_card_style" })
            if (syncPlayerSettings) {
                add(PlayerSettingsRepository.uiState.map { "player" })
            }
            add(StreamBadgeSettingsRepository.uiState.map { "stream_badges" })
            add(DebridSettingsRepository.uiState.map { "debrid" })
            add(TmdbSettingsRepository.uiState.map { "tmdb" })
            add(MdbListSettingsRepository.uiState.map { "mdblist" })
            add(MetaScreenSettingsRepository.uiState.map { "meta" })
            add(CollectionMobileSettingsRepository.uiState.map { "collection_mobile_settings" })
            add(ContinueWatchingPreferencesRepository.uiState.map { "continue_watching" })
            add(TraktSettingsRepository.uiState.map { "trakt_settings" })
            add(TraktCommentsSettings.enabled.map { "trakt_comments" })
            add(EpisodeReleaseNotificationsRepository.uiState.map { "episode_release_alerts" })
        }

        observeJob = scope.launch {
            combine(signatureFlows) { currentObservedStateSignature() }
                .drop(1)
                .distinctUntilChanged()
                .debounce(PUSH_DEBOUNCE_MS)
                .collect { signature ->
                    val authState = AuthRepository.state.value
                    if (authState !is AuthState.Authenticated || authState.isAnonymous) return@collect
                    if (isApplyingRemoteBlob || isServerSyncInFlight) return@collect
                    if (signature == skipNextPushSignature) {
                        skipNextPushSignature = null
                        return@collect
                    }
                    pushCurrentProfileToRemote()
                }
        }
    }

    private suspend fun pushToRemoteLocked(profileId: Int, blob: MobileProfileSettingsBlob) {
        val blobToPush = withPreservedDesktopPlayerSettings(profileId, blob)
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", MOBILE_SYNC_PLATFORM)
            put("p_settings_json", json.encodeToJsonElement(MobileProfileSettingsBlob.serializer(), blobToPush))
        }
        SupabaseProvider.client.postgrest.rpc("sync_push_profile_settings_blob", params)
        log.d { "pushToRemoteLocked(profileId=$profileId) — success" }
    }

    private fun exportSettingsBlob(profileId: Int = ProfileRepository.activeProfileId): MobileProfileSettingsBlob {
        ensureRepositoriesLoaded()
        return MobileProfileSettingsBlob(
            features = MobileProfileSettingsFeatures(
                themeSettings = ThemeSettingsStorage.exportToSyncPayload(),
                posterCardStyleSettingsPayload = PosterCardStyleStorage.loadPayload().orEmpty().trim(),
                playerSettings = exportPlayerSettingsPayload(profileId),
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

    private fun applyRemoteBlob(profileId: Int, blob: MobileProfileSettingsBlob) {
        ThemeSettingsStorage.replaceFromSyncPayload(blob.features.themeSettings)
        ThemeSettingsRepository.onProfileChanged()

        PosterCardStyleStorage.savePayload(blob.features.posterCardStyleSettingsPayload)
        PosterCardStyleRepository.onProfileChanged()

        if (syncPlayerSettings) {
            PlayerSettingsStorage.replaceFromSyncPayload(blob.features.playerSettings)
            PlayerSettingsRepository.onProfileChanged()
        } else {
            preserveRemotePlayerSettings(profileId, blob)
        }

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
        if (syncPlayerSettings) {
            PlayerSettingsRepository.ensureLoaded()
        }
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

    private fun currentObservedStateSignature(): String = buildList {
        add("theme=${ThemeSettingsRepository.selectedTheme.value.name}")
        add("amoled=${ThemeSettingsRepository.amoledEnabled.value}")
        add("liquid_glass_tab_bar=${ThemeSettingsRepository.liquidGlassNativeTabBarEnabled.value}")
        add("poster_card_style=${PosterCardStyleRepository.uiState.value}")
        if (syncPlayerSettings) {
            add("player=${PlayerSettingsRepository.uiState.value}")
        }
        add("stream_badges=${StreamBadgeSettingsRepository.uiState.value}")
        add("debrid=${DebridSettingsRepository.uiState.value}")
        add("tmdb=${TmdbSettingsRepository.uiState.value}")
        add("mdblist=${MdbListSettingsRepository.uiState.value}")
        add("meta=${MetaScreenSettingsRepository.uiState.value}")
        add("collection_mobile_settings=${CollectionMobileSettingsRepository.uiState.value}")
        add("continue=${ContinueWatchingPreferencesRepository.uiState.value}")
        add("trakt_settings=${TraktSettingsRepository.uiState.value}")
        add("trakt_comments=${TraktCommentsSettings.enabled.value}")
        add("episode_release_alerts=${EpisodeReleaseNotificationsRepository.uiState.value.isEnabled}")
    }.joinToString(separator = "||")

    private fun exportPlayerSettingsPayload(profileId: Int): JsonObject =
        if (syncPlayerSettings) {
            PlayerSettingsStorage.exportToSyncPayload()
        } else {
            preservedRemotePlayerSettingsFor(profileId) ?: JsonObject(emptyMap())
        }

    private fun preserveRemotePlayerSettings(profileId: Int, blob: MobileProfileSettingsBlob) {
        if (!syncPlayerSettings) {
            preservedRemotePlayerSettingsProfileId = profileId
            preservedRemotePlayerSettings = blob.features.playerSettings
        }
    }

    private fun clearPreservedRemotePlayerSettings(profileId: Int) {
        if (!syncPlayerSettings) {
            preservedRemotePlayerSettingsProfileId = profileId
            preservedRemotePlayerSettings = null
        }
    }

    private fun preservedRemotePlayerSettingsFor(profileId: Int): JsonObject? =
        preservedRemotePlayerSettings
            ?.takeIf { preservedRemotePlayerSettingsProfileId == profileId }

    private suspend fun withPreservedDesktopPlayerSettings(
        profileId: Int,
        blob: MobileProfileSettingsBlob,
    ): MobileProfileSettingsBlob {
        if (syncPlayerSettings) return blob

        val remoteBlobResult = runCatching {
            fetchRemoteSettingsJson(profileId)
                ?.let { remoteJson ->
                    json.decodeFromJsonElement(MobileProfileSettingsBlob.serializer(), remoteJson)
                }
        }
        val remotePlayerSettings = if (remoteBlobResult.isSuccess) {
            remoteBlobResult.getOrNull()?.features?.playerSettings ?: JsonObject(emptyMap())
        } else {
            val error = remoteBlobResult.exceptionOrNull()
            if (error != null) {
                log.e(error) { "pushToRemoteLocked(profileId=$profileId) — failed to preserve remote player settings" }
            }
            preservedRemotePlayerSettingsFor(profileId) ?: throw (error ?: IllegalStateException("Missing remote player settings"))
        }

        preservedRemotePlayerSettingsProfileId = profileId
        preservedRemotePlayerSettings = remotePlayerSettings
        return blob.copy(
            features = blob.features.copy(
                playerSettings = remotePlayerSettings,
            ),
        )
    }

    private suspend fun fetchRemoteSettingsJson(profileId: Int): JsonObject? {
        val params = buildJsonObject {
            put("p_profile_id", profileId)
            put("p_platform", MOBILE_SYNC_PLATFORM)
        }
        val result = SupabaseProvider.client.postgrest.rpc("sync_pull_profile_settings_blob", params)
        return result.decodeList<SettingsBlobResponse>().firstOrNull()?.settingsJson
    }
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
