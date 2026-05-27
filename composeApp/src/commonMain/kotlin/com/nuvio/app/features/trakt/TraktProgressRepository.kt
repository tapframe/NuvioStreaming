package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetTextWithHeaders
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.tmdb.TmdbService
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.WatchProgressSourceTraktHistory
import com.nuvio.app.features.watchprogress.WatchProgressSourceTraktPlayback
import com.nuvio.app.features.watchprogress.WatchProgressSourceTraktShowProgress
import com.nuvio.app.features.watchprogress.buildPlaybackVideoId
import com.nuvio.app.features.watchprogress.shouldTreatAsInProgressForContinueWatching
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

private const val BASE_URL = "https://api.trakt.tv"
private const val TRAKT_COMPLETION_PERCENT_THRESHOLD = 90f
private const val HISTORY_PAGE_LIMIT = 1000
private const val HISTORY_MAX_PAGES = 5
private const val HISTORY_MAX_PAGES_ALL = 20
private const val MAX_RECENT_EPISODE_HISTORY_ENTRIES = 300
private const val METADATA_FETCH_TIMEOUT_MS = 3_500L
private const val METADATA_FETCH_CONCURRENCY = 5
private const val METADATA_HYDRATION_LIMIT = 110
private const val REFRESH_BASE_INTERVAL_MS = 60L * 1000L
private const val REFRESH_MAX_INTERVAL_MS = 15L * 60L * 1000L
private const val EPISODE_PROGRESS_CACHE_TTL_MS = 30L * 60L * 1000L
private const val EPISODE_PROGRESS_FETCH_THROTTLE_MS = 60L * 1000L
private const val MILLIS_PER_DAY = 24L * 60L * 60L * 1000L
private const val AMBIGUOUS_ID_MARKER = "__ambiguous__"

data class TraktProgressUiState(
    val entries: List<WatchProgressEntry> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val hasLoadedRemoteProgress: Boolean = false,
)

object TraktProgressRepository {
    private val log = Logger.withTag("TraktProgress")
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _uiState = MutableStateFlow(TraktProgressUiState())
    val uiState: StateFlow<TraktProgressUiState> = _uiState.asStateFlow()

    private val hiddenProgressShowIds = MutableStateFlow<Set<String>>(emptySet())

    private var hasLoaded = false
    private var refreshRequestId: Long = 0L
    private val refreshJobMutex = Mutex()
    private var inFlightRefresh: Deferred<Unit>? = null
    private var refreshIntervalMs = REFRESH_BASE_INTERVAL_MS
    private var consecutiveRefreshFailures = 0
    private var lastKnownMoviesWatchedAt: String? = null
    private var lastKnownEpisodeActivityFingerprint: String? = null
    private var lastKnownActivityFingerprint: String? = null
    private val episodeProgressMutex = Mutex()
    private val episodeProgressFetchedAtMsByContentId = mutableMapOf<String, Long>()
    private val episodeProgressLastAttemptAtMsByContentId = mutableMapOf<String, Long>()
    private val inFlightEpisodeProgressContentIds = mutableSetOf<String>()
    private var watchedShowEpisodesById: Map<String, Set<Pair<Int, Int>>> = emptyMap()
    private var showIdToTraktPathId: Map<String, String> = emptyMap()
    private var showIdSiblingsMap: Map<String, Set<String>> = emptyMap()

    init {
        scope.launch {
            while (true) {
                delay(refreshIntervalMs)
                TraktAuthRepository.ensureLoaded()
                TraktSettingsRepository.ensureLoaded()
                if (!shouldUseTraktProgress(
                        isAuthenticated = TraktAuthRepository.isAuthenticated.value,
                        source = TraktSettingsRepository.uiState.value.watchProgressSource,
                    )
                ) {
                    updateRefreshBackoff(success = true)
                    continue
                }

                val success = runCatching {
                    refreshIfActivityChanged()
                }.onFailure { error ->
                    if (error is CancellationException) throw error
                    log.w { "Periodic Trakt activity refresh failed: ${error.message}" }
                }.isSuccess
                updateRefreshBackoff(success = success)
            }
        }
    }

    fun ensureLoaded() {
        if (hasLoaded) return
        hasLoaded = true
    }

    fun isShowHiddenFromProgress(contentId: String): Boolean {
        val ids = hiddenProgressShowIds.value
        if (ids.isEmpty()) return false
        val parsed = parseTraktContentIds(contentId)
        val keys = buildList {
            add(contentId)
            parsed.imdb?.takeIf { it.isNotBlank() }?.let { add(it) }
            parsed.tmdb?.let { add("tmdb:$it") }
            parsed.trakt?.let { add("trakt:$it") }
            showIdSiblingsMap[contentId]?.forEach { add(it) }
        }
        return keys.any { ids.contains(it) }
    }

    fun onProfileChanged() {
        invalidateInFlightRefreshes()
        hasLoaded = false
        hiddenProgressShowIds.value = emptySet()
        resetActivitySnapshot()
        resetShowProgressCaches()
        _uiState.value = TraktProgressUiState()
        ensureLoaded()
    }

    fun clearLocalState() {
        invalidateInFlightRefreshes()
        hasLoaded = false
        hiddenProgressShowIds.value = emptySet()
        resetActivitySnapshot()
        resetShowProgressCaches()
        _uiState.value = TraktProgressUiState()
    }

    fun refreshAsync() {
        scope.launch {
            refreshNow()
        }
    }

    suspend fun refreshNow() {
        ensureLoaded()
        val refresh = refreshJobMutex.withLock {
            inFlightRefresh?.takeIf { it.isActive } ?: scope.async {
                refreshNowInternal()
            }.also { inFlightRefresh = it }
        }

        try {
            refresh.await()
        } finally {
            refreshJobMutex.withLock {
                if (inFlightRefresh == refresh && refresh.isCompleted) {
                    inFlightRefresh = null
                }
            }
        }
    }

    suspend fun refreshEpisodeProgress(
        contentId: String,
        forceRefresh: Boolean = false,
    ) {
        ensureLoaded()
        val normalizedContentId = contentId.trim()
        if (normalizedContentId.isBlank()) return
        val headers = TraktAuthRepository.authorizedHeaders() ?: return
        val cacheKey = canonicalLookupKey(normalizedContentId)
        val now = TraktPlatformClock.nowEpochMs()

        var shouldFetch = forceRefresh
        episodeProgressMutex.withLock {
            val lastFetchedAt = episodeProgressFetchedAtMsByContentId[cacheKey] ?: 0L
            val isFresh = lastFetchedAt > 0L && now - lastFetchedAt <= EPISODE_PROGRESS_CACHE_TTL_MS
            if (!forceRefresh && isFresh) return

            val lastAttemptAt = episodeProgressLastAttemptAtMsByContentId[cacheKey] ?: 0L
            if (!forceRefresh && now - lastAttemptAt < EPISODE_PROGRESS_FETCH_THROTTLE_MS) return

            if (!inFlightEpisodeProgressContentIds.add(cacheKey)) return
            episodeProgressLastAttemptAtMsByContentId[cacheKey] = now
            shouldFetch = true
        }

        if (!shouldFetch) return

        try {
            val entries = fetchEpisodeProgressEntries(headers = headers, contentId = normalizedContentId)
            val existingEntries = _uiState.value.entries
            val merged = mergeNewestByVideoId(existingEntries + entries)
            _uiState.value = _uiState.value.copy(entries = merged.sortedByDescending { it.lastUpdatedEpochMs })
            episodeProgressMutex.withLock {
                episodeProgressFetchedAtMsByContentId[cacheKey] = TraktPlatformClock.nowEpochMs()
            }
            if (entries.isNotEmpty()) {
                launchHydration(requestId = refreshRequestId, entries = entries)
            }
        } finally {
            episodeProgressMutex.withLock {
                inFlightEpisodeProgressContentIds.remove(cacheKey)
            }
        }
    }

