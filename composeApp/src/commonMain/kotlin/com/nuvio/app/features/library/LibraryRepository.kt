package com.nuvio.app.features.library

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.ui.NuvioToastController
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.home.PosterShape
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktLibraryRepository
import com.nuvio.app.features.trakt.TraktListTab
import com.nuvio.app.features.trakt.TraktListType
import com.nuvio.app.features.trakt.TraktMembershipChanges
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.effectiveLibrarySourceMode as resolveEffectiveLibrarySourceMode
import com.nuvio.app.features.trakt.shouldUseTraktLibrary
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.library_local_tab_title
import nuvio.composeapp.generated.resources.library_other
import nuvio.composeapp.generated.resources.trakt_lists_update_failed
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.getString

@Serializable
private data class StoredLibraryPayload(
    val items: List<LibraryItem> = emptyList(),
)

@Serializable
private data class LibrarySyncItem(
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
    val name: String = "",
    val poster: String? = null,
    @SerialName("poster_shape") val posterShape: String = "POSTER",
    val background: String? = null,
    val description: String? = null,
    @SerialName("release_info") val releaseInfo: String? = null,
    @SerialName("imdb_rating") val imdbRating: Float? = null,
    val genres: List<String> = emptyList(),
    @SerialName("addon_base_url") val addonBaseUrl: String? = null,
    @SerialName("added_at") val addedAt: Long = 0,
)

object LibraryRepository {
    private const val PULL_PAGE_SIZE = 500

    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("LibraryRepository")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(LibraryUiState())
    val uiState: StateFlow<LibraryUiState> = _uiState.asStateFlow()

    private val localState = LibraryLocalState()
    private val loadLock = SynchronizedObject()
    private val nuvioPullMutex = Mutex()
    private val persistenceLock = SynchronizedObject()
    private val lastPersistedContentRevisionByProfile = mutableMapOf<Int, Long>()

    init {
        syncScope.launch {
            TraktAuthRepository.isAuthenticated.collectLatest { authenticated ->
                if (authenticated) {
                    TraktLibraryRepository.preloadListTabsAsync()
                    if (shouldUseTraktLibrary(authenticated, selectedLibrarySourceMode())) {
                        runCatching { TraktLibraryRepository.refreshNow() }
                            .onFailure { log.e(it) { "Failed to refresh Trakt library after auth change" } }
                    }
                }
                publish()
            }
        }
        syncScope.launch {
            TraktSettingsRepository.uiState
                .map { it.librarySourceMode }
                .distinctUntilChanged()
                .collectLatest { source ->
                    if (shouldUseTraktLibrary(TraktAuthRepository.isAuthenticated.value, source)) {
                        TraktLibraryRepository.preloadListTabsAsync()
                        publish()
                        refreshTraktLibraryAsync()
                    } else {
                        publish()
                    }
                }
        }
        syncScope.launch {
            TraktLibraryRepository.uiState.collectLatest {
                if (TraktAuthRepository.isAuthenticated.value) {
                    publish()
                }
            }
        }
    }

    fun ensureLoaded() {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
        TraktLibraryRepository.ensureLoaded()
        while (true) {
            val activeProfileId = ProfileRepository.activeProfileId
            val snapshot = localState.snapshot()
            if (snapshot.hasLoaded && snapshot.token.profileId == activeProfileId) break
            loadFromDisk(activeProfileId)
        }
        if (TraktAuthRepository.isAuthenticated.value) {
            TraktLibraryRepository.preloadListTabsAsync()
            if (isTraktLibrarySourceActive()) {
                refreshTraktLibraryAsync()
            }
        }
    }

