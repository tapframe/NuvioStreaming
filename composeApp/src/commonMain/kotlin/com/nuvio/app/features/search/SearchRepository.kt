package com.nuvio.app.features.search

import co.touchlab.kermit.Logger
import com.nuvio.app.core.i18n.localizedMediaTypeLabel
import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.AddonExtraProperty
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.catalog.CatalogPage
import com.nuvio.app.features.catalog.buildCatalogUrl
import com.nuvio.app.features.catalog.fetchCatalogPage
import com.nuvio.app.features.catalog.mergeCatalogItems
import com.nuvio.app.features.catalog.supportsPagination
import com.nuvio.app.features.home.HomeCatalogSettingsRepository
import com.nuvio.app.features.home.HomeCatalogSection
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.home.filterReleasedItems
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString

object SearchRepository {
    private val log = Logger.withTag("SearchRepository")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()
    private val _discoverUiState = MutableStateFlow(DiscoverUiState())
    val discoverUiState: StateFlow<DiscoverUiState> = _discoverUiState.asStateFlow()

    private var activeJob: Job? = null
    private var activeDiscoverJob: Job? = null
    private var lastRequestKey: String? = null
    private var discoverSources: List<DiscoverCatalogOption> = emptyList()
    private var lastDiscoverHideUnreleasedContent: Boolean? = null

    fun search(query: String, addons: List<ManagedAddon>) {
        val normalizedQuery = query.trim()
        if (normalizedQuery.isBlank()) {
            clear()
            return
        }

        val activeAddons = addons.filter { it.manifest != null }
        if (activeAddons.isEmpty()) {
            activeJob?.cancel()
            lastRequestKey = null
            _uiState.value = SearchUiState(
                emptyStateReason = SearchEmptyStateReason.NoActiveAddons,
            )
            return
        }

        val requests = buildSearchRequests(
            addons = activeAddons,
            query = normalizedQuery,
        )
        if (requests.isEmpty()) {
            activeJob?.cancel()
            lastRequestKey = null
            _uiState.value = SearchUiState(
                emptyStateReason = SearchEmptyStateReason.NoSearchCatalogs,
            )
            return
        }

        val requestKey = buildString {
            append(normalizedQuery.lowercase())
            append('|')
            append(HomeCatalogSettingsRepository.snapshot().hideUnreleasedContent)
            append('|')
            append(
                requests.joinToString(separator = "|") { request ->
                    "${request.addon.manifestUrl}:${request.type}:${request.catalogId}"
                },
            )
        }
        if (requestKey == lastRequestKey) return
        lastRequestKey = requestKey

        activeJob?.cancel()
        _uiState.value = SearchUiState(isLoading = true)

        activeJob = scope.launch {
            val results = requests.map { request ->
                async {
                    runCatching { request.toSection() }
                }
            }.awaitAll()

            val sections = results
                .mapNotNull { it.getOrNull() }
            val firstFailure = results.firstNotNullOfOrNull { it.exceptionOrNull()?.message }
            val allFailed = results.isNotEmpty() && results.all { it.isFailure }

            _uiState.value = SearchUiState(
                isLoading = false,
                sections = sections,
                emptyStateReason = when {
                    sections.isNotEmpty() -> null
                    allFailed -> SearchEmptyStateReason.RequestFailed
                    else -> SearchEmptyStateReason.NoResults
                },
                errorMessage = if (allFailed) firstFailure else null,
            )
        }
    }

    fun clear() {
        activeJob?.cancel()
        lastRequestKey = null
        _uiState.value = SearchUiState()
    }

    fun reset() {
        activeJob?.cancel()
        activeDiscoverJob?.cancel()
        lastRequestKey = null
        discoverSources = emptyList()
        lastDiscoverHideUnreleasedContent = null
        _uiState.value = SearchUiState()
        _discoverUiState.value = DiscoverUiState()
    }

