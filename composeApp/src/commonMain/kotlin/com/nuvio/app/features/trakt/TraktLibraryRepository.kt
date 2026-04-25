package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.httpGetTextWithHeaders
import com.nuvio.app.features.addons.httpPostJsonWithHeaders
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.library.LibraryItem
import com.nuvio.app.features.tmdb.TmdbService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val BASE_URL = "https://api.trakt.tv"
private const val WATCHLIST_KEY = "trakt:watchlist"
private const val PERSONAL_LIST_PREFIX = "trakt:list:"
private const val METADATA_FETCH_TIMEOUT_MS = 3_500L
private const val METADATA_FETCH_CONCURRENCY = 5
private const val LIST_FETCH_CONCURRENCY = 4
private const val SNAPSHOT_CACHE_TTL_MS = 60_000L
private const val LIST_TABS_CACHE_TTL_MS = 60_000L
private const val FORCE_REFRESH_DEDUP_MS = 10_000L

data class TraktLibraryUiState(
    val listTabs: List<TraktListTab> = emptyList(),
    val entriesByList: Map<String, List<LibraryItem>> = emptyMap(),
    val allItems: List<LibraryItem> = emptyList(),
    val membershipByContent: Map<String, Set<String>> = emptyMap(),
    val isLoading: Boolean = false,
    val hasLoaded: Boolean = false,
    val errorMessage: String? = null,
)

object TraktLibraryRepository {
    private val log = Logger.withTag("TraktLibrary")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _uiState = MutableStateFlow(TraktLibraryUiState())
    val uiState: StateFlow<TraktLibraryUiState> = _uiState.asStateFlow()

    private var hasLoaded = false
    private val refreshMutex = Mutex()
    private var hydrationJob: Job? = null
    private var lastRefreshAtMs: Long = 0L
    private var lastListTabsRefreshAtMs: Long = 0L

    fun ensureLoaded() {
        if (hasLoaded) return
        hasLoaded = true
        loadSnapshotFromDisk()
    }

