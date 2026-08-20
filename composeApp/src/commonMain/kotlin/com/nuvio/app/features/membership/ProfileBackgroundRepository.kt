package com.nuvio.app.features.membership

import co.touchlab.kermit.Logger
import com.nuvio.app.core.network.SupabaseProvider
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

private const val ProfileBackgroundBucket = "membership-profile-backgrounds"

data class ProfileBackgroundCatalogItem(
    val id: String,
    val displayName: String,
    val landscapeImageBytes: ByteArray? = null,
    val portraitImageBytes: ByteArray? = null,
    val assetVersion: Int,
)

object ProfileBackgroundRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("ProfileBackgroundRepository")
    private val _catalog = MutableStateFlow<List<ProfileBackgroundCatalogItem>>(emptyList())
    val catalog: StateFlow<List<ProfileBackgroundCatalogItem>> = _catalog.asStateFlow()
    private var loadJob: Job? = null
    private var assetLoadJob: Job? = null
    private var remoteCatalog = emptyList<SupabaseProfileBackgroundCatalogItem>()
    private var loaded = false

    fun ensureLoaded() {
        if (loaded || loadJob?.isActive == true) return
        loadJob = scope.launch {
            try {
                remoteCatalog = SupabaseProvider.client.postgrest
                    .rpc("get_member_profile_background_catalog")
                    .decodeList()
                _catalog.value = remoteCatalog.map { item ->
                    ProfileBackgroundCatalogItem(
                        id = item.id,
                        displayName = item.displayName,
                        assetVersion = item.assetVersion,
                    )
                }
                loaded = true
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                log.w(error) { "Unable to load supporter profile backgrounds" }
            }
        }
    }

    fun loadSelectedAndPreload(id: String, portrait: Boolean) {
        ensureLoaded()
        assetLoadJob?.cancel()
        assetLoadJob = scope.launch {
            loadJob?.join()
            val selected = remoteCatalog.firstOrNull { it.id == id } ?: return@launch
            loadAndPublish(selected, portrait)
            coroutineScope {
                remoteCatalog
                    .filterNot { it.id == id }
                    .map { item -> launch { loadAndPublish(item, portrait) } }
                    .joinAll()
            }
        }
    }

    fun preloadLandscapeImages() {
        ensureLoaded()
        assetLoadJob?.cancel()
        assetLoadJob = scope.launch {
            loadJob?.join()
            coroutineScope {
                remoteCatalog.map { item -> launch { loadAndPublish(item, portrait = false) } }.joinAll()
            }
        }
    }

    fun invalidate() {
        loaded = false
        loadJob?.cancel()
        loadJob = null
        assetLoadJob?.cancel()
        assetLoadJob = null
        remoteCatalog = emptyList()
        _catalog.value = emptyList()
    }

    private suspend fun loadAndPublish(item: SupabaseProfileBackgroundCatalogItem, portrait: Boolean) {
        try {
            val bytes = if (portrait) loadPortraitImage(item) else loadLandscapeImage(item)
            _catalog.update { catalog ->
                catalog.map { background ->
                    if (background.id != item.id) {
                        background
                    } else if (portrait) {
                        background.copy(portraitImageBytes = bytes)
                    } else {
                        background.copy(landscapeImageBytes = bytes)
                    }
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            log.w(error) { "Unable to load supporter profile background ${item.id}" }
        }
    }

    private suspend fun loadPortraitImage(item: SupabaseProfileBackgroundCatalogItem): ByteArray {
        val portraitPath = item.portraitStoragePath ?: return loadLandscapeImage(item)
        return try {
            loadImage(
                cacheKey = "${item.id}-portrait-v${item.assetVersion}",
                storagePath = portraitPath,
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            log.w(error) { "Unable to load portrait background ${item.id}" }
            loadLandscapeImage(item)
        }
    }

    private suspend fun loadLandscapeImage(item: SupabaseProfileBackgroundCatalogItem): ByteArray =
        loadImage(
            cacheKey = "${item.id}-v${item.assetVersion}",
            storagePath = item.storagePath,
        )

    private suspend fun loadImage(cacheKey: String, storagePath: String): ByteArray =
        MemberAssetStorage.loadProfileBackground(cacheKey)
            ?: SupabaseProvider.client.storage[ProfileBackgroundBucket]
                .downloadAuthenticated(storagePath)
                .also { MemberAssetStorage.saveProfileBackground(cacheKey, it) }
}

@Serializable
private data class SupabaseProfileBackgroundCatalogItem(
    val id: String,
    @SerialName("display_name") val displayName: String,
    @SerialName("storage_path") val storagePath: String,
    @SerialName("portrait_storage_path") val portraitStoragePath: String? = null,
    @SerialName("asset_version") val assetVersion: Int,
)