    fun onProfileChanged(profileId: Int) {
        val current = localState.snapshot()
        if (profileId == current.token.profileId && current.hasLoaded) return

        TraktSettingsRepository.onProfileChanged()
        if (!loadFromDisk(profileId)) return
        TraktAuthRepository.onProfileChanged()
        TraktLibraryRepository.onProfileChanged()
        if (TraktAuthRepository.isAuthenticated.value) {
            TraktLibraryRepository.preloadListTabsAsync()
            if (isTraktLibrarySourceActive()) {
                refreshTraktLibraryAsync()
            }
        }
    }

    fun clearLocalState() {
        val transition = synchronized(loadLock) { localState.reset() }
        transition.detachedPushJob?.cancel()
        TraktAuthRepository.clearLocalState()
        TraktLibraryRepository.clearLocalState()
        _uiState.value = LibraryUiState()
    }

    internal fun runAccountStorageWipe(wipeStorage: () -> Unit) {
        synchronized(loadLock) {
            val transition = localState.reset()
            transition.detachedPushJob?.cancel()
            synchronized(persistenceLock) {
                try {
                    wipeStorage()
                } finally {
                    lastPersistedContentRevisionByProfile.clear()
                }
            }
        }
    }

    private fun loadFromDisk(profileId: Int): Boolean {
        var shouldPublish = false
        val loaded = synchronized(loadLock) {
            if (ProfileRepository.activeProfileId != profileId) return@synchronized false
            val current = localState.snapshot()
            if (current.hasLoaded && current.token.profileId == profileId) {
                return@synchronized true
            }

            val transition = localState.beginProfileLoad(profileId)
            transition.detachedPushJob?.cancel()
            shouldPublish = completeLoadFromDisk(transition.snapshot.token)
            shouldPublish
        }
        if (shouldPublish) publish()
        return loaded
    }

    private fun completeLoadFromDisk(token: LibraryProfileToken): Boolean {
        val payload = LibraryStorage.loadPayload(token.profileId).orEmpty().trim()
        val items = if (payload.isNotEmpty()) {
            runCatching {
                json.decodeFromString<StoredLibraryPayload>(payload).items
            }.getOrDefault(emptyList())
        } else {
            emptyList()
        }

        return localState.completeProfileLoad(
            token = token,
            activeProfileId = ProfileRepository.activeProfileId,
            items = items,
        ) != null
    }