    fun preloadListTabsAsync() {
        if (!TraktAuthRepository.isAuthenticated.value) return
        if (_uiState.value.listTabs.isNotEmpty()) return
        scope.launch {
            runCatching { preloadListTabs() }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    log.w { "Failed to preload Trakt list tabs: ${error.message}" }
                }
        }
    }

    fun onProfileChanged() {
        hydrationJob?.cancel()
        hydrationJob = null
        hasLoaded = false
        lastRefreshAtMs = 0L
        lastListTabsRefreshAtMs = 0L
        _uiState.value = TraktLibraryUiState()
        ensureLoaded()
    }

    fun clearLocalState() {
        hydrationJob?.cancel()
        hydrationJob = null
        hasLoaded = false
        lastRefreshAtMs = 0L
        lastListTabsRefreshAtMs = 0L
        _uiState.value = TraktLibraryUiState()
        TraktLibraryStorage.savePayload("")
    }

    fun currentListTabs(): List<TraktListTab> = _uiState.value.listTabs

    fun isInAnyList(itemId: String, itemType: String): Boolean {
        val key = contentKey(itemId, itemType)
        return _uiState.value.membershipByContent[key].orEmpty().isNotEmpty()
    }

    suspend fun refreshNow() {
        refresh(force = true)
    }

    suspend fun ensureFresh() {
        refresh(force = false)
    }

    private suspend fun preloadListTabs() {
        ensureLoaded()
        refreshMutex.withLock {
            if (_uiState.value.listTabs.isNotEmpty()) return

            val headers = TraktAuthRepository.authorizedHeaders() ?: return
            val tabs = fetchListTabs(headers)
            _uiState.value = _uiState.value.copy(
                listTabs = tabs,
                errorMessage = null,
            )
            lastListTabsRefreshAtMs = TraktPlatformClock.nowEpochMs()
        }
    }

    private suspend fun refresh(force: Boolean) {
        ensureLoaded()
        refreshMutex.withLock {
            val now = TraktPlatformClock.nowEpochMs()
            val current = _uiState.value
            val cacheWindowMs = if (force) FORCE_REFRESH_DEDUP_MS else SNAPSHOT_CACHE_TTL_MS
            if (
                current.hasLoaded &&
                current.errorMessage == null &&
                now - lastRefreshAtMs <= cacheWindowMs
            ) {
                return
            }

            AddonRepository.initialize()

            val headers = TraktAuthRepository.authorizedHeaders()
            if (headers == null) {
                _uiState.value = TraktLibraryUiState()
                lastRefreshAtMs = 0L
                lastListTabsRefreshAtMs = 0L
                return
            }

            _uiState.value = current.copy(isLoading = true, errorMessage = null)

            val result = runCatching {
                fetchSnapshot(headers) { partialState ->
                    _uiState.value = partialState.copy(
                        isLoading = true,
                        hasLoaded = true,
                        errorMessage = null,
                    )
                    hydrateMissingMetadataAsync(_uiState.value)
                }
            }.onFailure { error ->
                if (error is CancellationException) throw error
                log.w { "Failed to refresh Trakt library: ${error.message}" }
            }.getOrNull()

            if (result == null) {
                _uiState.value = current.copy(
                    isLoading = false,
                    hasLoaded = true,
                    errorMessage = getString(Res.string.trakt_library_load_failed),
                )
                return
            }

            _uiState.value = result.copy(
                isLoading = false,
                hasLoaded = true,
                errorMessage = null,
            )
            persistSnapshot(_uiState.value)
            hydrateMissingMetadataAsync(_uiState.value)
            lastRefreshAtMs = now
        }
    }

    suspend fun getMembershipSnapshot(item: LibraryItem): TraktMembershipSnapshot {
        ensureLoaded()
        if (TraktAuthRepository.isAuthenticated.value) {
            ensureFresh()
        }
        val itemMembership = _uiState.value.membershipByContent[contentKey(item.id, item.type)].orEmpty()
        val map = _uiState.value.listTabs.associate { tab ->
            tab.key to itemMembership.contains(tab.key)
        }
        return TraktMembershipSnapshot(listMembership = map)
    }

    suspend fun toggleWatchlist(item: LibraryItem) {
        ensureLoaded()
        val snapshot = getMembershipSnapshot(item)
        val currentlyInWatchlist = snapshot.listMembership[WATCHLIST_KEY] == true
        val desired = snapshot.listMembership.toMutableMap().apply {
            this[WATCHLIST_KEY] = !currentlyInWatchlist
        }
        applyMembershipChanges(item, TraktMembershipChanges(desiredMembership = desired))
    }

    suspend fun applyMembershipChanges(item: LibraryItem, changes: TraktMembershipChanges) {
        ensureLoaded()
        val headers = TraktAuthRepository.authorizedHeaders() ?: return
        ensureFresh()

        val current = getMembershipSnapshot(item).listMembership
        val desired = changes.desiredMembership
        val keys = (current.keys + desired.keys).distinct()
        val previousState = _uiState.value

        _uiState.value = applyOptimisticMembershipChanges(
            state = previousState,
            item = item,
            desiredMembership = desired,
        )

        try {
            for (key in keys) {
                val before = current[key] == true
                val after = desired[key] == true
                if (before == after) continue

                if (key == WATCHLIST_KEY) {
                    if (after) {
                        addToWatchlist(headers, item)
                    } else {
                        removeFromWatchlist(headers, item)
                    }
                } else {
                    val listId = key.removePrefix(PERSONAL_LIST_PREFIX)
                    if (listId == key || listId.isBlank()) continue
                    if (after) {
                        addToPersonalList(headers, listId, item)
                    } else {
                        removeFromPersonalList(headers, listId, item)
                    }
                }
            }
        } catch (error: Throwable) {
            _uiState.value = previousState
            throw error
        }
    }

    private fun applyOptimisticMembershipChanges(
        state: TraktLibraryUiState,
        item: LibraryItem,
        desiredMembership: Map<String, Boolean>,
    ): TraktLibraryUiState {
        if (state.listTabs.isEmpty()) return state

        val contentKey = contentKey(item.id, item.type)
        val currentMembership = state.membershipByContent[contentKey].orEmpty()
        val updatedEntriesByList = state.entriesByList.toMutableMap()
        val keys = (currentMembership + desiredMembership.keys).distinct()

        keys.forEach { listKey ->
            val before = currentMembership.contains(listKey)
            val after = desiredMembership[listKey] == true
            if (before == after) return@forEach

            if (after) {
                val resolvedItem = resolveOptimisticItem(state, item)
                updatedEntriesByList[listKey] = listOf(resolvedItem) +
                    updatedEntriesByList[listKey].orEmpty().filterNot {
                        contentKey(it.id, it.type) == contentKey
                    }
            } else {
                updatedEntriesByList[listKey] = updatedEntriesByList[listKey].orEmpty().filterNot {
                    contentKey(it.id, it.type) == contentKey
                }
            }
        }

        return rebuildUiState(
            listTabs = state.listTabs,
            entriesByList = updatedEntriesByList,
        )
    }

    private fun resolveOptimisticItem(
        state: TraktLibraryUiState,
        item: LibraryItem,
    ): LibraryItem {
        val existing = state.allItems.firstOrNull {
            contentKey(it.id, it.type) == contentKey(item.id, item.type)
        }
        val base = existing ?: item
        val savedAt = base.savedAtEpochMs.takeIf { it > 0L }
            ?: item.savedAtEpochMs.takeIf { it > 0L }
            ?: TraktPlatformClock.nowEpochMs()

        return base.copy(savedAtEpochMs = savedAt)
    }

    private fun rebuildUiState(
        listTabs: List<TraktListTab>,
        entriesByList: Map<String, List<LibraryItem>>,
    ): TraktLibraryUiState {
        val normalizedEntriesByList = linkedMapOf<String, List<LibraryItem>>()
        listTabs.forEach { tab ->
            normalizedEntriesByList[tab.key] = entriesByList[tab.key].orEmpty()
        }

        val membershipByContent = mutableMapOf<String, MutableSet<String>>()
        normalizedEntriesByList.forEach { (listKey, entries) ->
            entries.forEach { entry ->
                membershipByContent
                    .getOrPut(contentKey(entry.id, entry.type)) { mutableSetOf() }
                    .add(listKey)
            }
        }

        val allItems = normalizedEntriesByList.values
            .flatten()
            .distinctBy { contentKey(it.id, it.type) }
            .sortedByDescending { it.savedAtEpochMs }

        return TraktLibraryUiState(
            listTabs = listTabs,
            entriesByList = normalizedEntriesByList,
            allItems = allItems,
            membershipByContent = membershipByContent.mapValues { it.value.toSet() },
            isLoading = false,
            hasLoaded = true,
            errorMessage = null,
        )
    }

    private suspend fun fetchSnapshot(
        headers: Map<String, String>,
        onPartialState: ((TraktLibraryUiState) -> Unit)? = null,
    ): TraktLibraryUiState = withContext(Dispatchers.Default) {
        val now = TraktPlatformClock.nowEpochMs()
        val cachedTabs = _uiState.value.listTabs
        val allTabs = if (
            cachedTabs.isNotEmpty() &&
            now - lastListTabsRefreshAtMs <= LIST_TABS_CACHE_TTL_MS
        ) {
            cachedTabs
        } else {
            fetchListTabs(headers).also {
                lastListTabsRefreshAtMs = now
            }
        }

        val entriesByList = fetchEntriesByList(
            headers = headers,
            allTabs = allTabs,
            onProgress = onPartialState?.let { emitPartial ->
                { partialEntriesByList ->
                    emitPartial(
                        rebuildUiState(
                            listTabs = allTabs,
                            entriesByList = partialEntriesByList,
                        ),
                    )
                }
            },
        )

        val membershipByContent = mutableMapOf<String, MutableSet<String>>()
        entriesByList.forEach { (listKey, entries) ->
            entries.forEach { entry ->
                membershipByContent
                    .getOrPut(contentKey(entry.id, entry.type)) { mutableSetOf() }
                    .add(listKey)
            }
        }

        val allItems = entriesByList.values
            .flatten()
            .distinctBy { contentKey(it.id, it.type) }
            .sortedByDescending { it.savedAtEpochMs }

        TraktLibraryUiState(
            listTabs = allTabs,
            entriesByList = entriesByList,
            allItems = allItems,
            membershipByContent = membershipByContent.mapValues { it.value.toSet() },
            hasLoaded = true,
        )
    }

    private fun loadSnapshotFromDisk() {
        val payload = TraktLibraryStorage.loadPayload().orEmpty().trim()
        if (payload.isBlank()) return

        val cached = runCatching {
            json.decodeFromString<StoredTraktLibraryPayload>(payload)
        }.onFailure {
            log.w { "Failed to parse cached Trakt library payload: ${it.message}" }
        }.getOrNull() ?: return

        val state = rebuildUiState(
            listTabs = cached.listTabs,
            entriesByList = cached.entriesByList,
        )
        _uiState.value = state.copy(isLoading = false, errorMessage = null, hasLoaded = true)
        hydrateMissingMetadataAsync(_uiState.value)
    }

    private fun persistSnapshot(state: TraktLibraryUiState) {
        val payload = StoredTraktLibraryPayload(
            listTabs = state.listTabs,
            entriesByList = state.entriesByList,
        )
        TraktLibraryStorage.savePayload(json.encodeToString(payload))
    }

    private fun hydrateMissingMetadataAsync(state: TraktLibraryUiState) {
        if (state.entriesByList.isEmpty()) return
        if (state.allItems.none(::shouldHydrateTraktLibraryItem)) return

        hydrationJob?.cancel()
        hydrationJob = scope.launch {
            val hydratedEntriesByList = runCatching {
                hydrateEntriesFromAddonMeta(state.entriesByList)
            }.onFailure { error ->
                if (error is CancellationException) throw error
                log.w { "Background Trakt metadata hydration failed: ${error.message}" }
            }.getOrNull() ?: return@launch

            refreshMutex.withLock {
                val current = _uiState.value
                if (current.entriesByList.isEmpty()) return@withLock

                val mergedEntriesByList = mergeHydratedEntries(
                    currentEntriesByList = current.entriesByList,
                    hydratedEntriesByList = hydratedEntriesByList,
                )
                if (mergedEntriesByList == current.entriesByList) return@withLock

                val rebuilt = rebuildUiState(
                    listTabs = current.listTabs,
                    entriesByList = mergedEntriesByList,
                ).copy(
                    isLoading = current.isLoading,
                    hasLoaded = current.hasLoaded,
                    errorMessage = current.errorMessage,
                )

                _uiState.value = rebuilt
                persistSnapshot(rebuilt)
            }
        }
    }

    private fun mergeHydratedEntries(
        currentEntriesByList: Map<String, List<LibraryItem>>,
        hydratedEntriesByList: Map<String, List<LibraryItem>>,
    ): Map<String, List<LibraryItem>> {
        val hydratedByContentKey = hydratedEntriesByList.values
            .flatten()
            .associateBy { contentKey(it.id, it.type) }

        return currentEntriesByList.mapValues { (_, entries) ->
            entries.map { entry ->
                hydratedByContentKey[contentKey(entry.id, entry.type)] ?: entry
            }
        }
    }

    private suspend fun fetchListTabs(headers: Map<String, String>): List<TraktListTab> {
        val watchlistTabs = listOf(
            TraktListTab(
                key = WATCHLIST_KEY,
                title = getString(Res.string.trakt_watchlist),
                type = TraktListType.WATCHLIST,
            ),
        )
        return watchlistTabs + fetchPersonalLists(headers)
    }

    private suspend fun fetchEntriesByList(
        headers: Map<String, String>,
        allTabs: List<TraktListTab>,
        onProgress: ((Map<String, List<LibraryItem>>) -> Unit)? = null,
    ): Map<String, List<LibraryItem>> = coroutineScope {
        val entriesByList = linkedMapOf<String, List<LibraryItem>>()
        allTabs.forEach { tab ->
            entriesByList[tab.key] = emptyList()
        }
        val listSemaphore = Semaphore(LIST_FETCH_CONCURRENCY)
        val personalTabs = allTabs.filter { it.type == TraktListType.PERSONAL }

        val watchlistDeferred = async {
            listSemaphore.withPermit {
                fetchWatchlistItems(headers)
            }
        }
        val personalEntries = personalTabs.associate { tab ->
            tab.key to async {
                val listId = tab.traktListId?.toString().orEmpty()
                if (listId.isBlank()) {
                    emptyList()
                } else {
                    listSemaphore.withPermit {
                        fetchPersonalListItems(headers, listId)
                    }
                }
            }
        }

        entriesByList[WATCHLIST_KEY] = watchlistDeferred.await()
        onProgress?.invoke(entriesByList.toMap())

        val pendingEntries = personalEntries.toMutableMap()
        while (pendingEntries.isNotEmpty()) {
            val (listKey, listItems) = select<Pair<String, List<LibraryItem>>> {
                pendingEntries.forEach { (key, deferred) ->
                    deferred.onAwait { key to it }
                }
            }
            entriesByList[listKey] = listItems
            pendingEntries.remove(listKey)
            onProgress?.invoke(entriesByList.toMap())
        }

        entriesByList.toMap()
    }

    private suspend fun hydrateEntriesFromAddonMeta(
        entriesByList: Map<String, List<LibraryItem>>,
    ): Map<String, List<LibraryItem>> = coroutineScope {
        if (entriesByList.isEmpty()) return@coroutineScope entriesByList

        val uniqueItems = entriesByList.values
            .flatten()
            .distinctBy { contentKey(it.id, it.type) }
        if (uniqueItems.isEmpty()) return@coroutineScope entriesByList

        val semaphore = Semaphore(METADATA_FETCH_CONCURRENCY)
        val hydratedByKey = uniqueItems
            .map { item ->
                async {
                    semaphore.withPermit {
                        val hydrated = hydrateItemFromAddonMeta(item)
                        contentKey(item.id, item.type) to hydrated
                    }
                }
            }
            .awaitAll()
            .toMap()

        entriesByList.mapValues { (_, entries) ->
            entries.map { entry -> hydratedByKey[contentKey(entry.id, entry.type)] ?: entry }
        }
    }

    private suspend fun hydrateItemFromAddonMeta(item: LibraryItem): LibraryItem {
        if (!shouldHydrateTraktLibraryItem(item)) {
            return item
        }

        val typeCandidates = if (normalizeType(item.type) == "movie") {
            listOf("movie")
        } else {
            listOf("series", "tv")
        }

        val idCandidates = buildList {
            add(item.id)
            if (item.id.startsWith("tmdb:")) {
                add(item.id.substringAfter(':'))
            }
            if (item.id.startsWith("trakt:")) {
                add(item.id.substringAfter(':'))
            }
        }.distinct()

        if (idCandidates.isEmpty()) {
            return item
        }

        for (type in typeCandidates) {
            for (id in idCandidates) {
                val meta = withTimeoutOrNull(METADATA_FETCH_TIMEOUT_MS) {
                    MetaDetailsRepository.fetch(type = type, id = id)
                }
                if (meta == null) continue

                val shouldOverrideName = item.name.isBlank() || item.name == item.id
                return item.copy(
                    name = if (shouldOverrideName) meta.name else item.name,
                    poster = item.poster.orValidImageUrl(meta.poster),
                    banner = item.banner.orValidImageUrl(meta.background),
                    logo = item.logo.orValidImageUrl(meta.logo),
                    description = item.description.orIfBlank(meta.description),
                    releaseInfo = item.releaseInfo.orIfBlank(meta.releaseInfo),
                    imdbRating = item.imdbRating.orIfBlank(meta.imdbRating),
                    genres = if (item.genres.isEmpty()) meta.genres else item.genres,
                )
            }
        }

        return item
    }

    private suspend fun fetchPersonalLists(headers: Map<String, String>): List<TraktListTab> {
        val payload = httpGetTextWithHeaders(
            url = "$BASE_URL/users/me/lists",
            headers = headers,
        )
        val lists = json.decodeFromString<List<TraktListSummaryDto>>(payload)
        return lists.mapNotNull { list ->
            val traktId = list.ids?.trakt ?: return@mapNotNull null
            TraktListTab(
                key = "$PERSONAL_LIST_PREFIX$traktId",
                title = list.name?.ifBlank { null } ?: getString(Res.string.trakt_list_fallback_title, traktId),
                type = TraktListType.PERSONAL,
                traktListId = traktId,
                slug = list.ids.slug,
                description = list.description,
            )
        }
    }

    private suspend fun fetchWatchlistItems(headers: Map<String, String>): List<LibraryItem> {
        val (moviesPayload, showsPayload) = coroutineScope {
            val moviesDeferred = async {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/watchlist/movies?extended=full,images",
                    headers = headers,
                )
            }
            val showsDeferred = async {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/sync/watchlist/shows?extended=full,images",
                    headers = headers,
                )
            }
            moviesDeferred.await() to showsDeferred.await()
        }
        val movieItems = json.decodeFromString<List<TraktListItemDto>>(moviesPayload)
        val showItems = json.decodeFromString<List<TraktListItemDto>>(showsPayload)
        return (movieItems + showItems)
            .mapNotNull(::mapToLibraryItem)
            .sortedByDescending { it.savedAtEpochMs }
    }

    private suspend fun fetchPersonalListItems(
        headers: Map<String, String>,
        listId: String,
    ): List<LibraryItem> {
        val (moviesPayload, showsPayload) = coroutineScope {
            val moviesDeferred = async {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/users/me/lists/$listId/items/movies?extended=full,images",
                    headers = headers,
                )
            }
            val showsDeferred = async {
                httpGetTextWithHeaders(
                    url = "$BASE_URL/users/me/lists/$listId/items/shows?extended=full,images",
                    headers = headers,
                )
            }
            moviesDeferred.await() to showsDeferred.await()
        }

        val movieItems = json.decodeFromString<List<TraktListItemDto>>(moviesPayload)
        val showItems = json.decodeFromString<List<TraktListItemDto>>(showsPayload)
        return (movieItems + showItems)
            .mapNotNull(::mapToLibraryItem)
            .sortedByDescending { it.savedAtEpochMs }
    }

    private suspend fun addToWatchlist(headers: Map<String, String>, item: LibraryItem) {
        val body = buildMutationBody(item) ?: return
        httpPostJsonWithHeaders(
            url = "$BASE_URL/sync/watchlist",
            body = body,
            headers = headers,
        )
    }

    private suspend fun removeFromWatchlist(headers: Map<String, String>, item: LibraryItem) {
        val body = buildMutationBody(item) ?: return
        httpPostJsonWithHeaders(
            url = "$BASE_URL/sync/watchlist/remove",
            body = body,
            headers = headers,
        )
    }

    private suspend fun addToPersonalList(headers: Map<String, String>, listId: String, item: LibraryItem) {
        val body = buildMutationBody(item) ?: return
        httpPostJsonWithHeaders(
            url = "$BASE_URL/users/me/lists/$listId/items",
            body = body,
            headers = headers,
        )
    }

    private suspend fun removeFromPersonalList(headers: Map<String, String>, listId: String, item: LibraryItem) {
        val body = buildMutationBody(item) ?: return
        httpPostJsonWithHeaders(
            url = "$BASE_URL/users/me/lists/$listId/items/remove",
            body = body,
            headers = headers,
        )
    }

    private suspend fun buildMutationBody(item: LibraryItem): String? {
        val type = normalizeType(item.type)
        val ids = resolveIds(item)

        val request = if (type == "movie") {
            TraktListItemsMutationRequestDto(
                movies = listOf(
                    TraktListMovieRequestItemDto(
                        title = item.name,
                        year = extractYear(item.releaseInfo),
                        ids = ids,
                    ),
                ),
            )
        } else {
            TraktListItemsMutationRequestDto(
                shows = listOf(
                    TraktListShowRequestItemDto(
                        title = item.name,
                        year = extractYear(item.releaseInfo),
                        ids = ids,
                    ),
                ),
            )
        }
        return json.encodeToString(request)
    }

    private suspend fun resolveIds(item: LibraryItem): TraktIdsDto? {
        val rawId = item.id.trim()
        val imdb = imdbRegex.find(rawId)?.value
        val tmdbFromId = rawId.removePrefix("tmdb:").toIntOrNull()
        val traktFromId = rawId.removePrefix("trakt:").toIntOrNull()

        val normalizedType = if (normalizeType(item.type) == "movie") "movie" else "tv"
        val resolvedImdb = imdb ?: tmdbFromId?.let { TmdbService.tmdbToImdb(it, normalizedType) }

        if (resolvedImdb.isNullOrBlank() && tmdbFromId == null && traktFromId == null) {
            return null
        }

        return TraktIdsDto(
            imdb = resolvedImdb,
            tmdb = tmdbFromId,
            trakt = traktFromId,
        )
    }

    private fun mapToLibraryItem(item: TraktListItemDto): LibraryItem? {
        val movie = item.movie
        val show = item.show
        val media = movie ?: show ?: return null
        val type = if (movie != null) "movie" else "series"
        val ids = media.ids

        val id = ids?.imdb
            ?: ids?.tmdb?.let { "tmdb:$it" }
            ?: ids?.trakt?.let { "trakt:$it" }
            ?: return null

        val poster = media.images?.poster.firstNonBlankImageUrl()
            ?: media.images?.fanart.firstNonBlankImageUrl()
        val banner = media.images?.banner.firstNonBlankImageUrl()
        val logo = media.images?.logo.firstNonBlankImageUrl()

        val savedAt = item.listedAt
            ?.takeIf { it.isNotBlank() }
            ?.let(TraktPlatformClock::parseIsoDateTimeToEpochMs)
            ?: TraktPlatformClock.nowEpochMs()

        return LibraryItem(
            id = id,
            type = type,
            name = media.title?.ifBlank { id } ?: id,
            poster = poster,
            banner = banner,
            logo = logo,
            description = media.overview,
            releaseInfo = media.year?.toString(),
            imdbRating = media.rating?.toString(),
            genres = media.genres.orEmpty(),
            savedAtEpochMs = savedAt,
        )
    }

    private fun contentKey(itemId: String, itemType: String): String =
        "${normalizeType(itemType)}:${itemId.trim()}"

    private fun normalizeType(type: String): String {
        val normalized = type.trim().lowercase()
        return when (normalized) {
            "movie", "film" -> "movie"
            "tv", "show", "series", "tvshow" -> "series"
            else -> normalized
        }
    }

    private fun extractYear(releaseInfo: String?): Int? {
        if (releaseInfo.isNullOrBlank()) return null
        val yearText = Regex("(19|20)\\d{2}").find(releaseInfo)?.value ?: return null
        return yearText.toIntOrNull()
    }

    private fun String?.orIfBlank(fallback: String?): String? {
        val current = this?.trim().takeUnless { it.isNullOrBlank() }
        if (current != null) return current
        return fallback?.trim().takeUnless { it.isNullOrBlank() }
    }

    private fun String?.orValidImageUrl(fallback: String?): String? {
        val current = this.normalizeImageUrl()
        if (current != null) return current
        return fallback.normalizeImageUrl()
    }

    private fun List<String>?.firstNonBlankImageUrl(): String? {
        return this
            ?.asSequence()
            ?.mapNotNull { it.normalizeImageUrl() }
            ?.firstOrNull()
    }

    private fun String?.normalizeImageUrl(): String? {
        val value = this?.trim().takeUnless { it.isNullOrBlank() } ?: return null
        val normalized = if (value.startsWith("//")) "https:$value" else value
        return normalized.takeIf {
            it.startsWith("https://", ignoreCase = true) ||
                it.startsWith("http://", ignoreCase = true)
        }
    }

    private val imdbRegex = Regex("tt\\d+")
}

