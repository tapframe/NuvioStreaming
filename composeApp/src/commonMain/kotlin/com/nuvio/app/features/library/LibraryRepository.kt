package com.nuvio.app.features.library

import co.touchlab.kermit.Logger
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktLibraryRepository
import com.nuvio.app.features.trakt.TraktMembershipChanges
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.library_other
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
    @SerialName("added_at") val addedAt: Long = 0,
)

object LibraryRepository {
    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("LibraryRepository")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(LibraryUiState())
    val uiState: StateFlow<LibraryUiState> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var currentProfileId: Int = 1
    private var itemsById: MutableMap<String, LibraryItem> = mutableMapOf()

    init {
        syncScope.launch {
            TraktAuthRepository.isAuthenticated.collectLatest { authenticated ->
                if (authenticated) {
                    TraktLibraryRepository.preloadListTabsAsync()
                    runCatching { TraktLibraryRepository.refreshNow() }
                        .onFailure { log.e(it) { "Failed to refresh Trakt library after auth change" } }
                }
                publish()
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
        TraktLibraryRepository.ensureLoaded()
        if (hasLoaded) return
        loadFromDisk(ProfileRepository.activeProfileId)
        if (TraktAuthRepository.isAuthenticated.value) {
            TraktLibraryRepository.preloadListTabsAsync()
            refreshTraktLibraryAsync()
        }
    }

    fun onProfileChanged(profileId: Int) {
        if (profileId == currentProfileId && hasLoaded) return
        loadFromDisk(profileId)
        TraktAuthRepository.onProfileChanged()
        TraktLibraryRepository.onProfileChanged()
        if (TraktAuthRepository.isAuthenticated.value) {
            TraktLibraryRepository.preloadListTabsAsync()
            refreshTraktLibraryAsync()
        }
    }

    fun clearLocalState() {
        hasLoaded = false
        currentProfileId = 1
        itemsById.clear()
        TraktAuthRepository.clearLocalState()
        TraktLibraryRepository.clearLocalState()
        _uiState.value = LibraryUiState()
    }

    private fun loadFromDisk(profileId: Int) {
        currentProfileId = profileId
        hasLoaded = true
        itemsById.clear()

        val payload = LibraryStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isNotEmpty()) {
            val items = runCatching {
                json.decodeFromString<StoredLibraryPayload>(payload).items
            }.getOrDefault(emptyList())
            itemsById = items.associateBy { it.id }.toMutableMap()
        }

        publish()
    }

    suspend fun pullFromServer(profileId: Int) {
        currentProfileId = profileId

        if (TraktAuthRepository.isAuthenticated.value) {
            runCatching { TraktLibraryRepository.refreshNow() }
                .onFailure { e -> log.e(e) { "Failed to pull Trakt library" } }
            publish()
            return
        }

        runCatching {
            val params = buildJsonObject {
                put("p_profile_id", profileId)
                put("p_limit", 500)
                put("p_offset", 0)
            }
            val result = SupabaseProvider.client.postgrest.rpc("sync_pull_library", params)
            val serverItems = result.decodeList<LibrarySyncItem>()
            itemsById = serverItems.map { it.toLibraryItem() }.associateBy { it.id }.toMutableMap()
            hasLoaded = true
            publish()
            persist()
        }.onFailure { e ->
            log.e(e) { "Failed to pull library from server" }
        }
    }

    fun toggleSaved(item: LibraryItem) {
        ensureLoaded()

        if (TraktAuthRepository.isAuthenticated.value) {
            syncScope.launch {
                runCatching { TraktLibraryRepository.toggleWatchlist(item) }
                    .onFailure { e -> log.e(e) { "Failed to toggle Trakt watchlist" } }
                publish()
            }
            return
        }

        if (itemsById.containsKey(item.id)) {
            remove(item.id)
        } else {
            save(item)
        }
    }

    fun save(item: LibraryItem) {
        ensureLoaded()
        if (TraktAuthRepository.isAuthenticated.value) return
        itemsById[item.id] = item.copy(savedAtEpochMs = LibraryClock.nowEpochMs())
        publish()
        persist()
        pushToServer()
    }

    fun remove(id: String) {
        ensureLoaded()
        if (TraktAuthRepository.isAuthenticated.value) return
        if (itemsById.remove(id) != null) {
            publish()
            persist()
            pushToServer()
        }
    }

    fun isSaved(id: String, type: String? = null): Boolean {
        ensureLoaded()

        if (TraktAuthRepository.isAuthenticated.value) {
            if (type != null) {
                return TraktLibraryRepository.isInAnyList(id, type)
            }
            val entry = TraktLibraryRepository.uiState.value.allItems.firstOrNull { it.id == id }
            if (entry != null) {
                return TraktLibraryRepository.isInAnyList(entry.id, entry.type)
            }
            return false
        }

        return itemsById.containsKey(id)
    }

    fun savedItem(id: String): LibraryItem? {
        ensureLoaded()

        if (TraktAuthRepository.isAuthenticated.value) {
            return TraktLibraryRepository.uiState.value.allItems.firstOrNull { it.id == id }
        }

        return itemsById[id]
    }

    fun traktListTabs() = TraktLibraryRepository.currentListTabs()

    suspend fun getMembershipSnapshot(item: LibraryItem): Map<String, Boolean> {
        ensureLoaded()
        if (TraktAuthRepository.isAuthenticated.value) {
            return TraktLibraryRepository.getMembershipSnapshot(item).listMembership
        }
        val inLocal = itemsById.containsKey(item.id)
        return mapOf(LOCAL_LIST_KEY to inLocal)
    }

    suspend fun applyMembershipChanges(item: LibraryItem, desiredMembership: Map<String, Boolean>) {
        ensureLoaded()
        if (TraktAuthRepository.isAuthenticated.value) {
            TraktLibraryRepository.applyMembershipChanges(
                item = item,
                changes = TraktMembershipChanges(desiredMembership = desiredMembership),
            )
            publish()
            return
        }

        val shouldBeSaved = desiredMembership.values.any { it }
        if (shouldBeSaved) {
            save(item)
        } else {
            remove(item.id)
        }
    }

    private fun pushToServer() {
        syncScope.launch {
            if (TraktAuthRepository.isAuthenticated.value) return@launch
            runCatching {
                val profileId = ProfileRepository.activeProfileId
                val syncItems = itemsById.values.map { it.toSyncItem() }
                val params = buildJsonObject {
                    put("p_profile_id", profileId)
                    put("p_items", json.encodeToJsonElement(syncItems))
                }
                SupabaseProvider.client.postgrest.rpc("sync_push_library", params)
            }.onFailure { e ->
                log.e(e) { "Failed to push library to server" }
            }
        }
    }

    private fun publish() {
        if (TraktAuthRepository.isAuthenticated.value) {
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

            _uiState.value = LibraryUiState(
                sourceMode = LibrarySourceMode.TRAKT,
                items = traktState.allItems,
                sections = sections,
                isLoaded = traktState.hasLoaded,
                isLoading = traktState.isLoading,
                errorMessage = traktState.errorMessage,
            )
            return
        }

        val items = itemsById.values
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

        _uiState.value = LibraryUiState(
            sourceMode = LibrarySourceMode.LOCAL,
            items = items,
            sections = sections,
            isLoaded = true,
            isLoading = false,
            errorMessage = null,
        )
    }

    private fun persist() {
        LibraryStorage.savePayload(
            currentProfileId,
            json.encodeToString(
                StoredLibraryPayload(
                    items = itemsById.values.sortedByDescending { it.savedAtEpochMs },
                ),
            ),
        )
    }

    private fun refreshTraktLibraryAsync() {
        syncScope.launch {
            runCatching { TraktLibraryRepository.refreshNow() }
                .onFailure { e -> log.e(e) { "Failed to refresh Trakt library" } }
            publish()
        }
    }
}

private const val LOCAL_LIST_KEY = "local"

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
    savedAtEpochMs = addedAt,
)

private fun LibraryItem.toSyncItem(): LibrarySyncItem = LibrarySyncItem(
    contentId = id,
    contentType = type,
    name = name,
    poster = poster,
    background = banner,
    description = description,
    releaseInfo = releaseInfo,
    imdbRating = imdbRating?.toFloatOrNull(),
    genres = genres,
    addedAt = savedAtEpochMs,
)

internal fun String.toLibraryDisplayTitle(): String {
    val normalized = trim()
    if (normalized.isBlank()) return runBlocking { getString(Res.string.library_other) }

    return normalized
        .split('-', '_', ' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { token ->
            token.lowercase().replaceFirstChar { char -> char.uppercase() }
        }
        .ifBlank { runBlocking { getString(Res.string.library_other) } }
}
