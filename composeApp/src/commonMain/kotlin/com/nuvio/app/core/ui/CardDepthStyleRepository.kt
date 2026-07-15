package com.nuvio.app.core.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal const val DefaultCardDepthEdgeStrength = 28
internal const val DefaultCardDepthSheenStrength = 10
internal const val DefaultCardDepthEdgeCoverage = 0

enum class NuvioCardDepthSurface {
    Posters,
    ContinueWatching,
    EpisodeCards,
    Cast,
    Trailers,
}

@Serializable
private data class StoredCardDepthStylePreferences(
    val enabled: Boolean = false,
    val edgeStrength: Int = DefaultCardDepthEdgeStrength,
    val sheenStrength: Int = DefaultCardDepthSheenStrength,
    val edgeCoverage: Int = DefaultCardDepthEdgeCoverage,
    val postersEnabled: Boolean = true,
    val continueWatchingEnabled: Boolean = true,
    val episodeCardsEnabled: Boolean = true,
    val castEnabled: Boolean = true,
    val trailersEnabled: Boolean = true,
)

data class CardDepthStyleUiState(
    val enabled: Boolean = false,
    val edgeStrength: Int = DefaultCardDepthEdgeStrength,
    val sheenStrength: Int = DefaultCardDepthSheenStrength,
    val edgeCoverage: Int = DefaultCardDepthEdgeCoverage,
    val postersEnabled: Boolean = true,
    val continueWatchingEnabled: Boolean = true,
    val episodeCardsEnabled: Boolean = true,
    val castEnabled: Boolean = true,
    val trailersEnabled: Boolean = true,
) {
    fun isEnabledFor(surface: NuvioCardDepthSurface): Boolean =
        enabled && isSurfaceEnabled(surface)

    fun isSurfaceEnabled(surface: NuvioCardDepthSurface): Boolean =
        when (surface) {
            NuvioCardDepthSurface.Posters -> postersEnabled
            NuvioCardDepthSurface.ContinueWatching -> continueWatchingEnabled
            NuvioCardDepthSurface.EpisodeCards -> episodeCardsEnabled
            NuvioCardDepthSurface.Cast -> castEnabled
            NuvioCardDepthSurface.Trailers -> trailersEnabled
        }
}

object CardDepthStyleRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(CardDepthStyleUiState())
    val uiState: StateFlow<CardDepthStyleUiState> = _uiState.asStateFlow()

    private var hasLoaded = false

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        _uiState.value = CardDepthStyleUiState()
    }

    fun setEnabled(enabled: Boolean) {
        update { it.copy(enabled = enabled) }
    }

    fun setEdgeStrength(strength: Int) {
        update { it.copy(edgeStrength = strength.coerceIn(0, 100)) }
    }

    fun setSheenStrength(strength: Int) {
        update { it.copy(sheenStrength = strength.coerceIn(0, 100)) }
    }

    fun setEdgeCoverage(coverage: Int) {
        update { it.copy(edgeCoverage = coverage.coerceIn(0, 100)) }
    }

    fun setSurfaceEnabled(surface: NuvioCardDepthSurface, enabled: Boolean) {
        update {
            when (surface) {
                NuvioCardDepthSurface.Posters -> it.copy(postersEnabled = enabled)
                NuvioCardDepthSurface.ContinueWatching -> it.copy(continueWatchingEnabled = enabled)
                NuvioCardDepthSurface.EpisodeCards -> it.copy(episodeCardsEnabled = enabled)
                NuvioCardDepthSurface.Cast -> it.copy(castEnabled = enabled)
                NuvioCardDepthSurface.Trailers -> it.copy(trailersEnabled = enabled)
            }
        }
    }

    fun resetToDefaults() {
        ensureLoaded()
        if (_uiState.value == CardDepthStyleUiState()) return
        _uiState.value = CardDepthStyleUiState()
        persist()
    }

    private fun update(transform: (CardDepthStyleUiState) -> CardDepthStyleUiState) {
        ensureLoaded()
        val next = transform(_uiState.value)
        if (_uiState.value == next) return
        _uiState.value = next
        persist()
    }

    private fun loadFromDisk() {
        hasLoaded = true

        val payload = CardDepthStyleStorage.loadPayload().orEmpty().trim()
        if (payload.isEmpty()) {
            _uiState.value = CardDepthStyleUiState()
            return
        }

        val stored = runCatching {
            json.decodeFromString<StoredCardDepthStylePreferences>(payload)
        }.getOrNull()

        _uiState.value = if (stored != null) {
            CardDepthStyleUiState(
                enabled = stored.enabled,
                edgeStrength = stored.edgeStrength.coerceIn(0, 100),
                sheenStrength = stored.sheenStrength.coerceIn(0, 100),
                edgeCoverage = stored.edgeCoverage.coerceIn(0, 100),
                postersEnabled = stored.postersEnabled,
                continueWatchingEnabled = stored.continueWatchingEnabled,
                episodeCardsEnabled = stored.episodeCardsEnabled,
                castEnabled = stored.castEnabled,
                trailersEnabled = stored.trailersEnabled,
            )
        } else {
            CardDepthStyleUiState()
        }
    }

    private fun persist() {
        CardDepthStyleStorage.savePayload(
            json.encodeToString(
                StoredCardDepthStylePreferences(
                    enabled = _uiState.value.enabled,
                    edgeStrength = _uiState.value.edgeStrength,
                    sheenStrength = _uiState.value.sheenStrength,
                    edgeCoverage = _uiState.value.edgeCoverage,
                    postersEnabled = _uiState.value.postersEnabled,
                    continueWatchingEnabled = _uiState.value.continueWatchingEnabled,
                    episodeCardsEnabled = _uiState.value.episodeCardsEnabled,
                    castEnabled = _uiState.value.castEnabled,
                    trailersEnabled = _uiState.value.trailersEnabled,
                ),
            ),
        )
    }
}