    suspend fun pullFromServer(profileId: Int) {
        val operationToken = activeOperationToken(profileId) ?: run {
            log.d { "Skipping library pull for inactive profile $profileId" }
            return
        }

        if (isTraktLibrarySourceActive()) {
            try {
                TraktLibraryRepository.refreshNow()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.e(error) { "Failed to pull Trakt library" }
            }
            if (!isActiveOperation(operationToken)) return
            publish()
            return
        }

        nuvioPullMutex.withLock {
            val serializedToken = activeOperationToken(profileId) ?: return@withLock
            if (localState.markPullStarted(serializedToken) == null) return@withLock

            var completedSuccessfully = false
            var appliedItems = false
            try {
                val serverItems = pullAllLibrarySyncItems(profileId).map { it.toLibraryItem() }
                val applyResult = localState.applyServerItems(serializedToken, serverItems)
                    ?: return@withLock
                completedSuccessfully = true
                appliedItems = true
                if (applyResult.preservedLocalItems) {
                    log.w {
                        "Remote library is empty while local has ${applyResult.snapshot.items.size} entries; " +
                            "preserving local library"
                    }
                } else {
                    persist(applyResult.snapshot)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.e(error) { "Failed to pull library from server" }
            } finally {
                localState.finishPull(
                    token = serializedToken,
                    completedSuccessfully = completedSuccessfully,
                )
            }

            if (appliedItems) publish()
        }
    }

    private fun activeOperationToken(profileId: Int): LibraryProfileToken? {
        if (ProfileRepository.activeProfileId != profileId) return null
        if (!loadFromDisk(profileId)) return null
        return localState.currentTokenIfLoaded(profileId)
            ?.takeIf { ProfileRepository.activeProfileId == profileId }
    }

    private fun isActiveOperation(token: LibraryProfileToken): Boolean =
        localState.isCurrent(token) && ProfileRepository.activeProfileId == token.profileId

    fun toggleSaved(item: LibraryItem) {
        ensureLoaded()

        if (isTraktLibrarySourceActive()) {
            val profileId = localState.snapshot().token.profileId
            log.i { "toggleSaved routed to Trakt library source item=${item.id} type=${item.type} profile=$profileId" }
            syncScope.launch {
                runCatching { TraktLibraryRepository.toggleWatchlist(item) }
                    .onFailure { e ->
                        log.e(e) { "Failed to toggle Trakt watchlist" }
                        NuvioToastController.show(
                            e.message?.takeIf { it.isNotBlank() }
                                ?: getString(Res.string.trakt_lists_update_failed),
                        )
                    }
                publish()
            }
            return
        }

        val result = localState.toggle(
            item.copy(savedAtEpochMs = LibraryClock.nowEpochMs()),
        )
        if (result.isSaved) {
            log.i {
                "Saving local library item item=${item.id} type=${item.type} " +
                    "profile=${result.snapshot.token.profileId}"
            }
        } else {
            log.i {
                "Removing local library item id=${item.id} type=${item.type} " +
                    "profile=${result.snapshot.token.profileId}"
            }
        }
        persist(result.snapshot)
        publish()
        pushToServer(result.snapshot)
    }

    fun save(item: LibraryItem) {
        ensureLoaded()
        val snapshot = localState.upsert(item.copy(savedAtEpochMs = LibraryClock.nowEpochMs()))
        log.i {
            "Saving local library item item=${item.id} type=${item.type} profile=${snapshot.token.profileId}"
        }
        persist(snapshot)
        publish()
        pushToServer(snapshot)
    }

    fun remove(id: String) {
        ensureLoaded()
        val result = localState.removeById(id)
        if (result.affectedCount > 0) {
            log.i {
                "Removing local library item id=$id profile=${result.snapshot.token.profileId} " +
                    "removed=${result.affectedCount}"
            }
            persist(result.snapshot)
            publish()
            pushToServer(result.snapshot)
        }
    }

    private fun remove(id: String, type: String) {
        ensureLoaded()
        val result = localState.remove(id, type)
        if (result.affectedCount > 0) {
            log.i {
                "Removing local library item id=$id type=$type profile=${result.snapshot.token.profileId}"
            }
            persist(result.snapshot)
            publish()
            pushToServer(result.snapshot)
        }
    }

    fun isSaved(id: String, type: String? = null): Boolean {
        ensureLoaded()

        if (isTraktLibrarySourceActive()) {
            if (type != null) {
                return TraktLibraryRepository.isInAnyList(id, type)
            }
            val entry = TraktLibraryRepository.uiState.value.allItems.firstOrNull { it.id == id }
            if (entry != null) {
                return TraktLibraryRepository.isInAnyList(entry.id, entry.type)
            }
            return false
        }

        return if (type != null) {
            localState.contains(id, type)
        } else {
            localState.containsId(id)
        }
    }

    fun savedItem(id: String): LibraryItem? {
        ensureLoaded()

        if (isTraktLibrarySourceActive()) {
            return TraktLibraryRepository.uiState.value.allItems.firstOrNull { it.id == id }
        }

        return localState.findById(id)
    }

    fun libraryListTabs(): List<TraktListTab> {
        val traktTabs = if (TraktAuthRepository.isAuthenticated.value) {
            TraktLibraryRepository.currentListTabs()
        } else {
            emptyList()
        }
        return libraryTabsWithLocal(traktTabs)
    }

    fun traktListTabs(): List<TraktListTab> = libraryListTabs()

    suspend fun getMembershipSnapshot(item: LibraryItem): Map<String, Boolean> {
        ensureLoaded()
        val inLocal = localState.contains(item.id, item.type)
        if (TraktAuthRepository.isAuthenticated.value) {
            val traktMembership = TraktLibraryRepository.getMembershipSnapshot(item).listMembership
            return libraryMembershipWithLocal(
                inLocal = inLocal,
                traktMembership = traktMembership,
            )
        }
        return libraryMembershipWithLocal(inLocal = inLocal)
    }

    suspend fun applyMembershipChanges(item: LibraryItem, desiredMembership: Map<String, Boolean>) {
        ensureLoaded()
        val localDesired = desiredMembership[LOCAL_LIBRARY_LIST_KEY] == true
        val currentlyInLocal = localState.contains(item.id, item.type)
        val profileId = localState.snapshot().token.profileId
        log.i {
            "Applying library membership item=${item.id} type=${item.type} profile=$profileId " +
                "localDesired=$localDesired currentlyInLocal=$currentlyInLocal " +
                "traktAuthenticated=${TraktAuthRepository.isAuthenticated.value}"
        }
        if (localDesired != currentlyInLocal) {
            if (localDesired) {
                save(item)
            } else {
                remove(item.id, item.type)
            }
        }

        if (TraktAuthRepository.isAuthenticated.value) {
            val traktMembership = desiredMembership.filterKeys { it != LOCAL_LIBRARY_LIST_KEY }
            if (traktMembership.isNotEmpty()) {
                TraktLibraryRepository.applyMembershipChanges(
                    item = item,
                    changes = TraktMembershipChanges(desiredMembership = traktMembership),
                )
            }
            publish()
        } else {
            publish()
        }
    }

    suspend fun removeFromList(item: LibraryItem, listKey: String) {
        val desiredMembership = libraryMembershipWithRemovedList(
            currentMembership = getMembershipSnapshot(item),
            listKey = listKey,
        )
        applyMembershipChanges(item, desiredMembership)
    }

    private fun pushToServer(snapshot: LibraryLocalSnapshot) {
        val authState = AuthRepository.state.value
        val profileId = snapshot.token.profileId
        val itemCount = snapshot.items.size
        if (authState !is AuthState.Authenticated) {
            log.w { "Skipping library push: auth state is ${authState::class.simpleName} profile=$profileId" }
            return
        }
        if (authState.isAnonymous) {
            log.w { "Skipping library push: anonymous auth user=${authState.userId} profile=$profileId" }
            return
        }
        if (snapshot.isPullingNuvioSyncFromServer) {
            log.i { "Skipping library push: server pull is active profile=$profileId localItems=$itemCount" }
            return
        }
        if (!snapshot.hasCompletedInitialNuvioSyncPull) {
            log.w { "Skipping library push: initial Nuvio sync pull not completed profile=$profileId localItems=$itemCount" }
            return
        }

        val pushJob = syncScope.launch(start = CoroutineStart.LAZY) {
            delay(500)
            if (!localState.isCurrent(snapshot)) {
                val current = localState.snapshot()
                log.w {
                    "Skipping stale debounced library push: scheduled=${snapshot.token} " +
                        "current=${current.token} scheduledRevision=${snapshot.revision} " +
                        "currentRevision=${current.revision}"
                }
                return@launch
            }
            runCatching {
                val syncItems = snapshot.items.map { it.toSyncItem() }
                if (syncItems.isEmpty()) {
                    log.w { "Skipping library push: sync payload is empty profile=$profileId" }
                    return@runCatching false
                }
                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                    put("p_items", json.encodeToJsonElement(syncItems))
                    putSyncOriginClientId()
                }
                log.i { "Pushing library to server profile=$profileId itemCount=${syncItems.size}" }
                SupabaseProvider.client.postgrest.rpc("sync_push_library", params)
                true
            }.onSuccess { pushed ->
                if (pushed) {
                    log.i { "Library push completed profile=$profileId itemCount=$itemCount" }
                }
            }.onFailure { e ->
                if (e is CancellationException) throw e
                log.e(e) { "Failed to push library to server profile=$profileId itemCount=$itemCount" }
            }
        }
        pushJob.invokeOnCompletion { localState.clearPushJob(pushJob) }

        val installResult = localState.installPushJob(snapshot, pushJob)
        if (!installResult.installed) {
            pushJob.cancel()
            return
        }
        installResult.detachedPushJob?.cancel()
        pushJob.start()
    }

