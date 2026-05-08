package com.nuvio.app.features.watchprogress

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.player.PlayerPlaybackSnapshot
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktProgressRepository
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.shouldUseTraktProgress as shouldUseTraktProgressSource
import com.nuvio.app.features.watching.application.WatchingActions
import com.nuvio.app.features.watching.sync.ProgressSyncAdapter
import com.nuvio.app.features.watching.sync.SupabaseProgressSyncAdapter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

object WatchProgressRepository {
    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("WatchProgressRepository")

    private val _uiState = MutableStateFlow(WatchProgressUiState())
    val uiState: StateFlow<WatchProgressUiState> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var currentProfileId: Int = 1
    private var entriesByVideoId: MutableMap<String, WatchProgressEntry> = mutableMapOf()
    private var metadataResolutionJob: Job? = null
    internal var syncAdapter: ProgressSyncAdapter = SupabaseProgressSyncAdapter

    init {
        syncScope.launch {
            TraktAuthRepository.isAuthenticated.collectLatest { authenticated ->
                if (shouldUseTraktProgressSource(
                        isAuthenticated = authenticated,
                        source = TraktSettingsRepository.uiState.value.watchProgressSource,
                    )
                ) {
                    runCatching { TraktProgressRepository.refreshNow() }
                        .onFailure { error -> log.w { "Failed to refresh Trakt progress after auth: ${error.message}" } }
                }
                publish()
            }
        }

        syncScope.launch {
            TraktSettingsRepository.uiState.collectLatest { settings ->
                if (shouldUseTraktProgressSource(
                        isAuthenticated = TraktAuthRepository.isAuthenticated.value,
                        source = settings.watchProgressSource,
                    )
                ) {
                    runCatching { TraktProgressRepository.refreshNow() }
                        .onFailure { error -> log.w { "Failed to refresh Trakt progress after source change: ${error.message}" } }
                }
                publish()
            }
        }

        syncScope.launch {
            TraktProgressRepository.uiState.collectLatest {
                if (shouldUseTraktProgress()) {
                    publish()
                }
            }
        }
    }

    fun ensureLoaded() {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        TraktProgressRepository.ensureLoaded()
        if (hasLoaded) return
        loadFromDisk(ProfileRepository.activeProfileId)
        if (shouldUseTraktProgress()) {
            TraktProgressRepository.refreshAsync()
        }
    }

    fun onProfileChanged(profileId: Int) {
        if (profileId == currentProfileId && hasLoaded) return
        TraktSettingsRepository.onProfileChanged()
        loadFromDisk(profileId)
        TraktProgressRepository.onProfileChanged()
        if (shouldUseTraktProgress()) {
            TraktProgressRepository.refreshAsync()
        }
    }

    fun clearLocalState() {
        metadataResolutionJob?.cancel()
        hasLoaded = false
        currentProfileId = 1
        entriesByVideoId.clear()
        TraktProgressRepository.clearLocalState()
        TraktSettingsRepository.clearLocalState()
        _uiState.value = WatchProgressUiState()
    }