    fun refreshDiscover(addons: List<ManagedAddon>) {
        val activeAddons = addons.filter { it.manifest != null }
        if (activeAddons.isEmpty()) {
            activeDiscoverJob?.cancel()
            discoverSources = emptyList()
            lastDiscoverHideUnreleasedContent = null
            log.d { "Discover refresh aborted: no active addons" }
            _discoverUiState.value = DiscoverUiState(
                emptyStateReason = DiscoverEmptyStateReason.NoActiveAddons,
            )
            return
        }

        val sources = buildDiscoverSources(activeAddons)
        val current = _discoverUiState.value
        val hideUnreleasedContent = HomeCatalogSettingsRepository.snapshot().hideUnreleasedContent
        if (
            sources == discoverSources &&
            lastDiscoverHideUnreleasedContent == hideUnreleasedContent &&
            current.canReuseDiscoverState(sources)
        ) {
            log.d {
                "Reusing discover state type=${current.selectedType} catalog=${current.selectedCatalogKey} " +
                    "genre=${current.selectedGenre ?: "<all>"} items=${current.items.size} nextSkip=${current.nextSkip}"
            }
            return
        }

        discoverSources = sources
        lastDiscoverHideUnreleasedContent = hideUnreleasedContent
        if (sources.isEmpty()) {
            activeDiscoverJob?.cancel()
            log.d { "Discover refresh found no compatible discover catalogs" }
            _discoverUiState.value = DiscoverUiState(
                emptyStateReason = DiscoverEmptyStateReason.NoDiscoverCatalogs,
            )
            return
        }

        val typeOptions = sources.map { it.type }.distinct()
        val selectedType = current.selectedType
            ?.takeIf { type -> typeOptions.contains(type) }
            ?: typeOptions.first()
        val catalogOptions = sources.filter { it.type == selectedType }
        val selectedCatalog = catalogOptions.firstOrNull { it.key == current.selectedCatalogKey } ?: catalogOptions.first()
        val selectedGenre = selectedCatalog.resolveGenreSelection(current.selectedGenre)

        _discoverUiState.value = DiscoverUiState(
            typeOptions = typeOptions,
            selectedType = selectedType,
            catalogOptions = catalogOptions,
            selectedCatalogKey = selectedCatalog.key,
            selectedGenre = selectedGenre,
            items = emptyList(),
            isLoading = false,
            nextSkip = null,
            emptyStateReason = null,
            errorMessage = null,
        )

        log.d {
            "Discover refresh prepared type=$selectedType catalog=${selectedCatalog.key} " +
                "genre=${selectedGenre ?: "<all>"} sources=${sources.size}"
        }

        loadDiscoverFeed(reset = true)
    }

    fun selectDiscoverType(type: String) {
        val current = _discoverUiState.value
        if (current.selectedType == type) return

        val catalogOptions = discoverSources.filter { it.type == type }
        val selectedCatalog = catalogOptions.firstOrNull() ?: run {
            _discoverUiState.value = current.copy(
                selectedType = type,
                catalogOptions = emptyList(),
                selectedCatalogKey = null,
                selectedGenre = null,
                items = emptyList(),
                isLoading = false,
                nextSkip = null,
                emptyStateReason = DiscoverEmptyStateReason.NoDiscoverCatalogs,
                errorMessage = null,
            )
            return
        }

        _discoverUiState.value = current.copy(
            selectedType = type,
            catalogOptions = catalogOptions,
            selectedCatalogKey = selectedCatalog.key,
            selectedGenre = selectedCatalog.resolveGenreSelection(null),
            items = emptyList(),
            isLoading = false,
            nextSkip = null,
            emptyStateReason = null,
            errorMessage = null,
        )
        loadDiscoverFeed(reset = true)
    }

    fun selectDiscoverCatalog(catalogKey: String) {
        val current = _discoverUiState.value
        if (current.selectedCatalogKey == catalogKey) return

        val selectedCatalog = current.catalogOptions.firstOrNull { it.key == catalogKey } ?: return
        _discoverUiState.value = current.copy(
            selectedCatalogKey = selectedCatalog.key,
            selectedGenre = selectedCatalog.resolveGenreSelection(null),
            items = emptyList(),
            isLoading = false,
            nextSkip = null,
            emptyStateReason = null,
            errorMessage = null,
        )
        loadDiscoverFeed(reset = true)
    }

    fun selectDiscoverGenre(genre: String?) {
        val current = _discoverUiState.value
        val selectedCatalog = current.selectedCatalog ?: return
        val normalizedGenre = selectedCatalog.resolveGenreSelection(genre)
        if (current.selectedGenre == normalizedGenre) return

        _discoverUiState.value = current.copy(
            selectedGenre = normalizedGenre,
            items = emptyList(),
            isLoading = false,
            nextSkip = null,
            emptyStateReason = null,
            errorMessage = null,
        )
        loadDiscoverFeed(reset = true)
    }

    fun loadMoreDiscover() {
        val current = _discoverUiState.value
        if (current.isLoading || current.nextSkip == null) return
        loadDiscoverFeed(reset = false)
    }