    private suspend fun pullAllLibrarySyncItems(profileId: Int): List<LibrarySyncItem> {
        val allItems = mutableListOf<LibrarySyncItem>()
        var offset = 0

        while (true) {
            val params = buildJsonObject {
                put("p_profile_id", profileId)
                put("p_limit", PULL_PAGE_SIZE)
                put("p_offset", offset)
            }
            val result = SupabaseProvider.client.postgrest.rpc("sync_pull_library", params)
            val page = result.decodeList<LibrarySyncItem>()
            allItems.addAll(page)

            if (page.size < PULL_PAGE_SIZE) break
            offset += PULL_PAGE_SIZE
        }

        return allItems
    }

    private fun publish() {
        val localSnapshot = localState.snapshot()
        if (isTraktLibrarySourceActive()) {
            val traktState = TraktLibraryRepository.uiState.value
            val sections = traktState.listTabs.mapNotNull { tab ->
                val listItems = traktState.entriesByList[tab.key].orEmpty()
                if (listItems.isEmpty()) {
                    null
                } else {
                    LibrarySection(
                        type = tab.key,
                        displayTitle = tab.title,
                        items = listItems,
                    )
                }
            }

            val newUiState = LibraryUiState(
                sourceMode = LibrarySourceMode.TRAKT,
                items = traktState.allItems,
                sections = sections,
                isLoaded = traktState.hasLoaded,
                isLoading = traktState.isLoading,
                errorMessage = traktState.errorMessage,
            )
            localState.runIfTokenCurrent(localSnapshot.token) {
                _uiState.value = newUiState
            }
            return
        }

        val items = localSnapshot.items
            .sortedByDescending { it.savedAtEpochMs }
        val sections = items
            .groupBy { it.type }
            .map { (type, typeItems) ->
                LibrarySection(
                    type = type,
                    displayTitle = type.toLibraryDisplayTitle(),
                    items = typeItems.sortedByDescending { it.savedAtEpochMs },
                )
            }
            .sortedBy { it.displayTitle }

        val newUiState = LibraryUiState(
            sourceMode = LibrarySourceMode.LOCAL,
            items = items,
            sections = sections,
            isLoaded = localSnapshot.hasLoaded,
            isLoading = localSnapshot.isLoading,
            errorMessage = null,
        )
        localState.runIfCurrent(localSnapshot) {
            _uiState.value = newUiState
        }
    }

