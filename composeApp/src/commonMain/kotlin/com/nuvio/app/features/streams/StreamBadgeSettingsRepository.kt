package com.nuvio.app.features.streams

import com.nuvio.app.features.addons.httpGetText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class StreamBadgeSettingsUiState(
    val rules: StreamBadgeRules = StreamBadgeRules(),
    val showFileSizeBadges: Boolean = true,
)

object StreamBadgeSettingsRepository {
    private val _uiState = MutableStateFlow(StreamBadgeSettingsUiState())
    val uiState: StateFlow<StreamBadgeSettingsUiState> = _uiState.asStateFlow()

    @OptIn(ExperimentalSerializationApi::class)
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private var hasLoaded = false
    private var streamBadgeRules = StreamBadgeRules()
    private var showFileSizeBadges = true

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        streamBadgeRules = StreamBadgeRules()
        showFileSizeBadges = true
        _uiState.value = StreamBadgeSettingsUiState()
    }

    fun snapshot(): StreamBadgeRules {
        ensureLoaded()
        return _uiState.value.rules
    }

    fun showFileSizeBadgesSnapshot(): Boolean {
        ensureLoaded()
        return _uiState.value.showFileSizeBadges
    }

    suspend fun importStreamBadgeRulesFromUrl(url: String): StreamBadgeImportResult {
        ensureLoaded()
        val normalizedUrl = url.trim()
        if (normalizedUrl.isBlank()) {
            return StreamBadgeImportResult.Error("Enter a badge JSON URL.")
        }
        if (!normalizedUrl.startsWith("https://", ignoreCase = true) &&
            !normalizedUrl.startsWith("http://", ignoreCase = true)
        ) {
            return StreamBadgeImportResult.Error("Badge URL must start with http:// or https://.")
        }

        return try {
            val currentRules = streamBadgeRules.normalized()
            val isExistingImport = currentRules.imports.any { import ->
                import.sourceUrl.equals(normalizedUrl, ignoreCase = true)
            }
            if (!isExistingImport && currentRules.imports.size >= STREAM_BADGE_IMPORT_LIMIT) {
                return StreamBadgeImportResult.Error("You can import up to $STREAM_BADGE_IMPORT_LIMIT badge URLs.")
            }
            val payload = httpGetText(normalizedUrl)
            val parsedImport = StreamBadgeRulesParser.parse(
                sourceUrl = normalizedUrl,
                payload = payload,
            )
            streamBadgeRules = currentRules.upsert(parsedImport, activate = true)
            publish()
            saveStreamBadgeRules()
            StreamBadgeImportResult.Success(streamBadgeRules)
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            StreamBadgeImportResult.Error(error.message ?: "Badge import failed.")
        }
    }

    fun setActiveStreamBadgeRulesSource(sourceUrl: String) {
        ensureLoaded()
        val currentRules = streamBadgeRules.normalized()
        val nextRules = currentRules.setActiveSource(sourceUrl)
        if (nextRules == currentRules) return
        streamBadgeRules = nextRules
        publish()
        saveStreamBadgeRules()
    }

    fun deleteStreamBadgeRulesSource(sourceUrl: String) {
        ensureLoaded()
        val currentRules = streamBadgeRules.normalized()
        val nextRules = currentRules.removeSource(sourceUrl)
        if (nextRules == currentRules) return
        streamBadgeRules = nextRules
        publish()
        saveStreamBadgeRules()
    }

    fun setShowFileSizeBadges(enabled: Boolean) {
        ensureLoaded()
        if (showFileSizeBadges == enabled) return
        showFileSizeBadges = enabled
        publish()
        StreamBadgeSettingsStorage.saveShowFileSizeBadges(enabled)
    }

    private fun loadFromDisk() {
        hasLoaded = true
        val storedRules = parseStreamBadgeRules(StreamBadgeSettingsStorage.loadStreamBadgeRules())
        val legacyRules = if (storedRules == null) {
            parseStreamBadgeRules(StreamBadgeSettingsStorage.loadLegacyDebridStreamBadgeRules())
        } else {
            null
        }
        streamBadgeRules = storedRules ?: legacyRules ?: StreamBadgeRules()
        showFileSizeBadges = StreamBadgeSettingsStorage.loadShowFileSizeBadges() ?: true
        if (legacyRules != null) {
            saveStreamBadgeRules()
            StreamBadgeSettingsStorage.clearLegacyDebridStreamBadgeRules()
        }
        publish()
    }

    private fun publish() {
        _uiState.value = StreamBadgeSettingsUiState(
            rules = streamBadgeRules,
            showFileSizeBadges = showFileSizeBadges,
        )
    }

    private fun saveStreamBadgeRules() {
        val normalizedRules = streamBadgeRules.normalized()
        val payload = if (normalizedRules.hasImport) {
            json.encodeToString(normalizedRules)
        } else {
            ""
        }
        StreamBadgeSettingsStorage.saveStreamBadgeRules(payload)
    }

    private fun parseStreamBadgeRules(value: String?): StreamBadgeRules? {
        if (value.isNullOrBlank()) return null
        val decodedRules = try {
            json.decodeFromString<StreamBadgeRules>(value).normalized()
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
        if (decodedRules?.hasImport == true) return decodedRules

        val legacyRules = try {
            json.decodeFromString<LegacyStreamBadgeRules>(value)
                .toBadgeRules()
                .normalized()
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
        return legacyRules?.takeIf { it.hasImport } ?: decodedRules
    }
}

@Serializable
private data class LegacyStreamBadgeRules(
    val sourceUrl: String = "",
    val filters: List<StreamBadgeFilter> = emptyList(),
    val groups: List<StreamBadgeGroup> = emptyList(),
) {
    fun toBadgeRules(): StreamBadgeRules =
        StreamBadgeRules(
            imports = listOf(
                StreamBadgeImport(
                    sourceUrl = sourceUrl,
                    filters = filters,
                    groups = groups,
                ),
            ),
        )
}