    private fun buildSearchRequests(
        addons: List<ManagedAddon>,
        query: String,
    ): List<SearchCatalogRequest> =
        addons.mapNotNull { addon ->
            val manifest = addon.manifest ?: return@mapNotNull null
            addon to manifest
        }.flatMap { (addon, manifest) ->
            manifest.catalogs
                .filter { catalog -> catalog.supportsSearch() }
                .map { catalog ->
                    SearchCatalogRequest(
                        addon = addon,
                        catalogId = catalog.id,
                        catalogName = catalog.name,
                        type = catalog.type,
                        query = query,
                        supportsPagination = catalog.supportsPagination(),
                    )
                }
        }

    private fun buildDiscoverSources(addons: List<ManagedAddon>): List<DiscoverCatalogOption> =
        addons.mapNotNull { addon ->
            val manifest = addon.manifest ?: return@mapNotNull null
            addon to manifest
        }.flatMap { (addon, manifest) ->
            manifest.catalogs
                .filter { catalog -> catalog.supportsDiscover() }
                .map { catalog ->
                    val genreExtra = catalog.genreExtra()
                    DiscoverCatalogOption(
                        key = "${manifest.id}:${catalog.type}:${catalog.id}",
                        addonName = addon.displayTitle,
                        manifestUrl = addon.manifestUrl,
                        type = catalog.type,
                        catalogId = catalog.id,
                        catalogName = catalog.name,
                        genreOptions = genreExtra?.options.orEmpty(),
                        genreRequired = genreExtra?.isRequired == true,
                        supportsPagination = catalog.supportsPagination(),
                    )
                }
        }

    private suspend fun SearchCatalogRequest.toSection(): HomeCatalogSection {
        val manifest = requireNotNull(addon.manifest)
        val page = fetchCatalogPage(
            manifestUrl = manifest.transportUrl,
            type = type,
            catalogId = catalogId,
            search = query,
        ).withUnreleasedFilter()
        val items = page.items
        require(items.isNotEmpty()) { "No search results returned for $catalogName." }

        return HomeCatalogSection(
            key = "${manifest.id}:search:$type:$catalogId:${query.lowercase()}",
            title = getString(Res.string.discover_catalog_context, catalogName, type.displayLabel()),
            subtitle = addon.displayTitle,
            addonName = addon.displayTitle,
            type = type,
            manifestUrl = manifest.transportUrl,
            catalogId = catalogId,
            items = items,
            availableItemCount = page.rawItemCount,
            supportsPagination = supportsPagination,
        )
    }

    private fun loadDiscoverFeed(reset: Boolean) {
        activeDiscoverJob?.cancel()
        val current = _discoverUiState.value
        val selectedCatalog = current.selectedCatalog ?: return
        val requestedSkip = if (reset) 0 else current.nextSkip ?: return
        val requestUrl = buildCatalogUrl(
            manifestUrl = selectedCatalog.manifestUrl,
            type = selectedCatalog.type,
            catalogId = selectedCatalog.catalogId,
            genre = current.selectedGenre,
            search = null,
            skip = requestedSkip.takeIf { it > 0 },
        )

        log.d {
            "Discover request reset=$reset addon=${selectedCatalog.addonName} type=${selectedCatalog.type} " +
                "catalogId=${selectedCatalog.catalogId} catalogKey=${selectedCatalog.key} " +
                "genre=${current.selectedGenre ?: "<all>"} skip=$requestedSkip url=$requestUrl"
        }

        _discoverUiState.value = current.copy(
            isLoading = true,
            items = if (reset) emptyList() else current.items,
            nextSkip = if (reset) null else current.nextSkip,
            emptyStateReason = null,
            errorMessage = null,
        )

        activeDiscoverJob = scope.launch {
            runCatching {
                fetchCatalogPage(
                    manifestUrl = selectedCatalog.manifestUrl,
                    type = selectedCatalog.type,
                    catalogId = selectedCatalog.catalogId,
                    genre = current.selectedGenre,
                    skip = requestedSkip.takeIf { it > 0 },
                ).withUnreleasedFilter()
            }.fold(
                onSuccess = { page ->
                    val latest = _discoverUiState.value
                    if (latest.selectedCatalogKey != selectedCatalog.key || latest.selectedGenre != current.selectedGenre) {
                        return@fold
                    }
                    val mergedItems = if (reset) {
                        page.items
                    } else {
                        mergeCatalogItems(latest.items, page.items)
                    }
                    log.d {
                        "Discover response catalogKey=${selectedCatalog.key} returned=${page.items.size} " +
                            "merged=${mergedItems.size} rawItemCount=${page.rawItemCount} nextSkip=${page.nextSkip} " +
                            "sample=${page.items.previewNames()}"
                    }
                    _discoverUiState.value = latest.copy(
                        items = mergedItems,
                        isLoading = false,
                        nextSkip = if (selectedCatalog.supportsPagination) page.nextSkip else null,
                        emptyStateReason = if (mergedItems.isEmpty()) DiscoverEmptyStateReason.NoResults else null,
                        errorMessage = null,
                    )
                },
                onFailure = { error ->
                    if (error is CancellationException) {
                        log.d {
                            "Discover request cancelled catalogKey=${selectedCatalog.key} addon=${selectedCatalog.addonName} " +
                                "type=${selectedCatalog.type} catalogId=${selectedCatalog.catalogId} " +
                                "genre=${current.selectedGenre ?: "<all>"} skip=$requestedSkip"
                        }
                        return@fold
                    }

                    val latest = _discoverUiState.value
                    if (latest.selectedCatalogKey != selectedCatalog.key || latest.selectedGenre != current.selectedGenre) {
                        return@fold
                    }
                    log.e(error) {
                        "Discover request failed catalogKey=${selectedCatalog.key} addon=${selectedCatalog.addonName} " +
                            "type=${selectedCatalog.type} catalogId=${selectedCatalog.catalogId} " +
                            "genre=${current.selectedGenre ?: "<all>"} skip=$requestedSkip url=$requestUrl"
                    }
                    _discoverUiState.value = latest.copy(
                        items = if (reset) emptyList() else latest.items,
                        isLoading = false,
                        nextSkip = null,
                        emptyStateReason = DiscoverEmptyStateReason.RequestFailed,
                        errorMessage = error.message ?: getString(Res.string.discover_empty_load_failed_message),
                    )
                },
            )
        }
    }
}