    private fun persist(snapshot: LibraryLocalSnapshot) {
        val payload = json.encodeToString(
            StoredLibraryPayload(
                items = snapshot.items.sortedByDescending { it.savedAtEpochMs },
            ),
        )
        synchronized(persistenceLock) {
            val profileId = snapshot.token.profileId
            val lastPersistedRevision = lastPersistedContentRevisionByProfile[profileId] ?: Long.MIN_VALUE
            if (snapshot.contentRevision <= lastPersistedRevision) return@synchronized
            localState.runIfContentCurrent(snapshot) {
                LibraryStorage.savePayload(profileId, payload)
                lastPersistedContentRevisionByProfile[profileId] = snapshot.contentRevision
            }
        }
    }

    private fun refreshTraktLibraryAsync() {
        syncScope.launch {
            runCatching { TraktLibraryRepository.refreshNow() }
                .onFailure { e -> log.e(e) { "Failed to refresh Trakt library" } }
            publish()
        }
    }

    private fun selectedLibrarySourceMode(): LibrarySourceMode {
        TraktSettingsRepository.ensureLoaded()
        return TraktSettingsRepository.uiState.value.librarySourceMode
    }

    private fun effectiveLibrarySourceMode(): LibrarySourceMode =
        resolveEffectiveLibrarySourceMode(
            isAuthenticated = TraktAuthRepository.isAuthenticated.value,
            source = selectedLibrarySourceMode(),
        )

