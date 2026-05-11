package com.nuvio.app.features.home

import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.catalog.fetchCatalogPage
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.absoluteValue
import kotlin.random.Random

object HomeRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var activeJob: Job? = null
    private var activeRequestKey: String? = null
    private var lastRequestKey: String? = null
    private var currentDefinitions: List<HomeCatalogDefinition> = emptyList()
    private var cachedSections: Map<String, HomeCatalogSection> = emptyMap()
    private var lastErrorMessage: String? = null

    fun refresh(addons: List<ManagedAddon>, force: Boolean = false) {
        val requests = buildHomeCatalogDefinitions(addons)
        currentDefinitions = requests
        val requestKeys = requests.mapTo(mutableSetOf(), HomeCatalogDefinition::key)
        cachedSections = cachedSections.filterKeys(requestKeys::contains)
        val requestKey = requests.joinToString(separator = "|") { request ->
            "${request.manifestUrl}:${request.type}:${request.catalogId}"
        }

        if (!force && activeRequestKey == requestKey && _uiState.value.isLoading) return

        if (!force && requestKey == lastRequestKey && requestKeys.all(cachedSections::containsKey)) {
            if (_uiState.value.sections.isEmpty() || _uiState.value.heroItems.isEmpty()) {
                applyCurrentSettings()
            }
            return
        }
        lastRequestKey = requestKey
        activeRequestKey = requestKey

        if (requests.isEmpty()) {
            activeJob?.cancel()
            activeJob = null
            activeRequestKey = null
            cachedSections = emptyMap()
            lastErrorMessage = null
            _uiState.value = HomeUiState(
                isLoading = false,
                sections = emptyList(),
                errorMessage = null,
            )
            return
        }

        activeJob?.cancel()
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        activeJob = scope.launch {
            val prioritizedRequests = prioritizeDefinitions(
                definitions = requests,
                snapshot = HomeCatalogSettingsRepository.snapshot(),
            )
            val pendingRequests = prioritizedRequests.filter { definition ->
                force || cachedSections[definition.key] == null
            }
            if (pendingRequests.isEmpty()) {
                publishCurrentState(
                    isLoading = false,
                    requestKey = requestKey,
                )
                return@launch
            }
            val loadedSections = linkedMapOf<String, HomeCatalogSection>().apply {
                putAll(cachedSections)
            }
            var firstErrorMessage: String? = null
            var batchIndex = 0

            pendingRequests.chunked(HOME_CATALOG_FETCH_BATCH_SIZE).forEach { batch ->
                if (activeRequestKey != requestKey) return@launch
                val results = batch.map { request ->
                    async { runCatching { request.toSection() } }
                }.awaitAll()

                if (activeRequestKey != requestKey) return@launch

                results.mapNotNull { it.getOrNull() }.forEach { section ->
                    loadedSections[section.key] = section
                }
                if (firstErrorMessage == null) {
                    firstErrorMessage = results.firstNotNullOfOrNull { it.exceptionOrNull()?.message }
                }
                cachedSections = loadedSections.toMap()
                lastErrorMessage = firstErrorMessage
                if (batchIndex == 0 || (batchIndex + 1) % HOME_CATALOG_PUBLISH_INTERVAL == 0) {
                    publishCurrentState(
                        isLoading = true,
                        requestKey = requestKey,
                    )
                }
                batchIndex++
            }

            if (activeRequestKey != requestKey) return@launch

            cachedSections = loadedSections.toMap()
            lastErrorMessage = firstErrorMessage
            publishCurrentState(
                isLoading = false,
                requestKey = requestKey,
            )
        }
    }

    fun applyCurrentSettings() {
        publishCurrentState(
            isLoading = _uiState.value.isLoading,
            requestKey = activeRequestKey ?: lastRequestKey,
        )
    }

    fun clear() {
        activeJob?.cancel()
        activeJob = null
        activeRequestKey = null
        lastRequestKey = null
        currentDefinitions = emptyList()
        cachedSections = emptyMap()
        lastErrorMessage = null
        _uiState.value = HomeUiState()
    }

    private fun publishCurrentState(
        isLoading: Boolean,
        requestKey: String?,
    ) {
        val snapshot = HomeCatalogSettingsRepository.snapshot()
        val preferences = snapshot.preferences
        val todayIsoDate = if (snapshot.hideUnreleasedContent) CurrentDateProvider.todayIsoDate() else null
        fun HomeCatalogSection.withReleaseFilter(): HomeCatalogSection =
            if (todayIsoDate == null) this else filterReleasedItems(todayIsoDate)

        val sections = currentDefinitions
            .sortedBy { definition -> preferences[definition.key]?.order ?: Int.MAX_VALUE }
            .mapNotNull { definition ->
                val preference = preferences[definition.key]
                if (preference?.enabled == false) return@mapNotNull null

                val section = cachedSections[definition.key]?.withReleaseFilter() ?: return@mapNotNull null
                if (section.items.isEmpty()) return@mapNotNull null
                val customTitle = preference?.customTitle.orEmpty()
                section.copy(
                    title = customTitle.ifBlank { section.title },
                )
            }

        val heroItems = if (snapshot.heroEnabled) {
            val heroRandom = Random((requestKey?.hashCode() ?: 0).absoluteValue + 1)
            currentDefinitions
                .filter { definition -> preferences[definition.key]?.heroSourceEnabled != false }
                .mapNotNull { definition -> cachedSections[definition.key] }
                .map { section -> section.withReleaseFilter() }
                .flatMap { section -> section.items }
                .distinctBy { item -> "${item.type}:${item.id}" }
                .shuffled(heroRandom)
                .take(HOME_HERO_ITEM_LIMIT)
        } else {
            emptyList()
        }

        _uiState.value = HomeUiState(
            isLoading = isLoading,
            heroItems = heroItems,
            sections = sections,
            errorMessage = if (sections.isEmpty()) lastErrorMessage else null,
        )
    }

    private suspend fun HomeCatalogDefinition.toSection(): HomeCatalogSection {
        val page = fetchCatalogPage(
            manifestUrl = manifestUrl,
            type = type,
            catalogId = catalogId,
            maxItems = HOME_CATALOG_PREVIEW_FETCH_LIMIT,
        )
        val items = page.items
        if (items.isEmpty()) {
            return HomeCatalogSection(
                key = key,
                title = defaultTitle,
                subtitle = addonName,
                addonName = addonName,
                type = type,
                manifestUrl = manifestUrl,
                catalogId = catalogId,
                items = emptyList(),
                availableItemCount = 0,
                supportsPagination = supportsPagination,
            )
        }

        return HomeCatalogSection(
            key = key,
            title = defaultTitle,
            subtitle = addonName,
            addonName = addonName,
            type = type,
            manifestUrl = manifestUrl,
            catalogId = catalogId,
            items = items,
            availableItemCount = page.rawItemCount,
            supportsPagination = supportsPagination,
        )
    }
}

private const val HOME_HERO_ITEM_LIMIT = 8
private const val HOME_CATALOG_FETCH_BATCH_SIZE = 4
private const val HOME_CATALOG_PREVIEW_FETCH_LIMIT = 18
private const val HOME_CATALOG_PUBLISH_INTERVAL = 2

private fun prioritizeDefinitions(
    definitions: List<HomeCatalogDefinition>,
    snapshot: HomeCatalogSettingsSnapshot,
): List<HomeCatalogDefinition> {
    val orderedDefinitions = definitions.sortedBy { definition ->
        snapshot.preferences[definition.key]?.order ?: Int.MAX_VALUE
    }
    val (priority, remainder) = orderedDefinitions.partition { definition ->
        val preference = snapshot.preferences[definition.key]
        if (preference == null) {
            true
        } else {
            preference.enabled || (snapshot.heroEnabled && preference.heroSourceEnabled)
        }
    }
    return priority + remainder
}
