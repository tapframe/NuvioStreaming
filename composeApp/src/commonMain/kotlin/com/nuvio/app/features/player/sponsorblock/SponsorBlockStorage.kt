package com.nuvio.app.features.player.sponsorblock

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-memory settings holder for SponsorBlock.
 *
 * Follows the same pattern as [PlayerSettingsRepository]: a single StateFlow
 * of an immutable data class that the UI observes, with mutation methods
 * that emit new snapshots.
 *
 * Persistence is handled by the platform-specific PlayerSettingsStorage
 * via dedicated load/save functions added to the expect/actual contract.
 * Until those are wired, settings default to disabled and are session-scoped.
 */
object SponsorBlockSettingsRepository {

    private val _settings = MutableStateFlow(SponsorBlockSettings())
    val settings: StateFlow<SponsorBlockSettings> = _settings.asStateFlow()

    fun load(settings: SponsorBlockSettings) {
        _settings.value = settings
    }

    fun setEnabled(enabled: Boolean) {
        _settings.value = _settings.value.copy(enabled = enabled)
        SponsorBlockRepository.clearCache()
    }

    fun setAutoSkip(autoSkip: Boolean) {
        _settings.value = _settings.value.copy(autoSkip = autoSkip)
    }

    fun setShowSkipButton(show: Boolean) {
        _settings.value = _settings.value.copy(showSkipButton = show)
    }

    fun setShowNotification(show: Boolean) {
        _settings.value = _settings.value.copy(showNotification = show)
    }

    fun setUsePrivacyApi(usePrivacy: Boolean) {
        _settings.value = _settings.value.copy(usePrivacyApi = usePrivacy)
        SponsorBlockRepository.clearCache()
    }

    fun toggleCategory(category: SponsorBlockCategory) {
        val current = _settings.value.categories
        val updated = if (category in current) {
            current - category
        } else {
            current + category
        }
        _settings.value = _settings.value.copy(categories = updated)
        SponsorBlockRepository.clearCache()
    }

    fun setCategories(categories: Set<SponsorBlockCategory>) {
        _settings.value = _settings.value.copy(categories = categories)
        SponsorBlockRepository.clearCache()
    }
}