    private fun isTraktLibrarySourceActive(): Boolean =
        effectiveLibrarySourceMode() == LibrarySourceMode.TRAKT
}

internal const val LOCAL_LIBRARY_LIST_KEY = "local"
private const val DEFAULT_LOCAL_LIBRARY_TAB_TITLE = "Nuvio Library"
private const val DEFAULT_LIBRARY_OTHER_TITLE = "Other"

internal fun localLibraryListTab(): TraktListTab =
    TraktListTab(
        key = LOCAL_LIBRARY_LIST_KEY,
        title = localizedStringOrDefault(
            resource = Res.string.library_local_tab_title,
            fallback = DEFAULT_LOCAL_LIBRARY_TAB_TITLE,
        ),
        type = TraktListType.WATCHLIST,
    )

internal fun libraryTabsWithLocal(traktTabs: List<TraktListTab>): List<TraktListTab> =
    listOf(localLibraryListTab()) + traktTabs

internal fun libraryMembershipWithLocal(
    inLocal: Boolean,
    traktMembership: Map<String, Boolean> = emptyMap(),
): Map<String, Boolean> =
    linkedMapOf<String, Boolean>(LOCAL_LIBRARY_LIST_KEY to inLocal).apply {
        putAll(traktMembership)
    }

internal fun libraryMembershipWithRemovedList(
    currentMembership: Map<String, Boolean>,
    listKey: String,
): Map<String, Boolean> =
    currentMembership.toMutableMap().apply {
        this[listKey] = false
    }

private fun LibrarySyncItem.toLibraryItem(): LibraryItem = LibraryItem(
    id = contentId,
    type = contentType,
    name = name,
    poster = poster,
    banner = background,
    description = description,
    releaseInfo = releaseInfo,
    imdbRating = imdbRating?.toString(),
    genres = genres,
    posterShape = posterShape.toPosterShape(),
    addonBaseUrl = addonBaseUrl,
    savedAtEpochMs = addedAt,
)

private fun LibraryItem.toSyncItem(): LibrarySyncItem = LibrarySyncItem(
    contentId = id,
    contentType = type,
    name = name,
    poster = poster,
    posterShape = posterShape.toSyncName(),
    background = banner,
    description = description,
    releaseInfo = releaseInfo,
    imdbRating = imdbRating?.toFloatOrNull(),
    genres = genres,
    addonBaseUrl = addonBaseUrl,
    addedAt = savedAtEpochMs,
)

private fun String.toPosterShape(): PosterShape =
    when (trim().uppercase()) {
        "LANDSCAPE" -> PosterShape.Landscape
        "SQUARE" -> PosterShape.Square
        else -> PosterShape.Poster
    }

private fun PosterShape.toSyncName(): String =
    when (this) {
        PosterShape.Poster -> "POSTER"
        PosterShape.Square -> "SQUARE"
        PosterShape.Landscape -> "LANDSCAPE"
    }

internal fun String.toLibraryDisplayTitle(): String {
    val normalized = trim()
    if (normalized.isBlank()) return localizedLibraryOtherTitle()

    return normalized
        .split('-', '_', ' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { token ->
            token.lowercase().replaceFirstChar { char -> char.uppercase() }
        }
        .ifBlank { localizedLibraryOtherTitle() }
}

private fun localizedLibraryOtherTitle(): String =
    localizedStringOrDefault(
        resource = Res.string.library_other,
        fallback = DEFAULT_LIBRARY_OTHER_TITLE,
    )

private fun localizedStringOrDefault(resource: StringResource, fallback: String): String =
    runCatching { runBlocking { getString(resource) } }
        .getOrDefault(fallback)