    private suspend fun refreshIfActivityChanged() {
        val headers = TraktAuthRepository.authorizedHeaders() ?: return
        if (hasActivityChanged(headers) || !_uiState.value.hasLoadedRemoteProgress) {
            refreshNow()
        }
    }

    private suspend fun hasActivityChanged(headers: Map<String, String>): Boolean {
        val activities = runCatching {
            json.decodeFromString<TraktLastActivitiesResponse>(
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/last_activities",
                    headers = headers,
                ),
            )
        }.onFailure { error ->
            if (error is CancellationException) throw error
        }.getOrNull() ?: return !_uiState.value.hasLoadedRemoteProgress

        val moviesWatchedAt = activities.movies?.watchedAt
        if (moviesWatchedAt != lastKnownMoviesWatchedAt) {
            lastKnownMoviesWatchedAt = moviesWatchedAt
        }

        val episodeFingerprint = listOfNotNull(
            activities.episodes?.pausedAt,
            activities.episodes?.watchedAt,
        ).joinToString("|")
        if (episodeFingerprint != lastKnownEpisodeActivityFingerprint) {
            lastKnownEpisodeActivityFingerprint = episodeFingerprint
            episodeProgressMutex.withLock {
                episodeProgressFetchedAtMsByContentId.clear()
            }
        }