private fun CatalogPage.withUnreleasedFilter(): CatalogPage {
    if (!HomeCatalogSettingsRepository.snapshot().hideUnreleasedContent) return this
    val filteredItems = items.filterReleasedItems(CurrentDateProvider.todayIsoDate())
    return if (filteredItems.size == items.size) this else copy(items = filteredItems)
}

private data class SearchCatalogRequest(
    val addon: ManagedAddon,
    val catalogId: String,
    val catalogName: String,
    val type: String,
    val query: String,
    val supportsPagination: Boolean,
)

private fun AddonCatalog.supportsSearch(): Boolean =
    extra.any { property -> property.name == "search" } &&
        extra.none { property -> property.isRequired && property.name != "search" }

private fun AddonCatalog.supportsDiscover(): Boolean {
    if (extra.any { property -> property.name == "search" && property.isRequired }) {
        return false
    }

    return extra.none { property ->
        when (property.name) {
            "genre" -> property.isRequired && property.options.isEmpty()
            "skip" -> false
            "search" -> false
            else -> property.isRequired
        }
    }
}

private fun AddonCatalog.genreExtra(): AddonExtraProperty? =
    extra.firstOrNull { property -> property.name == "genre" }

private fun DiscoverCatalogOption.resolveGenreSelection(requestedGenre: String?): String? =
    when {
        genreOptions.isEmpty() -> null
        requestedGenre != null && genreOptions.contains(requestedGenre) -> requestedGenre
        genreRequired -> genreOptions.firstOrNull()
        else -> null
    }

private fun DiscoverUiState.canReuseDiscoverState(
    sources: List<DiscoverCatalogOption>,
): Boolean {
    val currentType = selectedType ?: return false
    if (!typeOptions.contains(currentType) || !sources.any { it.type == currentType }) {
        return false
    }

    val currentCatalog = sources.firstOrNull { it.key == selectedCatalogKey } ?: return false
    if (currentCatalog.type != currentType) {
        return false
    }

    val resolvedGenre = currentCatalog.resolveGenreSelection(selectedGenre)
    if (selectedGenre != resolvedGenre) {
        return false
    }

    return isLoading || items.isNotEmpty() || emptyStateReason != null || errorMessage != null || nextSkip != null
}

private fun List<MetaPreview>.previewNames(limit: Int = 5): String {
    if (isEmpty()) return "[]"
    return take(limit).joinToString(prefix = "[", postfix = if (size > limit) ", ...]" else "]") { item ->
        item.name
    }
}

private fun String.displayLabel(): String =
    localizedMediaTypeLabel(this)

private fun String.typeSortKey(): String =
    when (lowercase()) {
        "movie" -> "0_movie"
        "series" -> "1_series"
        "anime" -> "2_anime"
        else -> "9_$this"
    }