    private fun loadFromDisk(profileId: Int) {
        currentProfileId = profileId
        hasLoaded = true
        entriesByVideoId.clear()

        val payload = WatchProgressStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isNotEmpty()) {
            entriesByVideoId = WatchProgressCodec.decodeEntries(payload)
                .associateBy { it.videoId }
                .toMutableMap()
        }
        publish()
        resolveRemoteMetadata()
    }

    suspend fun pullFromServer(profileId: Int) {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        TraktProgressRepository.ensureLoaded()
        currentProfileId = profileId

        val useTraktProgress = shouldUseTraktProgress()

        if (useTraktProgress) {
            runCatching { TraktProgressRepository.refreshNow() }
                .onFailure { e -> log.e(e) { "Failed to pull Trakt progress" } }
            publish()
            return
        }

        runCatching {
            val serverEntries = syncAdapter.pull(profileId = profileId)

            val oldLocal = entriesByVideoId.toMap()
            val newMap = mutableMapOf<String, WatchProgressEntry>()

            serverEntries.forEach { entry ->
                val videoId = entry.videoId
                val cached = oldLocal[videoId]
                newMap[videoId] = WatchProgressEntry(
                    contentType = entry.contentType,
                    parentMetaId = entry.contentId,
                    parentMetaType = cached?.parentMetaType ?: entry.contentType,
                    videoId = videoId,
                    title = cached?.title?.takeIf { it.isNotBlank() } ?: entry.contentId,
                    logo = cached?.logo,
                    poster = cached?.poster,
                    background = cached?.background,
                    seasonNumber = entry.season,
                    episodeNumber = entry.episode,
                    episodeTitle = cached?.episodeTitle,
                    episodeThumbnail = cached?.episodeThumbnail,
                    lastPositionMs = entry.position,
                    durationMs = entry.duration,
                    lastUpdatedEpochMs = entry.lastWatched,
                    providerName = cached?.providerName,
                    providerAddonId = cached?.providerAddonId,
                    lastStreamTitle = cached?.lastStreamTitle,
                    lastStreamSubtitle = cached?.lastStreamSubtitle,
                    pauseDescription = cached?.pauseDescription,
                    lastSourceUrl = cached?.lastSourceUrl,
                    isCompleted = isWatchProgressComplete(entry.position, entry.duration, false),
                )
            }

            entriesByVideoId = newMap
            hasLoaded = true
            publish()
            persist()

            resolveRemoteMetadata()
        }.onFailure { e ->
            log.e(e) { "Failed to pull watch progress from server" }
        }
    }

    private fun resolveRemoteMetadata() {
        val needsResolution = entriesByVideoId.values
            .filter { it.poster.isNullOrBlank() || it.background.isNullOrBlank() }
            .groupBy { it.parentMetaId to it.contentType }

        if (needsResolution.isEmpty()) return

        metadataResolutionJob?.cancel()
        metadataResolutionJob = syncScope.launch {
            withTimeoutOrNull(30_000L) {
                AddonRepository.awaitManifestsLoaded()
            } ?: run {
                log.w { "Timed out waiting for addon manifests" }
                return@launch
            }

            for ((key, entries) in needsResolution) {
                val (metaId, metaType) = key
                val meta = runCatching {
                    MetaDetailsRepository.fetch(metaType, metaId)
                }.getOrNull() ?: continue

                for (entry in entries) {
                    val episodeVideo = if (entry.seasonNumber != null && entry.episodeNumber != null) {
                        meta.videos.find { v ->
                            v.season == entry.seasonNumber && v.episode == entry.episodeNumber
                        }
                    } else null

                    entriesByVideoId[entry.videoId] = entry.copy(
                        title = meta.name,
                        poster = meta.poster,
                        background = meta.background,
                        logo = meta.logo,
                        episodeTitle = episodeVideo?.title ?: entry.episodeTitle,
                        episodeThumbnail = episodeVideo?.thumbnail ?: entry.episodeThumbnail,
                        pauseDescription = episodeVideo?.overview
                            ?: meta.description
                            ?: entry.pauseDescription,
                    )
                }

                publish()
            }
            persist()
        }
    }

    fun upsertPlaybackProgress(
        session: WatchProgressPlaybackSession,
        snapshot: PlayerPlaybackSnapshot,
    ) {
        ensureLoaded()
        upsert(session = session, snapshot = snapshot, persist = true)
    }

    fun flushPlaybackProgress(
        session: WatchProgressPlaybackSession,
        snapshot: PlayerPlaybackSnapshot,
    ) {
        ensureLoaded()
        upsert(session = session, snapshot = snapshot, persist = true)
    }

    fun clearProgress(videoId: String) {
        clearProgress(listOf(videoId))
    }

    fun clearProgress(videoIds: Collection<String>) {
        ensureLoaded()
        if (videoIds.isEmpty()) return

        if (shouldUseTraktProgress()) {
            videoIds.forEach(TraktProgressRepository::applyOptimisticRemoval)
            publish()
            return
        }

        val removedEntries = videoIds.mapNotNull { videoId ->
            entriesByVideoId.remove(videoId)
        }
        if (removedEntries.isNotEmpty()) {
            publish()
            persist()
            pushDeleteToServer(removedEntries)
        }
    }

    fun removeProgress(
        contentId: String,
        seasonNumber: Int? = null,
        episodeNumber: Int? = null,
    ) {
        ensureLoaded()
        val normalizedContentId = contentId.trim()
        if (normalizedContentId.isBlank()) return

        val entriesToRemove = currentEntries().filter { entry ->
            if (entry.parentMetaId != normalizedContentId) {
                false
            } else if (seasonNumber != null && episodeNumber != null) {
                entry.seasonNumber == seasonNumber && entry.episodeNumber == episodeNumber
            } else {
                true
            }
        }
        if (entriesToRemove.isEmpty()) return

        if (shouldUseTraktProgress()) {
            TraktProgressRepository.applyOptimisticRemoval(
                contentId = normalizedContentId,
                seasonNumber = seasonNumber,
                episodeNumber = episodeNumber,
            )
            publish()
            syncScope.launch {
                runCatching {
                    TraktProgressRepository.removeProgress(
                        contentId = normalizedContentId,
                        seasonNumber = seasonNumber,
                        episodeNumber = episodeNumber,
                    )
                }.onFailure { error ->
                    log.e(error) { "Failed to remove Trakt watch progress" }
                }
            }
            return
        }

        entriesToRemove.forEach { entry ->
            entriesByVideoId.remove(entry.videoId)
        }
        publish()
        persist()
        pushDeleteToServer(entriesToRemove)
    }

    fun progressForVideo(videoId: String): WatchProgressEntry? {
        ensureLoaded()
        return if (shouldUseTraktProgress()) {
            TraktProgressRepository.uiState.value.entries
        } else {
            entriesByVideoId.values.toList()
        }.firstOrNull { it.videoId == videoId }
    }

    fun resumeEntryForSeries(metaId: String): WatchProgressEntry? {
        ensureLoaded()
        return currentEntries().resumeEntryForSeries(metaId)
    }

    fun continueWatching(): List<WatchProgressEntry> {
        ensureLoaded()
        return currentEntries().continueWatchingEntries()
    }

    private fun upsert(
        session: WatchProgressPlaybackSession,
        snapshot: PlayerPlaybackSnapshot,
        persist: Boolean,
    ) {
        val positionMs = snapshot.positionMs.coerceAtLeast(0L)
        val durationMs = snapshot.durationMs.coerceAtLeast(0L)
        val isCompleted = isWatchProgressComplete(
            positionMs = positionMs,
            durationMs = durationMs,
            isEnded = snapshot.isEnded,
        )
        if (!isCompleted && !shouldStoreWatchProgress(positionMs = positionMs, durationMs = durationMs)) {
            return
        }

        val entry = WatchProgressEntry(
            contentType = session.contentType,
            parentMetaId = session.parentMetaId,
            parentMetaType = session.parentMetaType,
            videoId = session.videoId,
            title = session.title,
            logo = session.logo,
            poster = session.poster,
            background = session.background,
            seasonNumber = session.seasonNumber,
            episodeNumber = session.episodeNumber,
            episodeTitle = session.episodeTitle,
            episodeThumbnail = session.episodeThumbnail,
            lastPositionMs = if (isCompleted && durationMs > 0L) durationMs else positionMs,
            durationMs = durationMs,
            lastUpdatedEpochMs = WatchProgressClock.nowEpochMs(),
            providerName = session.providerName,
            providerAddonId = session.providerAddonId,
            lastStreamTitle = session.lastStreamTitle,
            lastStreamSubtitle = session.lastStreamSubtitle,
            pauseDescription = session.pauseDescription,
            lastSourceUrl = session.lastSourceUrl,
            isCompleted = isCompleted,
        ).normalizedCompletion()

        if (entry.parentMetaType.equals("series", ignoreCase = true)) {
            ContinueWatchingPreferencesRepository.removeDismissedNextUpKeysForContent(entry.parentMetaId)
        }

        entriesByVideoId[session.videoId] = entry
        if (shouldUseTraktProgress()) {
            TraktProgressRepository.applyOptimisticProgress(entry)
        }
        publish()
        if (persist) persist()
        if (entry.poster.isNullOrBlank() || entry.background.isNullOrBlank()) {
            resolveRemoteMetadata()
        }
        pushScrobbleToServer(entry)
        WatchingActions.onProgressEntryUpdated(entry)
    }

    private fun pushScrobbleToServer(entry: WatchProgressEntry) {
        syncScope.launch {
            runCatching {
                val profileId = ProfileRepository.activeProfileId
                syncAdapter.push(profileId = profileId, entries = listOf(entry))
            }.onFailure { e ->
                log.e(e) { "Failed to push watch progress scrobble" }
            }
        }
    }

    private fun pushDeleteToServer(entries: Collection<WatchProgressEntry>) {
        if (shouldUseTraktProgress()) return
        syncScope.launch {
            runCatching {
                if (entries.isEmpty()) return@runCatching
                val profileId = ProfileRepository.activeProfileId
                syncAdapter.delete(profileId = profileId, entries = entries)
            }.onFailure { e ->
                log.e(e) { "Failed to push watch progress delete" }
            }
        }
    }

    private fun publish() {
        val entries = currentEntries()
        val sortedEntries = entries.sortedByDescending { it.lastUpdatedEpochMs }
        _uiState.value = WatchProgressUiState(
            entries = sortedEntries,
        )
    }

    private fun persist() {
        WatchProgressStorage.savePayload(
            currentProfileId,
            WatchProgressCodec.encodeEntries(entriesByVideoId.values),
        )
    }

    private fun shouldUseTraktProgress(): Boolean =
        shouldUseTraktProgressSource(
            isAuthenticated = TraktAuthRepository.isAuthenticated.value,
            source = TraktSettingsRepository.uiState.value.watchProgressSource,
        )

    private fun currentEntries(): List<WatchProgressEntry> {
        return if (shouldUseTraktProgress()) {
            TraktProgressRepository.uiState.value.entries
        } else {
            entriesByVideoId.values.toList()
        }
    }

}
