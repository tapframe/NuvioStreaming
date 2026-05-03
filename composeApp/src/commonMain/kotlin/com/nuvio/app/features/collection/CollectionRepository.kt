package com.nuvio.app.features.collection

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.ManagedAddon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.collections_import_error_collection_blank_id
import nuvio.composeapp.generated.resources.collections_import_error_collection_blank_title
import nuvio.composeapp.generated.resources.collections_import_error_empty_json
import nuvio.composeapp.generated.resources.collections_import_error_folder_blank_id
import nuvio.composeapp.generated.resources.collections_import_error_folder_blank_title
import nuvio.composeapp.generated.resources.collections_import_error_invalid_json
import nuvio.composeapp.generated.resources.collections_import_error_source_blank_fields
import nuvio.composeapp.generated.resources.collections_import_error_trakt_list_id
import org.jetbrains.compose.resources.getString
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

object CollectionRepository {
    private val log = Logger.withTag("CollectionRepository")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _collections = MutableStateFlow<List<Collection>>(emptyList())
    val collections: StateFlow<List<Collection>> = _collections.asStateFlow()
    private val _localChangeEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    internal val localChangeEvents: SharedFlow<Unit> = _localChangeEvents.asSharedFlow()
    private var rawCollectionsJson: JsonElement = JsonArray(emptyList())

    private var hasLoaded = false

    fun initialize() {
        if (hasLoaded) return
        hasLoaded = true
        val payload = CollectionStorage.loadPayload()
        if (payload.isNullOrBlank()) return

        runCatching {
            val parsed = json.parseToJsonElement(payload)
            rawCollectionsJson = parsed
            _collections.value = json.decodeFromString<List<Collection>>(payload)
        }.onFailure { e ->
            log.e(e) { "Failed to load collections from storage" }
        }
    }

    fun onProfileChanged() {
        hasLoaded = false
        _collections.value = emptyList()
        rawCollectionsJson = JsonArray(emptyList())
    }

    fun clearLocalState() {
        hasLoaded = false
        _collections.value = emptyList()
        rawCollectionsJson = JsonArray(emptyList())
    }

    fun getCollection(id: String): Collection? =
        _collections.value.find { it.id == id }

    fun addCollection(collection: Collection) {
        ensureLoaded()
        _collections.value = _collections.value + collection
        persist()
    }

    fun updateCollection(collection: Collection) {
        ensureLoaded()
        _collections.value = _collections.value.map {
            if (it.id == collection.id) collection else it
        }
        persist()
    }

    fun removeCollection(collectionId: String) {
        ensureLoaded()
        _collections.value = _collections.value.filter { it.id != collectionId }
        persist()
    }

    fun setCollections(collections: List<Collection>) {
        ensureLoaded()
        _collections.value = collections
        persist()
    }

    fun moveUp(index: Int) {
        moveByIndex(index, index - 1)
    }

    fun moveDown(index: Int) {
        moveByIndex(index, index + 1)
    }

    fun moveByIndex(fromIndex: Int, toIndex: Int) {
        ensureLoaded()
        val list = _collections.value.toMutableList()
        if (fromIndex == toIndex) return
        if (fromIndex !in list.indices || toIndex !in list.indices) return
        val item = list.removeAt(fromIndex)
        list.add(toIndex, item)
        _collections.value = list
        persist()
    }

    fun exportToJson(): String {
        ensureLoaded()
        return mergedCollectionsJson().toString()
    }

    fun importFromJson(jsonString: String): Result<List<Collection>> {
        return runCatching {
            rawCollectionsJson = json.parseToJsonElement(jsonString)
            val imported = json.decodeFromString<List<Collection>>(jsonString)
            _collections.value = imported
            persist()
            imported
        }
    }