        val fingerprint = listOfNotNull(
            activities.movies?.pausedAt,
            activities.movies?.watchedAt,
            activities.episodes?.pausedAt,
            activities.episodes?.watchedAt,
        ).joinToString("|")
        val changed = fingerprint != lastKnownActivityFingerprint
        lastKnownActivityFingerprint = fingerprint
        return changed
    }

    private fun updateRefreshBackoff(success: Boolean) {
        if (success) {
            consecutiveRefreshFailures = 0
            refreshIntervalMs = REFRESH_BASE_INTERVAL_MS
            return
        }

        consecutiveRefreshFailures += 1
        refreshIntervalMs = (REFRESH_BASE_INTERVAL_MS shl (consecutiveRefreshFailures - 1))
            .coerceAtMost(REFRESH_MAX_INTERVAL_MS)
    }

    private fun resetActivitySnapshot() {
        lastKnownMoviesWatchedAt = null
        lastKnownEpisodeActivityFingerprint = null
        lastKnownActivityFingerprint = null
        consecutiveRefreshFailures = 0
        refreshIntervalMs = REFRESH_BASE_INTERVAL_MS
    }

    private fun resetShowProgressCaches() {
        watchedShowEpisodesById = emptyMap()
        showIdToTraktPathId = emptyMap()
        showIdSiblingsMap = emptyMap()
        episodeProgressFetchedAtMsByContentId.clear()
        episodeProgressLastAttemptAtMsByContentId.clear()
        inFlightEpisodeProgressContentIds.clear()
    }

    private suspend fun refreshNowInternal() {
        ensureLoaded()
        val requestId = nextRefreshRequestId()
        val headers = TraktAuthRepository.authorizedHeaders()
        if (headers == null) {
            _uiState.value = TraktProgressUiState()
            return
        }

        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

        val playbackEntries = runCatching {
            fetchPlaybackEntries(headers)
        }.onFailure { error ->
            if (error is CancellationException) throw error
            log.w { "Failed to refresh Trakt progress: ${error.message}" }
        }.getOrNull()

        if (playbackEntries == null) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                errorMessage = getString(Res.string.trakt_progress_load_failed),
            )
            return
        }

        _uiState.value = TraktProgressUiState(
            entries = playbackEntries,
            isLoading = true,
            errorMessage = null,
            hasLoadedRemoteProgress = false,
        )

        if (playbackEntries.isNotEmpty()) {
            launchHydration(requestId = requestId, entries = playbackEntries)
        }

        val completedEntries = runCatching {
            coroutineScope {
                val history = async { fetchHistoryEntries(headers) }
                val watchedShowSeeds = async { fetchWatchedShowSeedEntries(headers) }
                val hiddenShows = async { fetchHiddenShowIds(headers) }
                
                val list = history.await() + watchedShowSeeds.await()
                hiddenProgressShowIds.value = hiddenShows.await()
                list
            }
        }.onFailure { error ->
            if (error is CancellationException) throw error
            log.w { "Failed to fetch Trakt history snapshot: ${error.message}" }
        }.getOrNull()

        if (completedEntries == null) {
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                errorMessage = null,
                hasLoadedRemoteProgress = false,
            )
            return
        }

        if (!isLatestRefreshRequest(requestId)) return

        val merged = mergeNewestByVideoId(playbackEntries + completedEntries)
        _uiState.value = _uiState.value.copy(
            entries = merged.sortedByDescending { it.lastUpdatedEpochMs },
            isLoading = false,
            errorMessage = null,
            hasLoadedRemoteProgress = true,
        )

        if (merged.isNotEmpty()) {
            launchHydration(requestId = requestId, entries = merged)
        }
    }

    private fun launchHydration(
        requestId: Long,
        entries: List<WatchProgressEntry>,
    ) {
        scope.launch {
            val hydrated = runCatching {
                hydrateEntriesFromAddonMeta(entries)
            }.onFailure { error ->
                if (error is CancellationException) throw error
                log.w { "Failed to hydrate Trakt metadata: ${error.message}" }
            }.getOrNull() ?: return@launch

            if (!isLatestRefreshRequest(requestId)) return@launch

            val merged = mergeEntriesPreferRichMetadata(
                current = _uiState.value.entries,
                hydrated = hydrated,
            )
            _uiState.value = _uiState.value.copy(
                entries = merged.sortedByDescending { it.lastUpdatedEpochMs },
                isLoading = false,
                errorMessage = null,
            )
        }
    }

    fun applyOptimisticProgress(entry: WatchProgressEntry) {
        if (!TraktAuthRepository.isAuthenticated.value) return
        val current = _uiState.value.entries.associateBy { it.videoId }.toMutableMap()
        val normalizedEntry = entry.normalizedCompletion()
        val existing = current[normalizedEntry.videoId]
        if (existing == null || normalizedEntry.lastUpdatedEpochMs >= existing.lastUpdatedEpochMs) {
            current[normalizedEntry.videoId] = normalizedEntry
        }
        if (normalizedEntry.isCompleted && normalizedEntry.seasonNumber != null && normalizedEntry.episodeNumber != null) {
            optimisticallyAddWatchedEpisode(
                contentId = normalizedEntry.parentMetaId,
                season = normalizedEntry.seasonNumber,
                episode = normalizedEntry.episodeNumber,
            )
        }
        _uiState.value = _uiState.value.copy(entries = current.values.sortedByDescending { it.lastUpdatedEpochMs })
    }

    fun applyOptimisticRemoval(videoId: String) {
        if (!TraktAuthRepository.isAuthenticated.value) return
        if (videoId.isBlank()) return
        val filtered = _uiState.value.entries.filterNot { it.videoId == videoId }
        _uiState.value = _uiState.value.copy(entries = filtered)
    }

    fun applyOptimisticRemoval(
        contentId: String,
        seasonNumber: Int? = null,
        episodeNumber: Int? = null,
    ) {
        if (!TraktAuthRepository.isAuthenticated.value) return
        val normalizedContentId = contentId.trim()
        if (normalizedContentId.isBlank()) return
        val filtered = _uiState.value.entries.filterNot { entry ->
            if (entry.parentMetaId != normalizedContentId) {
                false
            } else if (seasonNumber != null && episodeNumber != null) {
                entry.seasonNumber == seasonNumber && entry.episodeNumber == episodeNumber
            } else {
                true
            }
        }
        if (seasonNumber != null && episodeNumber != null) {
            optimisticallyRemoveWatchedEpisode(
                contentId = normalizedContentId,
                season = seasonNumber,
                episode = episodeNumber,
            )
        }
        _uiState.value = _uiState.value.copy(entries = filtered)
    }

    suspend fun removeProgress(
        contentId: String,
        seasonNumber: Int? = null,
        episodeNumber: Int? = null,
    ) {
        val normalizedContentId = contentId.trim()
        if (normalizedContentId.isBlank()) return
        val headers = TraktAuthRepository.authorizedHeaders() ?: return

        applyOptimisticRemoval(
            contentId = normalizedContentId,
            seasonNumber = seasonNumber,
            episodeNumber = episodeNumber,
        )

        val playbackMovies = runCatching {
            json.decodeFromString<List<TraktPlaybackItem>>(
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/playback/movies",
                    headers = headers,
                ),
            )
        }.getOrDefault(emptyList())
        val playbackEpisodes = runCatching {
            json.decodeFromString<List<TraktPlaybackItem>>(
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/playback/episodes",
                    headers = headers,
                ),
            )
        }.getOrDefault(emptyList())

        playbackMovies
            .filter { item -> normalizeTraktContentId(item.movie?.ids, fallback = item.movie?.title) == normalizedContentId }
            .forEach { item ->
                item.id?.let { playbackId ->
                    runCatching {
                        httpRequestRaw(
                            method = "DELETE",
                            url = "$BASE_URL/sync/playback/$playbackId",
                            headers = headers,
                            body = "",
                        )
                    }.onFailure { error ->
                        if (error is CancellationException) throw error
                        log.w { "Failed to delete Trakt movie playback $playbackId: ${error.message}" }
                    }
                }
            }

        playbackEpisodes
            .filter { item ->
                val sameContent = normalizeTraktContentId(item.show?.ids, fallback = item.show?.title) == normalizedContentId
                val sameEpisode = if (seasonNumber != null && episodeNumber != null) {
                    item.episode?.season == seasonNumber && item.episode.number == episodeNumber
                } else {
                    true
                }
                sameContent && sameEpisode
            }
            .forEach { item ->
                item.id?.let { playbackId ->
                    runCatching {
                        httpRequestRaw(
                            method = "DELETE",
                            url = "$BASE_URL/sync/playback/$playbackId",
                            headers = headers,
                            body = "",
                        )
                    }.onFailure { error ->
                        if (error is CancellationException) throw error
                        log.w { "Failed to delete Trakt episode playback $playbackId: ${error.message}" }
                    }
                }
            }

        refreshNow()
    }

    private suspend fun fetchHiddenShowIds(headers: Map<String, String>): Set<String> {
        val allIds = mutableSetOf<String>()
        var page = 1
        val limit = 1000
        while (true) {
            val payload = runCatching {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/users/hidden/dropped?type=show&page=$page&limit=$limit",
                    headers = headers,
                )
            }.getOrNull() ?: break

            val items = runCatching {
                json.decodeFromString<List<TraktHiddenItem>>(payload)
            }.getOrNull() ?: break

            if (items.isEmpty()) break
            for (item in items) {
                val ids = item.show?.ids ?: continue
                ids.imdb?.takeIf { it.isNotBlank() }?.let { allIds.add(it) }
                ids.tmdb?.let { allIds.add("tmdb:$it") }
                ids.trakt?.let { allIds.add("trakt:$it") }
            }
            if (items.size < limit) break
            page++
        }
        return allIds
    }

    private suspend fun fetchPlaybackEntries(headers: Map<String, String>): List<WatchProgressEntry> = withContext(Dispatchers.Default) {
        val payloads = coroutineScope {
            val moviesPayload = async {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/playback/movies",
                    headers = headers,
                )
            }
            val episodesPayload = async {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/playback/episodes",
                    headers = headers,
                )
            }

            awaitAll(moviesPayload, episodesPayload)
        }

        val moviesPayload = payloads[0]
        val episodesPayload = payloads[1]

        val moviePlayback = json.decodeFromString<List<TraktPlaybackItem>>(moviesPayload)
        val episodePlayback = json.decodeFromString<List<TraktPlaybackItem>>(episodesPayload)

        val inProgressMovies = moviePlayback.mapIndexedNotNull { index, item ->
            mapPlaybackMovie(item = item, fallbackIndex = index)
        }
        val inProgressEpisodes = episodePlayback.mapIndexedNotNull { index, item ->
            mapPlaybackEpisode(item = item, fallbackIndex = index)
        }

        val merged = mergeNewestByVideoId(inProgressMovies + inProgressEpisodes)
        merged
    }

    private suspend fun fetchHistoryEntries(headers: Map<String, String>): List<WatchProgressEntry> = withContext(Dispatchers.Default) {
        val (episodeHistory, movieHistory) = coroutineScope {
            val episodeHistory = async { fetchRecentEpisodeHistoryEntries(headers) }
            val movieHistory = async { fetchRecentMovieHistoryEntries(headers) }
            episodeHistory.await() to movieHistory.await()
        }

        mergeNewestByVideoId(episodeHistory + movieHistory)
    }

    private suspend fun fetchRecentEpisodeHistoryEntries(
        headers: Map<String, String>,
    ): List<WatchProgressEntry> {
        val cutoffMs = recentWatchCutoffMs()
        val maxPages = if (isAllHistoryWindow()) HISTORY_MAX_PAGES_ALL else HISTORY_MAX_PAGES
        val resultsByShow = linkedMapOf<String, WatchProgressEntry>()
        var fallbackIndex = 0
        var page = 1

        while (page <= maxPages && resultsByShow.size < MAX_RECENT_EPISODE_HISTORY_ENTRIES) {
            val url = buildString {
                append("$BASE_URL/sync/history/episodes?page=$page&limit=$HISTORY_PAGE_LIMIT")
                cutoffMs?.let { append("&start_at=").append(epochMsToTraktIso(it)) }
            }
            val response = httpRequestRaw(
                method = "GET",
                url = url,
                headers = headers,
                body = "",
            )
            if (response.status !in 200..299) break

            val items = runCatching {
                json.decodeFromString<List<TraktHistoryEpisodeItem>>(response.body)
            }.getOrDefault(emptyList())
            if (items.isEmpty()) break

            var shouldStop = false
            for (item in items) {
                val entry = mapHistoryEpisode(item = item, fallbackIndex = fallbackIndex++) ?: continue
                if (cutoffMs != null && entry.lastUpdatedEpochMs < cutoffMs) {
                    shouldStop = true
                    continue
                }
                if (!resultsByShow.containsKey(entry.parentMetaId)) {
                    resultsByShow[entry.parentMetaId] = entry
                }
                if (resultsByShow.size >= MAX_RECENT_EPISODE_HISTORY_ENTRIES) {
                    shouldStop = true
                    break
                }
            }

            val pageCount = response.headerInt("x-pagination-page-count")
            if (items.size < HISTORY_PAGE_LIMIT || shouldStop || (pageCount != null && page >= pageCount)) break
            page += 1
        }

        return resultsByShow.values.toList()
    }

    private suspend fun fetchRecentMovieHistoryEntries(
        headers: Map<String, String>,
    ): List<WatchProgressEntry> {
        val cutoffMs = recentWatchCutoffMs()
        val url = buildString {
            append("$BASE_URL/sync/history/movies?limit=$HISTORY_PAGE_LIMIT")
            cutoffMs?.let { append("&start_at=").append(epochMsToTraktIso(it)) }
        }
        val payload = httpGetTextWithHeaders(url = url, headers = headers)
        return json.decodeFromString<List<TraktHistoryMovieItem>>(payload)
            .mapIndexedNotNull { index, item -> mapHistoryMovie(item = item, fallbackIndex = index) }
            .filter { entry -> cutoffMs == null || entry.lastUpdatedEpochMs >= cutoffMs }
            .distinctBy { entry -> entry.videoId }
    }

    private suspend fun fetchWatchedShowSeedEntries(
        headers: Map<String, String>,
    ): List<WatchProgressEntry> = withContext(Dispatchers.Default) {
        ContinueWatchingPreferencesRepository.ensureLoaded()
        val useFurthestEpisode = ContinueWatchingPreferencesRepository.uiState.value.upNextFromFurthestEpisode
        val payload = httpGetTextWithHeaders(
            url = "$BASE_URL/sync/watched/shows",
            headers = headers,
        )
        val watchedShows = json.decodeFromString<List<TraktWatchedShowItem>>(payload)
        updateWatchedShowCaches(watchedShows)
        val mapped = fixAmbiguousWatchedShowSeeds(
            watchedShows.mapNotNull { item ->
                mapWatchedShowSeed(
                    item = item,
                    useFurthestEpisode = useFurthestEpisode,
                )
            },
        )
            .sortedByDescending { entry -> entry.lastUpdatedEpochMs }
        mapped
    }

    private fun updateWatchedShowCaches(items: List<TraktWatchedShowItem>) {
        val siblingsMap = mutableMapOf<String, MutableSet<String>>()

        items.forEach { item ->
            val keys = watchedShowLookupKeys(item.show?.ids)
            if (keys.size <= 1) return@forEach
            for (key in keys) {
                val existing = siblingsMap[key]
                if (existing != null) {
                    existing.clear()
                    existing.add(AMBIGUOUS_ID_MARKER)
                } else {
                    siblingsMap[key] = (keys - key).toMutableSet()
                }
            }
        }

        val ambiguousIds = siblingsMap.entries
            .filter { (_, siblings) -> AMBIGUOUS_ID_MARKER in siblings }
            .mapTo(mutableSetOf()) { (key, _) -> key }

        val episodesByKey = mutableMapOf<String, MutableSet<Pair<Int, Int>>>()
        val pathIdsByKey = mutableMapOf<String, String>()

        items.forEach { item ->
            val ids = item.show?.ids ?: return@forEach
            val keys = watchedShowLookupKeys(ids).filter { it !in ambiguousIds }
            if (keys.isEmpty()) return@forEach

            val traktPathId = ids.slug?.takeIf { it.isNotBlank() } ?: ids.trakt?.toString()
            if (traktPathId != null) {
                keys.forEach { key -> pathIdsByKey[key] = traktPathId }
            }

            val episodes = mutableSetOf<Pair<Int, Int>>()
            item.seasons.orEmpty()
                .filter { (it.number ?: 0) > 0 }
                .forEach { season ->
                    val seasonNumber = season.number ?: return@forEach
                    season.episodes.orEmpty()
                        .filter { episode -> (episode.number ?: 0) > 0 && (episode.plays ?: 1) > 0 }
                        .forEach { episode ->
                            val episodeNumber = episode.number ?: return@forEach
                            episodes.add(seasonNumber to episodeNumber)
                        }
                }

            if (episodes.isNotEmpty()) {
                keys.forEach { key ->
                    episodesByKey.getOrPut(key) { mutableSetOf() }.addAll(episodes)
                }
            }
        }

        watchedShowEpisodesById = episodesByKey.mapValues { (_, episodes) -> episodes.toSet() }
        showIdToTraktPathId = pathIdsByKey
        showIdSiblingsMap = siblingsMap.mapValues { (_, siblings) -> siblings.toSet() }
    }

    private fun fixAmbiguousWatchedShowSeeds(
        seeds: List<WatchProgressEntry>,
    ): List<WatchProgressEntry> {
        val ambiguousIds = showIdSiblingsMap.entries
            .filter { (_, siblings) -> AMBIGUOUS_ID_MARKER in siblings }
            .mapTo(mutableSetOf()) { (key, _) -> key }
        if (ambiguousIds.isEmpty()) return seeds

        return seeds.map { seed ->
            if (!seed.parentMetaId.startsWith("tt") || seed.parentMetaId !in ambiguousIds) {
                seed
            } else {
                val tmdbSibling = showIdSiblingsMap[seed.parentMetaId]
                    ?.firstOrNull { it.startsWith("tmdb:") }
                if (tmdbSibling == null) {
                    seed
                } else {
                    val remappedVideoId = if (seed.seasonNumber != null && seed.episodeNumber != null) {
                        buildPlaybackVideoId(
                            parentMetaId = tmdbSibling,
                            seasonNumber = seed.seasonNumber,
                            episodeNumber = seed.episodeNumber,
                            fallbackVideoId = null,
                        )
                    } else {
                        tmdbSibling
                    }
                    seed.copy(parentMetaId = tmdbSibling, videoId = remappedVideoId)
                }
            }
        }
    }

    private suspend fun fetchEpisodeProgressEntries(
        headers: Map<String, String>,
        contentId: String,
    ): List<WatchProgressEntry> = withContext(Dispatchers.Default) {
        val pathId = resolveToTraktAcceptedId(headers = headers, contentId = contentId)
        val response = httpRequestRaw(
            method = "GET",
            url = "$BASE_URL/shows/$pathId/progress/watched?hidden=false&specials=false&count_specials=false",
            headers = headers,
            body = "",
        )
        if (response.status !in 200..299) return@withContext emptyList()

        val progress = runCatching {
            json.decodeFromString<TraktShowProgressResponse>(response.body)
        }.getOrNull() ?: return@withContext emptyList()

        val completed = mutableListOf<WatchProgressEntry>()
        progress.seasons.orEmpty()
            .filter { season -> (season.number ?: 0) > 0 }
            .forEach { season ->
                val seasonNumber = season.number ?: return@forEach
                season.episodes.orEmpty()
                    .filter { episode -> episode.completed == true && (episode.number ?: 0) > 0 }
                    .forEach { episode ->
                        val episodeNumber = episode.number ?: return@forEach
                        completed += mapShowProgressEpisode(
                            contentId = contentId,
                            season = seasonNumber,
                            episode = episodeNumber,
                            lastWatchedAt = episode.lastWatchedAt,
                        )
                    }
            }

        val inProgress = fetchPlaybackEntries(headers)
            .filter { entry ->
                entry.parentMetaId == contentId &&
                    entry.seasonNumber != null &&
                    entry.episodeNumber != null
            }

        mergeNewestByVideoId(completed + inProgress)
    }

    private suspend fun resolveToTraktAcceptedId(
        headers: Map<String, String>,
        contentId: String,
    ): String {
        val parsed = parseTraktContentIds(contentId)
        parsed.imdb?.takeIf { it.isNotBlank() }?.let { return it }
        parsed.trakt?.let { return it.toString() }

        val tmdb = parsed.tmdb
        if (tmdb != null) {
            showIdToTraktPathId["tmdb:$tmdb"]?.let { return it }
            runCatching {
                TmdbService.tmdbToImdb(tmdbId = tmdb, mediaType = "series")
                    ?: TmdbService.tmdbToImdb(tmdbId = tmdb, mediaType = "movie")
            }.getOrNull()?.takeIf { it.isNotBlank() }?.let { return it }

            val response = runCatching {
                httpRequestRaw(
                    method = "GET",
                    url = "$BASE_URL/search/tmdb/$tmdb?type=show",
                    headers = headers,
                    body = "",
                )
            }.getOrNull()
            if (response != null && response.status in 200..299) {
                val result = runCatching {
                    json.decodeFromString<List<TraktSearchResult>>(response.body)
                }.getOrDefault(emptyList()).firstOrNull()
                result?.show?.ids?.let { ids ->
                    ids.imdb?.takeIf { it.isNotBlank() }?.let { return it }
                    ids.slug?.takeIf { it.isNotBlank() }?.let { return it }
                    ids.trakt?.let { return it.toString() }
                }
            }
            return "tmdb:$tmdb"
        }

        return contentId
    }

    private suspend fun mapShowProgressEpisode(
        contentId: String,
        season: Int,
        episode: Int,
        lastWatchedAt: String?,
    ): WatchProgressEntry {
        val resolvedEpisode = resolveAddonEpisodeProgress(
            contentId = contentId,
            season = season,
            episode = episode,
            episodeTitle = null,
        )
        val resolvedSeason = resolvedEpisode?.season ?: season
        val resolvedNumber = resolvedEpisode?.episode ?: episode

        return WatchProgressEntry(
            contentType = "series",
            parentMetaId = contentId,
            parentMetaType = "series",
            videoId = buildPlaybackVideoId(
                parentMetaId = contentId,
                seasonNumber = resolvedSeason,
                episodeNumber = resolvedNumber,
                fallbackVideoId = null,
            ),
            title = contentId,
            seasonNumber = resolvedSeason,
            episodeNumber = resolvedNumber,
            episodeTitle = resolvedEpisode?.title,
            lastPositionMs = 1L,
            durationMs = 1L,
            lastUpdatedEpochMs = rankedTimestamp(lastWatchedAt, fallbackIndex = 0),
            isCompleted = true,
            progressPercent = 100f,
            source = WatchProgressSourceTraktShowProgress,
        )
    }

    private fun watchedShowLookupKeys(ids: TraktExternalIds?): List<String> {
        if (ids == null) return emptyList()
        return buildList {
            ids.imdb?.takeIf { it.isNotBlank() }?.let { add(it) }
            ids.tmdb?.let { add("tmdb:$it") }
            ids.trakt?.let { add("trakt:$it") }
            ids.slug?.takeIf { it.isNotBlank() }?.let { add(it) }
        }
    }

    private fun canonicalLookupKey(contentId: String): String {
        val canonical = normalizeTraktContentId(
            ids = parseTraktContentIds(contentId),
            fallback = contentId.trim(),
        )
        return canonical.takeIf { it.isNotBlank() } ?: contentId.trim()
    }

    private fun optimisticallyAddWatchedEpisode(contentId: String, season: Int, episode: Int) {
        updateWatchedEpisodeCache(contentId = contentId, season = season, episode = episode, add = true)
    }

    private fun optimisticallyRemoveWatchedEpisode(contentId: String, season: Int, episode: Int) {
        updateWatchedEpisodeCache(contentId = contentId, season = season, episode = episode, add = false)
    }

    private fun updateWatchedEpisodeCache(
        contentId: String,
        season: Int,
        episode: Int,
        add: Boolean,
    ) {
        val key = contentId.trim()
        if (key.isBlank()) return
        val keysToUpdate = showIdSiblingsMap[key]
            ?.let { siblings -> (siblings + key).filter { it != AMBIGUOUS_ID_MARKER && !it.startsWith("trakt:") } }
            ?: listOf(key)
        val updated = watchedShowEpisodesById.toMutableMap()
        var changed = false
        keysToUpdate.forEach { lookupKey ->
            val current = updated[lookupKey].orEmpty()
            val pair = season to episode
            val next = if (add) current + pair else current - pair
            if (next != current) {
                updated[lookupKey] = next
                changed = true
            }
        }
        if (changed) {
            watchedShowEpisodesById = updated
        }
    }

    private fun mergeNewestByVideoId(entries: List<WatchProgressEntry>): List<WatchProgressEntry> {
        val mergedByVideoId = linkedMapOf<String, WatchProgressEntry>()
        entries.forEach { rawEntry ->
            val entry = rawEntry.normalizedCompletion()
            val existing = mergedByVideoId[entry.videoId]
            if (existing == null || shouldReplaceProgressSnapshotEntry(existing = existing, candidate = entry)) {
                mergedByVideoId[entry.videoId] = entry
            }
        }

        return mergedByVideoId.values
            .toList()
            .sortedByDescending { it.lastUpdatedEpochMs }
    }

    private fun shouldReplaceProgressSnapshotEntry(
        existing: WatchProgressEntry,
        candidate: WatchProgressEntry,
    ): Boolean {
        val existingInProgress = existing.shouldTreatAsInProgressForContinueWatching()
        val candidateInProgress = candidate.shouldTreatAsInProgressForContinueWatching()
        if (existingInProgress != candidateInProgress) {
            return candidateInProgress
        }
        return candidate.lastUpdatedEpochMs > existing.lastUpdatedEpochMs
    }

    private fun mergeEntriesPreferRichMetadata(
        current: List<WatchProgressEntry>,
        hydrated: List<WatchProgressEntry>,
    ): List<WatchProgressEntry> {
        val merged = current.associateBy { it.videoId }.toMutableMap()
        hydrated.forEach { candidate ->
            val existing = merged[candidate.videoId]
            if (existing == null || shouldReplaceEntry(existing = existing, candidate = candidate)) {
                merged[candidate.videoId] = candidate
            }
        }
        return merged.values.toList()
    }

    private fun shouldReplaceEntry(existing: WatchProgressEntry, candidate: WatchProgressEntry): Boolean {
        if (candidate.lastUpdatedEpochMs != existing.lastUpdatedEpochMs) {
            return candidate.lastUpdatedEpochMs > existing.lastUpdatedEpochMs
        }
        return metadataScore(candidate) > metadataScore(existing)
    }

    private fun metadataScore(entry: WatchProgressEntry): Int {
        var score = 0
        if (!entry.logo.isNullOrBlank()) score += 1
        if (!entry.poster.isNullOrBlank()) score += 1
        if (!entry.background.isNullOrBlank()) score += 1
        if (!entry.episodeTitle.isNullOrBlank()) score += 1
        if (!entry.episodeThumbnail.isNullOrBlank()) score += 1
        if (!entry.pauseDescription.isNullOrBlank()) score += 1
        return score
    }

    private fun nextRefreshRequestId(): Long {
        refreshRequestId += 1L
        return refreshRequestId
    }

    private fun invalidateInFlightRefreshes() {
        refreshRequestId += 1L
        inFlightRefresh?.cancel()
        inFlightRefresh = null
    }

    private fun isLatestRefreshRequest(requestId: Long): Boolean = refreshRequestId == requestId

    private suspend fun hydrateEntriesFromAddonMeta(
        entries: List<WatchProgressEntry>,
    ): List<WatchProgressEntry> = coroutineScope {
        if (entries.isEmpty()) return@coroutineScope entries

        val uniqueContent = entries
            .map { entry -> entry.parentMetaType to entry.parentMetaId }
            .distinct()
            .take(METADATA_HYDRATION_LIMIT)

        val semaphore = Semaphore(METADATA_FETCH_CONCURRENCY)
        val metadataByContent = uniqueContent
            .map { (metaType, metaId) ->
                async {
                    semaphore.withPermit {
                        val normalizedType = when (metaType.lowercase()) {
                            "movie", "film" -> "movie"
                            else -> "series"
                        }
                        val meta = withTimeoutOrNull(METADATA_FETCH_TIMEOUT_MS) {
                            MetaDetailsRepository.fetch(type = normalizedType, id = metaId)
                        }
                        (metaType to metaId) to meta
                    }
                }
            }
            .awaitAll()
            .toMap()

        entries.map { entry ->
            val meta = metadataByContent[entry.parentMetaType to entry.parentMetaId] ?: return@map entry
            var resolvedSeason = entry.seasonNumber
            var resolvedEpisode = entry.episodeNumber

            val episode = if (resolvedSeason != null && resolvedEpisode != null) {
                val directMatch = meta.videos.firstOrNull { video ->
                    video.season == resolvedSeason && video.episode == resolvedEpisode
                }
                if (directMatch != null) {
                    directMatch
                } else {
                    val remapped = resolveAddonEpisodeProgress(
                        contentId = entry.parentMetaId,
                        season = resolvedSeason,
                        episode = resolvedEpisode,
                        episodeTitle = entry.episodeTitle,
                    )
                    if (remapped != null) {
                        resolvedSeason = remapped.season
                        resolvedEpisode = remapped.episode
                        meta.videos.firstOrNull { video ->
                            video.season == remapped.season && video.episode == remapped.episode
                        }
                    } else {
                        null
                    }
                }
            } else {
                null
            }

            entry.copy(
                title = entry.title.takeIf { it.isNotBlank() } ?: meta.name,
                logo = entry.logo ?: meta.logo,
                poster = entry.poster ?: meta.poster,
                background = entry.background ?: meta.background,
                seasonNumber = resolvedSeason ?: entry.seasonNumber,
                episodeNumber = resolvedEpisode ?: entry.episodeNumber,
                episodeTitle = entry.episodeTitle ?: episode?.title,
                episodeThumbnail = entry.episodeThumbnail ?: episode?.thumbnail,
                pauseDescription = entry.pauseDescription
                    ?: episode?.overview
                    ?: meta.description,
            )
        }
    }

    private fun mapPlaybackMovie(item: TraktPlaybackItem, fallbackIndex: Int): WatchProgressEntry? {
        val movie = item.movie ?: return null
        val parentMetaId = normalizeTraktContentId(movie.ids, fallback = movie.title)
        if (parentMetaId.isBlank()) return null

        val progressPercent = normalizeTraktProgressPercent(item.progress) ?: return null
        if (progressPercent <= 0f) return null

        return WatchProgressEntry(
            contentType = "movie",
            parentMetaId = parentMetaId,
            parentMetaType = "movie",
            videoId = parentMetaId,
            title = movie.title ?: parentMetaId,
            lastPositionMs = 0L,
            durationMs = 0L,
            lastUpdatedEpochMs = rankedTimestamp(item.pausedAt, fallbackIndex),
            isCompleted = progressPercent >= TRAKT_COMPLETION_PERCENT_THRESHOLD,
            progressPercent = progressPercent,
            source = WatchProgressSourceTraktPlayback,
        ).normalizedCompletion()
    }

    private suspend fun mapPlaybackEpisode(item: TraktPlaybackItem, fallbackIndex: Int): WatchProgressEntry? {
        val show = item.show ?: return null
        val episode = item.episode ?: return null
        val season = episode.season ?: return null
        val number = episode.number ?: return null

        val parentMetaId = normalizeTraktContentId(show.ids, fallback = show.title)
        if (parentMetaId.isBlank()) return null

        val progressPercent = normalizeTraktProgressPercent(item.progress) ?: return null
        if (progressPercent <= 0f) return null
        val resolvedEpisode = resolveAddonEpisodeProgress(
            contentId = parentMetaId,
            season = season,
            episode = number,
            episodeTitle = episode.title,
        )
        val resolvedSeason = resolvedEpisode?.season ?: season
        val resolvedNumber = resolvedEpisode?.episode ?: number

        return WatchProgressEntry(
            contentType = "series",
            parentMetaId = parentMetaId,
            parentMetaType = "series",
            videoId = buildPlaybackVideoId(
                parentMetaId = parentMetaId,
                seasonNumber = resolvedSeason,
                episodeNumber = resolvedNumber,
                fallbackVideoId = episode.ids?.trakt?.let { "trakt:$it" },
            ),
            title = show.title ?: parentMetaId,
            seasonNumber = resolvedSeason,
            episodeNumber = resolvedNumber,
            episodeTitle = resolvedEpisode?.title ?: episode.title,
            lastPositionMs = 0L,
            durationMs = 0L,
            lastUpdatedEpochMs = rankedTimestamp(item.pausedAt, fallbackIndex),
            isCompleted = progressPercent >= TRAKT_COMPLETION_PERCENT_THRESHOLD,
            progressPercent = progressPercent,
            source = WatchProgressSourceTraktPlayback,
        ).normalizedCompletion()
    }

    private suspend fun mapHistoryEpisode(item: TraktHistoryEpisodeItem, fallbackIndex: Int): WatchProgressEntry? {
        val show = item.show ?: return null
        val episode = item.episode ?: return null
        val season = episode.season ?: return null
        val number = episode.number ?: return null

        val parentMetaId = normalizeTraktContentId(show.ids, fallback = show.title)
        if (parentMetaId.isBlank()) return null
        val resolvedEpisode = resolveAddonEpisodeProgress(
            contentId = parentMetaId,
            season = season,
            episode = number,
            episodeTitle = episode.title,
        )
        val resolvedSeason = resolvedEpisode?.season ?: season
        val resolvedNumber = resolvedEpisode?.episode ?: number

        return WatchProgressEntry(
            contentType = "series",
            parentMetaId = parentMetaId,
            parentMetaType = "series",
            videoId = buildPlaybackVideoId(
                parentMetaId = parentMetaId,
                seasonNumber = resolvedSeason,
                episodeNumber = resolvedNumber,
                fallbackVideoId = episode.ids?.trakt?.let { "trakt:$it" },
            ),
            title = show.title ?: parentMetaId,
            seasonNumber = resolvedSeason,
            episodeNumber = resolvedNumber,
            episodeTitle = resolvedEpisode?.title ?: episode.title,
            lastPositionMs = 1L,
            durationMs = 1L,
            lastUpdatedEpochMs = rankedTimestamp(item.watchedAt, fallbackIndex),
            isCompleted = true,
            progressPercent = 100f,
            source = WatchProgressSourceTraktHistory,
        )
    }

    private fun mapHistoryMovie(item: TraktHistoryMovieItem, fallbackIndex: Int): WatchProgressEntry? {
        val movie = item.movie ?: return null
        val parentMetaId = normalizeTraktContentId(movie.ids, fallback = movie.title)
        if (parentMetaId.isBlank()) return null

        return WatchProgressEntry(
            contentType = "movie",
            parentMetaId = parentMetaId,
            parentMetaType = "movie",
            videoId = parentMetaId,
            title = movie.title ?: parentMetaId,
            lastPositionMs = 1L,
            durationMs = 1L,
            lastUpdatedEpochMs = rankedTimestamp(item.watchedAt, fallbackIndex),
            isCompleted = true,
            progressPercent = 100f,
            source = WatchProgressSourceTraktHistory,
        )
    }

    private suspend fun mapWatchedShowSeed(
        item: TraktWatchedShowItem,
        useFurthestEpisode: Boolean,
    ): WatchProgressEntry? {
        val show = item.show ?: return null
        val parentMetaId = normalizeTraktContentId(show.ids, fallback = show.title)
        if (parentMetaId.isBlank()) return null

        val completedEpisode = item.seasons.orEmpty()
            .asSequence()
            .filter { season -> (season.number ?: 0) > 0 }
            .flatMap { season ->
                val seasonNumber = season.number ?: return@flatMap emptySequence()
                season.episodes.orEmpty()
                    .asSequence()
                    .filter { episode -> (episode.number ?: 0) > 0 && (episode.plays ?: 1) > 0 }
                    .mapNotNull { episode ->
                        val episodeNumber = episode.number ?: return@mapNotNull null
                        TraktWatchedShowEpisodeSeed(
                            season = seasonNumber,
                            episode = episodeNumber,
                            watchedAt = rankedTimestamp(
                                isoDate = episode.lastWatchedAt ?: item.lastWatchedAt,
                                fallbackIndex = 0,
                            ),
                        )
                    }
            }
            .maxWithOrNull(
                if (useFurthestEpisode) {
                    compareBy<TraktWatchedShowEpisodeSeed>(
                        { it.season },
                        { it.episode },
                        { it.watchedAt },
                    )
                } else {
                    compareBy<TraktWatchedShowEpisodeSeed>(
                        { it.watchedAt },
                        { it.season },
                        { it.episode },
                    )
                },
            ) ?: return null
        val resolvedEpisode = resolveAddonEpisodeProgress(
            contentId = parentMetaId,
            season = completedEpisode.season,
            episode = completedEpisode.episode,
            episodeTitle = null,
        )
        val resolvedSeason = resolvedEpisode?.season ?: completedEpisode.season
        val resolvedNumber = resolvedEpisode?.episode ?: completedEpisode.episode

        return WatchProgressEntry(
            contentType = "series",
            parentMetaId = parentMetaId,
            parentMetaType = "series",
            videoId = buildPlaybackVideoId(
                parentMetaId = parentMetaId,
                seasonNumber = resolvedSeason,
                episodeNumber = resolvedNumber,
                fallbackVideoId = null,
            ),
            title = show.title ?: parentMetaId,
            seasonNumber = resolvedSeason,
            episodeNumber = resolvedNumber,
            episodeTitle = resolvedEpisode?.title,
            lastPositionMs = 1L,
            durationMs = 1L,
            lastUpdatedEpochMs = completedEpisode.watchedAt,
            isCompleted = true,
            progressPercent = 100f,
            source = WatchProgressSourceTraktShowProgress,
        )
    }

    private fun normalizeTraktProgressPercent(rawProgress: Float?): Float? {
        val value = rawProgress ?: return null
        if (!value.isFinite()) return null
        val normalized = when {
            value <= 1f -> value * 100f
            else -> value
        }
        return normalized.coerceIn(0f, 100f)
    }

    private fun recentWatchCutoffMs(): Long? {
        val daysCap = normalizeTraktContinueWatchingDaysCap(
            TraktSettingsRepository.uiState.value.continueWatchingDaysCap,
        )
        if (daysCap == TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL) return null
        return TraktPlatformClock.nowEpochMs() - (daysCap.toLong() * MILLIS_PER_DAY)
    }

    private fun isAllHistoryWindow(): Boolean =
        normalizeTraktContinueWatchingDaysCap(
            TraktSettingsRepository.uiState.value.continueWatchingDaysCap,
        ) == TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL

    private fun epochMsToTraktIso(epochMs: Long): String {
        val totalSeconds = epochMs.coerceAtLeast(0L) / 1000L
        val second = (totalSeconds % 60).toInt()
        val minute = ((totalSeconds / 60) % 60).toInt()
        val hour = ((totalSeconds / 3600) % 24).toInt()
        var days = (totalSeconds / 86400).toInt()

        var year = 1970
        while (true) {
            val daysInYear = if (isLeapYear(year)) 366 else 365
            if (days < daysInYear) break
            days -= daysInYear
            year += 1
        }

        val monthDays = if (isLeapYear(year)) {
            intArrayOf(31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        } else {
            intArrayOf(31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        }
        var monthIndex = 0
        while (monthIndex < monthDays.size && days >= monthDays[monthIndex]) {
            days -= monthDays[monthIndex]
            monthIndex += 1
        }
        val month = monthIndex + 1
        val day = days + 1

        return "${year.pad4()}-${month.pad2()}-${day.pad2()}T${hour.pad2()}:${minute.pad2()}:${second.pad2()}.000Z"
    }

    private fun isLeapYear(year: Int): Boolean =
        (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)

    private fun Int.pad2(): String = if (this < 10) "0$this" else "$this"
    private fun Int.pad4(): String = toString().padStart(4, '0')

    private fun com.nuvio.app.features.addons.RawHttpResponse.headerInt(name: String): Int? =
        headers[name.lowercase()]
            ?.substringBefore(',')
            ?.trim()
            ?.toIntOrNull()

    private fun rankedTimestamp(isoDate: String?, fallbackIndex: Int): Long {
        isoDate
            ?.takeIf { it.isNotBlank() }
            ?.let(TraktPlatformClock::parseIsoDateTimeToEpochMs)
            ?.let { return it }
        return TraktPlatformClock.nowEpochMs() - (fallbackIndex * 1_000L)
    }

    private suspend fun resolveAddonEpisodeProgress(
        contentId: String,
        season: Int,
        episode: Int,
        episodeTitle: String?,
    ): EpisodeMappingEntry? {
        return runCatching {
            TraktEpisodeMappingService.resolveAddonEpisodeMapping(
                contentId = contentId,
                contentType = "series",
                season = season,
                episode = episode,
                episodeTitle = episodeTitle,
            )
        }.onFailure { error ->
            if (error is CancellationException) throw error
            log.w { "resolveAddonEpisodeProgress failed for $contentId s=$season e=$episode: ${error.message}" }
        }.getOrNull()
    }
}

@Serializable
private data class TraktPlaybackItem(
    @SerialName("id") val id: Long? = null,
    @SerialName("progress") val progress: Float? = null,
    @SerialName("paused_at") val pausedAt: String? = null,
    @SerialName("movie") val movie: TraktMedia? = null,
    @SerialName("show") val show: TraktMedia? = null,
    @SerialName("episode") val episode: TraktEpisode? = null,
)

@Serializable
private data class TraktLastActivitiesResponse(
    @SerialName("all") val all: String? = null,
    @SerialName("movies") val movies: TraktLastActivitiesMedia? = null,
    @SerialName("episodes") val episodes: TraktLastActivitiesMedia? = null,
)

@Serializable
private data class TraktLastActivitiesMedia(
    @SerialName("watched_at") val watchedAt: String? = null,
    @SerialName("paused_at") val pausedAt: String? = null,
)

@Serializable
private data class TraktHistoryEpisodeItem(
    @SerialName("watched_at") val watchedAt: String? = null,
    @SerialName("show") val show: TraktMedia? = null,
    @SerialName("episode") val episode: TraktEpisode? = null,
)

@Serializable
private data class TraktHistoryMovieItem(
    @SerialName("watched_at") val watchedAt: String? = null,
    @SerialName("movie") val movie: TraktMedia? = null,
)

@Serializable
private data class TraktWatchedShowItem(
    @SerialName("last_watched_at") val lastWatchedAt: String? = null,
    @SerialName("show") val show: TraktMedia? = null,
    @SerialName("seasons") val seasons: List<TraktWatchedShowSeason>? = null,
)

@Serializable
private data class TraktWatchedShowSeason(
    @SerialName("number") val number: Int? = null,
    @SerialName("episodes") val episodes: List<TraktWatchedShowEpisode>? = null,
)

@Serializable
private data class TraktWatchedShowEpisode(
    @SerialName("number") val number: Int? = null,
    @SerialName("plays") val plays: Int? = null,
    @SerialName("last_watched_at") val lastWatchedAt: String? = null,
)

private data class TraktWatchedShowEpisodeSeed(
    val season: Int,
    val episode: Int,
    val watchedAt: Long,
)

@Serializable
private data class TraktMedia(
    @SerialName("title") val title: String? = null,
    @SerialName("ids") val ids: TraktExternalIds? = null,
)

@Serializable
private data class TraktEpisode(
    @SerialName("title") val title: String? = null,
    @SerialName("season") val season: Int? = null,
    @SerialName("number") val number: Int? = null,
    @SerialName("ids") val ids: TraktExternalIds? = null,
)

@Serializable
private data class TraktShowProgressResponse(
    @SerialName("aired") val aired: Int? = null,
    @SerialName("completed") val completed: Int? = null,
    @SerialName("seasons") val seasons: List<TraktShowProgressSeason>? = null,
)

@Serializable
private data class TraktShowProgressSeason(
    @SerialName("number") val number: Int? = null,
    @SerialName("episodes") val episodes: List<TraktShowProgressEpisode>? = null,
)

@Serializable
private data class TraktShowProgressEpisode(
    @SerialName("number") val number: Int? = null,
    @SerialName("completed") val completed: Boolean? = null,
    @SerialName("last_watched_at") val lastWatchedAt: String? = null,
)

@Serializable
private data class TraktSearchResult(
    @SerialName("type") val type: String? = null,
    @SerialName("score") val score: Float? = null,
    @SerialName("show") val show: TraktMedia? = null,
    @SerialName("movie") val movie: TraktMedia? = null,
)

@Serializable
private data class TraktHiddenItem(
    @SerialName("hidden_at") val hiddenAt: String? = null,
    @SerialName("type") val type: String? = null,
    @SerialName("show") val show: TraktMedia? = null,
    @SerialName("movie") val movie: TraktMedia? = null,
)