@Serializable
private data class StoredTraktLibraryPayload(
    val listTabs: List<TraktListTab> = emptyList(),
    val entriesByList: Map<String, List<LibraryItem>> = emptyMap(),
)

internal fun shouldHydrateTraktLibraryItem(item: LibraryItem): Boolean {
    val missingDisplayName = item.name.isBlank() || item.name == item.id
    return missingDisplayName || item.poster.isNullOrBlank() || item.releaseInfo.isNullOrBlank()
}

@Serializable
private data class TraktListSummaryDto(
    val name: String? = null,
    val description: String? = null,
    val ids: TraktListIdsDto? = null,
)

@Serializable
private data class TraktListIdsDto(
    val trakt: Long? = null,
    val slug: String? = null,
)

@Serializable
private data class TraktListItemDto(
    @SerialName("listed_at") val listedAt: String? = null,
    val movie: TraktMediaDto? = null,
    val show: TraktMediaDto? = null,
)

@Serializable
private data class TraktMediaDto(
    val title: String? = null,
    val year: Int? = null,
    val ids: TraktIdsDto? = null,
    val overview: String? = null,
    val rating: Double? = null,
    val genres: List<String>? = null,
    val images: TraktImagesDto? = null,
)

@Serializable
private data class TraktImagesDto(
    val fanart: List<String>? = null,
    val poster: List<String>? = null,
    val logo: List<String>? = null,
    val banner: List<String>? = null,
)

@Serializable
private data class TraktIdsDto(
    val trakt: Int? = null,
    val imdb: String? = null,
    val tmdb: Int? = null,
)

@Serializable
private data class TraktListItemsMutationRequestDto(
    val movies: List<TraktListMovieRequestItemDto>? = null,
    val shows: List<TraktListShowRequestItemDto>? = null,
)

@Serializable
private data class TraktListMovieRequestItemDto(
    val title: String? = null,
    val year: Int? = null,
    val ids: TraktIdsDto? = null,
)

@Serializable
private data class TraktListShowRequestItemDto(
    val title: String? = null,
    val year: Int? = null,
    val ids: TraktIdsDto? = null,
)
