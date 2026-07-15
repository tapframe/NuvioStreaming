package com.nuvio.app.features.settings

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

internal object SentrySettingsRepository {
    val isSupported: Boolean
        get() = SentrySettingsPlatform.crashReportsSupported

    private val _enabled = MutableStateFlow(true)
    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()

    private var hasLoaded = false

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    private fun loadFromDisk() {
        hasLoaded = true
        _enabled.value = SentrySettingsStorage.loadEnabled() ?: true
    }

    fun setEnabled(enabled: Boolean) {
        ensureLoaded()
        if (_enabled.value == enabled) return
        _enabled.value = enabled
        SentrySettingsStorage.saveEnabled(enabled)
    }
}
