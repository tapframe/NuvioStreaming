package com.nuvio.app.features.debrid

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object DebridSettingsRepository {
    private val _uiState = MutableStateFlow(DebridSettings())
    val uiState: StateFlow<DebridSettings> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var enabled = false
    private var torboxApiKey = ""
    private var realDebridApiKey = ""
    private var instantPlaybackPreparationLimit = 0
    private var streamNameTemplate = DebridStreamFormatterDefaults.NAME_TEMPLATE
    private var streamDescriptionTemplate = DebridStreamFormatterDefaults.DESCRIPTION_TEMPLATE

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun snapshot(): DebridSettings {
        ensureLoaded()
        return _uiState.value
    }

    fun setEnabled(value: Boolean) {
        ensureLoaded()
        if (value && !hasVisibleApiKey()) return
        if (enabled == value) return
        enabled = value
        publish()
        DebridSettingsStorage.saveEnabled(value)
    }

    fun setTorboxApiKey(value: String) {
        ensureLoaded()
        val normalized = value.trim()
        if (torboxApiKey == normalized) return
        torboxApiKey = normalized
        disableIfNoKeys()
        publish()
        DebridSettingsStorage.saveTorboxApiKey(normalized)
    }

    fun setRealDebridApiKey(value: String) {
        ensureLoaded()
        val normalized = value.trim()
        if (realDebridApiKey == normalized) return
        realDebridApiKey = normalized
        disableIfNoKeys()
        publish()
        DebridSettingsStorage.saveRealDebridApiKey(normalized)
    }

    fun setInstantPlaybackPreparationLimit(value: Int) {
        ensureLoaded()
        val normalized = normalizeDebridInstantPlaybackPreparationLimit(value)
        if (instantPlaybackPreparationLimit == normalized) return
        instantPlaybackPreparationLimit = normalized
        publish()
        DebridSettingsStorage.saveInstantPlaybackPreparationLimit(normalized)
    }

    fun setStreamNameTemplate(value: String) {
        ensureLoaded()
        val normalized = value.ifBlank { DebridStreamFormatterDefaults.NAME_TEMPLATE }
        if (streamNameTemplate == normalized) return
        streamNameTemplate = normalized
        publish()
        DebridSettingsStorage.saveStreamNameTemplate(normalized)
    }

    fun setStreamDescriptionTemplate(value: String) {
        ensureLoaded()
        val normalized = value.ifBlank { DebridStreamFormatterDefaults.DESCRIPTION_TEMPLATE }
        if (streamDescriptionTemplate == normalized) return
        streamDescriptionTemplate = normalized
        publish()
        DebridSettingsStorage.saveStreamDescriptionTemplate(normalized)
    }

    fun resetStreamTemplates() {
        ensureLoaded()
        streamNameTemplate = DebridStreamFormatterDefaults.NAME_TEMPLATE
        streamDescriptionTemplate = DebridStreamFormatterDefaults.DESCRIPTION_TEMPLATE
        publish()
        DebridSettingsStorage.saveStreamNameTemplate(streamNameTemplate)
        DebridSettingsStorage.saveStreamDescriptionTemplate(streamDescriptionTemplate)
    }

    private fun disableIfNoKeys() {
        if (!hasVisibleApiKey()) {
            enabled = false
            DebridSettingsStorage.saveEnabled(false)
        }
    }

    private fun hasVisibleApiKey(): Boolean =
        (DebridProviders.isVisible(DebridProviders.TORBOX_ID) && torboxApiKey.isNotBlank()) ||
            (DebridProviders.isVisible(DebridProviders.REAL_DEBRID_ID) && realDebridApiKey.isNotBlank())

    private fun loadFromDisk() {
        hasLoaded = true
        torboxApiKey = DebridSettingsStorage.loadTorboxApiKey()?.trim().orEmpty()
        realDebridApiKey = DebridSettingsStorage.loadRealDebridApiKey()?.trim().orEmpty()
        enabled = (DebridSettingsStorage.loadEnabled() ?: false) && hasVisibleApiKey()
        instantPlaybackPreparationLimit = normalizeDebridInstantPlaybackPreparationLimit(
            DebridSettingsStorage.loadInstantPlaybackPreparationLimit() ?: 0,
        )
        streamNameTemplate = DebridSettingsStorage.loadStreamNameTemplate()
            ?.takeIf { it.isNotBlank() }
            ?: DebridStreamFormatterDefaults.NAME_TEMPLATE
        streamDescriptionTemplate = DebridSettingsStorage.loadStreamDescriptionTemplate()
            ?.takeIf { it.isNotBlank() }
            ?: DebridStreamFormatterDefaults.DESCRIPTION_TEMPLATE
        publish()
    }

    private fun publish() {
        _uiState.value = DebridSettings(
            enabled = enabled,
            torboxApiKey = torboxApiKey,
            realDebridApiKey = realDebridApiKey,
            instantPlaybackPreparationLimit = instantPlaybackPreparationLimit,
            streamNameTemplate = streamNameTemplate,
            streamDescriptionTemplate = streamDescriptionTemplate,
        )
    }
}