    fun validateJson(jsonString: String): ValidationResult {
        if (jsonString.isBlank()) {
            return ValidationResult(
                valid = false,
                error = runBlocking { getString(Res.string.collections_import_error_empty_json) },
            )
        }
        return try {
            val collections = json.decodeFromString<List<Collection>>(jsonString)
            var totalFolders = 0
            collections.forEachIndexed { ci, c ->
                if (c.id.isBlank()) {
                    return ValidationResult(
                        valid = false,
                        error = runBlocking {
                            getString(Res.string.collections_import_error_collection_blank_id, ci + 1)
                        },
                    )
                }
                if (c.title.isBlank()) {
                    return ValidationResult(
                        valid = false,
                        error = runBlocking {
                            getString(Res.string.collections_import_error_collection_blank_title, c.id)
                        },
                    )
                }
                c.folders.forEachIndexed { fi, f ->
                    if (f.id.isBlank()) {
                        return ValidationResult(
                            valid = false,
                            error = runBlocking {
                                getString(
                                    Res.string.collections_import_error_folder_blank_id,
                                    fi + 1,
                                    c.title,
                                )
                            },
                        )
                    }
                    if (f.title.isBlank()) {
                        return ValidationResult(
                            valid = false,
                            error = runBlocking {
                                getString(
                                    Res.string.collections_import_error_folder_blank_title,
                                    f.id,
                                    c.title,
                                )
                            },
                        )
                    }
                    f.resolvedSources.forEachIndexed { si, s ->
                        if (s.hasInvalidTraktListId()) {
                            return ValidationResult(
                                valid = false,
                                error = runBlocking {
                                    getString(
                                        Res.string.collections_import_error_trakt_list_id,
                                        si + 1,
                                        f.title,
                                    )
                                },
                            )
                        }

                        val invalidAddon = !s.isTmdb && !s.isTrakt &&
                            (s.addonId.isNullOrBlank() || s.type.isNullOrBlank() || s.catalogId.isNullOrBlank())
                        val invalidTmdb = s.isTmdb &&
                            s.tmdbSourceType.isNullOrBlank()
                        if (invalidAddon || invalidTmdb) {
                            return ValidationResult(
                                valid = false,
                                error = runBlocking {
                                    getString(
                                        Res.string.collections_import_error_source_blank_fields,
                                        si + 1,
                                        f.title,
                                    )
                                },
                            )
                        }
                    }
                    totalFolders++
                }
            }
            ValidationResult(
                valid = true,
                collectionCount = collections.size,
                folderCount = totalFolders,
            )
        } catch (e: Exception) {
            ValidationResult(
                valid = false,
                error = runBlocking {
                    getString(Res.string.collections_import_error_invalid_json, e.message.orEmpty())
                },
            )
        }
    }

    @OptIn(ExperimentalUuidApi::class)
    fun generateId(): String = Uuid.random().toString()

    fun getAvailableCatalogs(): List<AvailableCatalog> {
        val addons = AddonRepository.uiState.value.addons
        return addons.mapNotNull { addon ->
            val manifest = addon.manifest ?: return@mapNotNull null
            addon to manifest
        }.flatMap { (addon, manifest) ->
            manifest.catalogs
                .filter { catalog -> catalog.extra.none { it.isRequired && it.name != "genre" } }
                .map { catalog ->
                    val genreExtra = catalog.extra.firstOrNull { it.name == "genre" }
                    AvailableCatalog(
                        addonId = manifest.id,
                        addonName = addon.displayTitle,
                        type = catalog.type,
                        catalogId = catalog.id,
                        catalogName = catalog.name,
                        genreOptions = genreExtra?.options.orEmpty(),
                        genreRequired = genreExtra?.isRequired == true,
                    )
                }
        }
    }

    internal fun applyFromRemote(collections: List<Collection>, rawJson: JsonElement) {
        rawCollectionsJson = rawJson
        _collections.value = collections
        persist(sync = false)
    }

    private fun ensureLoaded() {
        if (!hasLoaded) initialize()
    }

    private fun persist(sync: Boolean = true) {
        runCatching {
            CollectionStorage.savePayload(mergedCollectionsJson().toString())
            if (sync) {
                _localChangeEvents.tryEmit(Unit)
            }
        }.onFailure { e ->
            log.e(e) { "Failed to persist collections" }
        }
    }

    private fun mergedCollectionsJson(): JsonArray =
        CollectionJsonPreserver.merge(json, rawCollectionsJson, _collections.value).also {
            rawCollectionsJson = it
        }
}
