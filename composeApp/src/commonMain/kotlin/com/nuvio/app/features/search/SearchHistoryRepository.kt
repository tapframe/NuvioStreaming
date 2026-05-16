package com.nuvio.app.features.search

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object SearchHistoryRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow<List<String>>(emptyList())
    val uiState: StateFlow<List<String>> = _uiState.asStateFlow()

    private val _settingsUiState = MutableStateFlow(SearchHistorySettingsUiState())
    val settingsUiState: StateFlow<SearchHistorySettingsUiState> = _settingsUiState.asStateFlow()

    private var hasLoaded = false
    private var recentSearches: List<String> = emptyList()
    private var limitOverride: Int? = null

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun recordSearch(query: String) {
        ensureLoaded()
        val normalizedQuery = query.trim()
        if (normalizedQuery.length < 2) return

        val updatedSearches = applySearchHistoryEntry(
            current = recentSearches,
            query = normalizedQuery,
            limit = effectiveLimit(),
        )
        if (updatedSearches == recentSearches) return

        recentSearches = updatedSearches
        publish()
        persist()
    }

    fun removeSearch(query: String) {
        ensureLoaded()
        val updatedSearches = recentSearches.filterNot { it == query }
        if (updatedSearches == recentSearches) return

        recentSearches = updatedSearches
        publish()
        persist()
    }

    fun clearSearches() {
        ensureLoaded()
        if (recentSearches.isEmpty()) return

        recentSearches = emptyList()
        publish()
        persist()
    }

    fun setLimitOverride(limit: Int?) {
        ensureLoaded()
        val normalizedLimit = limit.normalizedSearchHistoryLimitOverride()
        if (limitOverride == normalizedLimit) return

        limitOverride = normalizedLimit
        SearchHistoryStorage.saveLimitOverride(normalizedLimit)
        _settingsUiState.value = SearchHistorySettingsUiState(normalizedLimit)

        val trimmedSearches = recentSearches.applyLimit(effectiveLimit())
        if (trimmedSearches != recentSearches) {
            recentSearches = trimmedSearches
            publish()
            persist()
        }
    }

    private fun loadFromDisk() {
        hasLoaded = true
        limitOverride = SearchHistoryStorage.loadLimitOverride().normalizedSearchHistoryLimitOverride()
        _settingsUiState.value = SearchHistorySettingsUiState(limitOverride)
        val payload = SearchHistoryStorage.loadPayload().orEmpty().trim()
        recentSearches = if (payload.isEmpty()) {
            emptyList()
        } else {
            runCatching {
                json.decodeFromString<List<String>>(payload)
            }.getOrDefault(emptyList())
                .map { it.trim() }
                .filter { it.length >= 2 }
                .distinct()
                .applyLimit(effectiveLimit())
        }
        publish()
    }

    private fun effectiveLimit(): Int? =
        when (limitOverride) {
            null -> SearchHistoryDefaultLimit
            else -> limitOverride
        }

    private fun publish() {
        _uiState.value = recentSearches
    }

    private fun persist() {
        SearchHistoryStorage.savePayload(json.encodeToString(recentSearches))
    }
}

data class SearchHistorySettingsUiState(
    val limitOverride: Int? = null,
)

const val SearchHistoryDefaultLimit = 10
const val SearchHistoryRecentSearchLimit = 5

internal fun applySearchHistoryEntry(
    current: List<String>,
    query: String,
    limit: Int?,
): List<String> =
    buildList {
        add(query)
        current.forEach { existing ->
            if (existing != query && (limit == null || size < limit)) {
                add(existing)
            }
        }
    }

private fun List<String>.applyLimit(limit: Int?): List<String> =
    if (limit == null) this else take(limit)

private fun Int?.normalizedSearchHistoryLimitOverride(): Int? =
    when (this) {
        null -> null
        SearchHistoryRecentSearchLimit -> SearchHistoryRecentSearchLimit
        else -> null
    }
