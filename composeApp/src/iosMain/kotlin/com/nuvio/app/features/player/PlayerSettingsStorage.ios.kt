package com.nuvio.app.features.player

import com.nuvio.app.core.sync.decodeSyncBoolean
import com.nuvio.app.core.sync.decodeSyncFloat
import com.nuvio.app.core.sync.decodeSyncInt
import com.nuvio.app.core.sync.decodeSyncString
import com.nuvio.app.core.sync.decodeSyncStringSet
import com.nuvio.app.core.sync.encodeSyncBoolean
import com.nuvio.app.core.sync.encodeSyncFloat
import com.nuvio.app.core.sync.encodeSyncInt
import com.nuvio.app.core.sync.encodeSyncString
import com.nuvio.app.core.sync.encodeSyncStringSet
import com.nuvio.app.core.storage.ProfileScopedKey
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import platform.Foundation.NSUserDefaults

actual object PlayerSettingsStorage {
    private const val showLoadingOverlayKey = "show_loading_overlay"
    private const val resizeModeKey = "resize_mode"
    private const val holdToSpeedEnabledKey = "hold_to_speed_enabled"
    private const val holdToSpeedValueKey = "hold_to_speed_value"
    private const val preferredAudioLanguageKey = "preferred_audio_language"
    private const val secondaryPreferredAudioLanguageKey = "secondary_preferred_audio_language"
    private const val preferredSubtitleLanguageKey = "preferred_subtitle_language"
    private const val secondaryPreferredSubtitleLanguageKey = "secondary_preferred_subtitle_language"
    private const val subtitleTextColorKey = "subtitle_text_color"
    private const val subtitleOutlineEnabledKey = "subtitle_outline_enabled"
    private const val subtitleFontSizeSpKey = "subtitle_font_size_sp"
    private const val subtitleBottomOffsetKey = "subtitle_bottom_offset"
    private const val streamReuseLastLinkEnabledKey = "stream_reuse_last_link_enabled"
    private const val streamReuseLastLinkCacheHoursKey = "stream_reuse_last_link_cache_hours"
    private const val decoderPriorityKey = "decoder_priority"
    private const val mapDV7ToHevcKey = "map_dv7_to_hevc"
    private const val tunnelingEnabledKey = "tunneling_enabled"
    private const val streamAutoPlayModeKey = "stream_auto_play_mode"
    private const val streamAutoPlaySourceKey = "stream_auto_play_source"
    private const val streamAutoPlaySelectedAddonsKey = "stream_auto_play_selected_addons"
    private const val streamAutoPlaySelectedPluginsKey = "stream_auto_play_selected_plugins"
    private const val streamAutoPlayRegexKey = "stream_auto_play_regex"
    private const val streamAutoPlayTimeoutSecondsKey = "stream_auto_play_timeout_seconds"
    private const val skipIntroEnabledKey = "skip_intro_enabled"
    private const val animeSkipEnabledKey = "animeskip_enabled"
    private const val animeSkipClientIdKey = "animeskip_client_id"
    private const val introDbApiKeyKey = "introdb_api_key"
    private const val introSubmitEnabledKey = "intro_submit_enabled"
    private const val streamAutoPlayNextEpisodeEnabledKey = "stream_auto_play_next_episode_enabled"
    private const val streamAutoPlayPreferBingeGroupKey = "stream_auto_play_prefer_binge_group"
    private const val nextEpisodeThresholdModeKey = "next_episode_threshold_mode"
    private const val nextEpisodeThresholdPercentKey = "next_episode_threshold_percent_v2"
    private const val nextEpisodeThresholdMinutesBeforeEndKey = "next_episode_threshold_minutes_before_end_v2"
    private const val useLibassKey = "use_libass"
    private const val libassRenderTypeKey = "libass_render_type"
    private val syncKeys = listOf(
        showLoadingOverlayKey,
        resizeModeKey,
        holdToSpeedEnabledKey,
        holdToSpeedValueKey,
        preferredAudioLanguageKey,
        secondaryPreferredAudioLanguageKey,
        preferredSubtitleLanguageKey,
        secondaryPreferredSubtitleLanguageKey,
        subtitleTextColorKey,
        subtitleOutlineEnabledKey,
        subtitleFontSizeSpKey,
        subtitleBottomOffsetKey,
        streamReuseLastLinkEnabledKey,
        streamReuseLastLinkCacheHoursKey,
        decoderPriorityKey,
        mapDV7ToHevcKey,
        tunnelingEnabledKey,
        streamAutoPlayModeKey,
        streamAutoPlaySourceKey,
        streamAutoPlaySelectedAddonsKey,
        streamAutoPlaySelectedPluginsKey,
        streamAutoPlayRegexKey,
        streamAutoPlayTimeoutSecondsKey,
        skipIntroEnabledKey,
        animeSkipEnabledKey,
        animeSkipClientIdKey,
        streamAutoPlayNextEpisodeEnabledKey,
        streamAutoPlayPreferBingeGroupKey,
        nextEpisodeThresholdModeKey,
        nextEpisodeThresholdPercentKey,
        nextEpisodeThresholdMinutesBeforeEndKey,
        useLibassKey,
        libassRenderTypeKey,
    )

    actual fun loadShowLoadingOverlay(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(showLoadingOverlayKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveShowLoadingOverlay(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(showLoadingOverlayKey))
    }

    actual fun loadResizeMode(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(resizeModeKey)
        return defaults.stringForKey(key)
    }

    actual fun saveResizeMode(mode: String) {
        NSUserDefaults.standardUserDefaults.setObject(mode, forKey = ProfileScopedKey.of(resizeModeKey))
    }

    actual fun loadHoldToSpeedEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(holdToSpeedEnabledKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveHoldToSpeedEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(holdToSpeedEnabledKey))
    }

    actual fun loadHoldToSpeedValue(): Float? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(holdToSpeedValueKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.floatForKey(key)
        } else {
            null
        }
    }

    actual fun saveHoldToSpeedValue(speed: Float) {
        NSUserDefaults.standardUserDefaults.setFloat(speed, forKey = ProfileScopedKey.of(holdToSpeedValueKey))
    }

    actual fun loadPreferredAudioLanguage(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(preferredAudioLanguageKey)
        return defaults.stringForKey(key)
    }

    actual fun savePreferredAudioLanguage(language: String) {
        NSUserDefaults.standardUserDefaults.setObject(language, forKey = ProfileScopedKey.of(preferredAudioLanguageKey))
    }

    actual fun loadSecondaryPreferredAudioLanguage(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(secondaryPreferredAudioLanguageKey)
        return defaults.stringForKey(key)
    }

    actual fun saveSecondaryPreferredAudioLanguage(language: String?) {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(secondaryPreferredAudioLanguageKey)
        if (language.isNullOrBlank()) {
            defaults.removeObjectForKey(key)
        } else {
            defaults.setObject(language, forKey = key)
        }
    }

    actual fun loadPreferredSubtitleLanguage(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(preferredSubtitleLanguageKey)
        return defaults.stringForKey(key)
    }

    actual fun savePreferredSubtitleLanguage(language: String) {
        NSUserDefaults.standardUserDefaults.setObject(language, forKey = ProfileScopedKey.of(preferredSubtitleLanguageKey))
    }

    actual fun loadSecondaryPreferredSubtitleLanguage(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(secondaryPreferredSubtitleLanguageKey)
        return defaults.stringForKey(key)
    }

    actual fun saveSecondaryPreferredSubtitleLanguage(language: String?) {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(secondaryPreferredSubtitleLanguageKey)
        if (language.isNullOrBlank()) {
            defaults.removeObjectForKey(key)
        } else {
            defaults.setObject(language, forKey = key)
        }
    }

    actual fun loadSubtitleTextColor(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(subtitleTextColorKey)
        return defaults.stringForKey(key)
    }

    actual fun saveSubtitleTextColor(colorHex: String) {
        NSUserDefaults.standardUserDefaults.setObject(colorHex, forKey = ProfileScopedKey.of(subtitleTextColorKey))
    }

    actual fun loadSubtitleOutlineEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(subtitleOutlineEnabledKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveSubtitleOutlineEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(subtitleOutlineEnabledKey))
    }

    actual fun loadSubtitleFontSizeSp(): Int? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(subtitleFontSizeSpKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.integerForKey(key).toInt()
        } else {
            null
        }
    }

    actual fun saveSubtitleFontSizeSp(fontSizeSp: Int) {
        NSUserDefaults.standardUserDefaults.setInteger(fontSizeSp.toLong(), forKey = ProfileScopedKey.of(subtitleFontSizeSpKey))
    }

    actual fun loadSubtitleBottomOffset(): Int? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(subtitleBottomOffsetKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.integerForKey(key).toInt()
        } else {
            null
        }
    }

    actual fun saveSubtitleBottomOffset(bottomOffset: Int) {
        NSUserDefaults.standardUserDefaults.setInteger(bottomOffset.toLong(), forKey = ProfileScopedKey.of(subtitleBottomOffsetKey))
    }

    actual fun loadStreamReuseLastLinkEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamReuseLastLinkEnabledKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveStreamReuseLastLinkEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(streamReuseLastLinkEnabledKey))
    }

    actual fun loadStreamReuseLastLinkCacheHours(): Int? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamReuseLastLinkCacheHoursKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.integerForKey(key).toInt()
        } else {
            null
        }
    }

    actual fun saveStreamReuseLastLinkCacheHours(hours: Int) {
        NSUserDefaults.standardUserDefaults.setInteger(hours.toLong(), forKey = ProfileScopedKey.of(streamReuseLastLinkCacheHoursKey))
    }

    actual fun loadDecoderPriority(): Int? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(decoderPriorityKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.integerForKey(key).toInt()
        } else {
            null
        }
    }

    actual fun saveDecoderPriority(priority: Int) {
        NSUserDefaults.standardUserDefaults.setInteger(priority.toLong(), forKey = ProfileScopedKey.of(decoderPriorityKey))
    }

    actual fun loadMapDV7ToHevc(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(mapDV7ToHevcKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveMapDV7ToHevc(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(mapDV7ToHevcKey))
    }

    actual fun loadTunnelingEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(tunnelingEnabledKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveTunnelingEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(tunnelingEnabledKey))
    }

    actual fun loadStreamAutoPlayMode(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamAutoPlayModeKey)
        return defaults.stringForKey(key)
    }

    actual fun saveStreamAutoPlayMode(mode: String) {
        NSUserDefaults.standardUserDefaults.setObject(mode, forKey = ProfileScopedKey.of(streamAutoPlayModeKey))
    }

    actual fun loadStreamAutoPlaySource(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamAutoPlaySourceKey)
        return defaults.stringForKey(key)
    }

    actual fun saveStreamAutoPlaySource(source: String) {
        NSUserDefaults.standardUserDefaults.setObject(source, forKey = ProfileScopedKey.of(streamAutoPlaySourceKey))
    }

    @Suppress("UNCHECKED_CAST")
    actual fun loadStreamAutoPlaySelectedAddons(): Set<String>? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamAutoPlaySelectedAddonsKey)
        val array = defaults.arrayForKey(key) as? List<String> ?: return null
        return array.toSet()
    }

    actual fun saveStreamAutoPlaySelectedAddons(addons: Set<String>) {
        NSUserDefaults.standardUserDefaults.setObject(addons.toList(), forKey = ProfileScopedKey.of(streamAutoPlaySelectedAddonsKey))
    }

    @Suppress("UNCHECKED_CAST")
    actual fun loadStreamAutoPlaySelectedPlugins(): Set<String>? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamAutoPlaySelectedPluginsKey)
        val array = defaults.arrayForKey(key) as? List<String> ?: return null
        return array.toSet()
    }

    actual fun saveStreamAutoPlaySelectedPlugins(plugins: Set<String>) {
        NSUserDefaults.standardUserDefaults.setObject(plugins.toList(), forKey = ProfileScopedKey.of(streamAutoPlaySelectedPluginsKey))
    }

    actual fun loadStreamAutoPlayRegex(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamAutoPlayRegexKey)
        return defaults.stringForKey(key)
    }

    actual fun saveStreamAutoPlayRegex(regex: String) {
        NSUserDefaults.standardUserDefaults.setObject(regex, forKey = ProfileScopedKey.of(streamAutoPlayRegexKey))
    }

    actual fun loadStreamAutoPlayTimeoutSeconds(): Int? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamAutoPlayTimeoutSecondsKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.integerForKey(key).toInt()
        } else {
            null
        }
    }

    actual fun saveStreamAutoPlayTimeoutSeconds(seconds: Int) {
        NSUserDefaults.standardUserDefaults.setInteger(seconds.toLong(), forKey = ProfileScopedKey.of(streamAutoPlayTimeoutSecondsKey))
    }

    actual fun loadSkipIntroEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(skipIntroEnabledKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveSkipIntroEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(skipIntroEnabledKey))
    }

    actual fun loadAnimeSkipEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(animeSkipEnabledKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveAnimeSkipEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(animeSkipEnabledKey))
    }

    actual fun loadAnimeSkipClientId(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(animeSkipClientIdKey)
        return defaults.stringForKey(key)
    }

    actual fun saveAnimeSkipClientId(clientId: String) {
        NSUserDefaults.standardUserDefaults.setObject(clientId, forKey = ProfileScopedKey.of(animeSkipClientIdKey))
    }

    actual fun loadIntroDbApiKey(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(introDbApiKeyKey)
        return defaults.stringForKey(key)
    }

    actual fun saveIntroDbApiKey(apiKey: String) {
        NSUserDefaults.standardUserDefaults.setObject(apiKey, forKey = ProfileScopedKey.of(introDbApiKeyKey))
    }

    actual fun loadIntroSubmitEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(introSubmitEnabledKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveIntroSubmitEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(introSubmitEnabledKey))
    }

    actual fun loadStreamAutoPlayNextEpisodeEnabled(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamAutoPlayNextEpisodeEnabledKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveStreamAutoPlayNextEpisodeEnabled(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(streamAutoPlayNextEpisodeEnabledKey))
    }

    actual fun loadStreamAutoPlayPreferBingeGroup(): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(streamAutoPlayPreferBingeGroupKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.boolForKey(key)
        } else {
            null
        }
    }

    actual fun saveStreamAutoPlayPreferBingeGroup(enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(streamAutoPlayPreferBingeGroupKey))
    }

    actual fun loadNextEpisodeThresholdMode(): String? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(nextEpisodeThresholdModeKey)
        return defaults.stringForKey(key)
    }

    actual fun saveNextEpisodeThresholdMode(mode: String) {
        NSUserDefaults.standardUserDefaults.setObject(mode, forKey = ProfileScopedKey.of(nextEpisodeThresholdModeKey))
    }

    actual fun loadNextEpisodeThresholdPercent(): Float? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(nextEpisodeThresholdPercentKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.floatForKey(key)
        } else {
            null
        }
    }

    actual fun saveNextEpisodeThresholdPercent(percent: Float) {
        NSUserDefaults.standardUserDefaults.setFloat(percent, forKey = ProfileScopedKey.of(nextEpisodeThresholdPercentKey))
    }

    actual fun loadNextEpisodeThresholdMinutesBeforeEnd(): Float? {
        val defaults = NSUserDefaults.standardUserDefaults
        val key = ProfileScopedKey.of(nextEpisodeThresholdMinutesBeforeEndKey)
        return if (defaults.objectForKey(key) != null) {
            defaults.floatForKey(key)
        } else {
            null
        }
    }

    actual fun saveNextEpisodeThresholdMinutesBeforeEnd(minutes: Float) {
        NSUserDefaults.standardUserDefaults.setFloat(minutes, forKey = ProfileScopedKey.of(nextEpisodeThresholdMinutesBeforeEndKey))
    }

    actual fun loadUseLibass(): Boolean? = null

    actual fun saveUseLibass(enabled: Boolean) {}

    actual fun loadLibassRenderType(): String? = null

    actual fun saveLibassRenderType(renderType: String) {}

    actual fun exportToSyncPayload(): JsonObject = buildJsonObject {
        loadShowLoadingOverlay()?.let { put(showLoadingOverlayKey, encodeSyncBoolean(it)) }
        loadResizeMode()?.let { put(resizeModeKey, encodeSyncString(it)) }
        loadHoldToSpeedEnabled()?.let { put(holdToSpeedEnabledKey, encodeSyncBoolean(it)) }
        loadHoldToSpeedValue()?.let { put(holdToSpeedValueKey, encodeSyncFloat(it)) }
        loadPreferredAudioLanguage()?.let { put(preferredAudioLanguageKey, encodeSyncString(it)) }
        loadSecondaryPreferredAudioLanguage()?.let { put(secondaryPreferredAudioLanguageKey, encodeSyncString(it)) }
        loadPreferredSubtitleLanguage()?.let { put(preferredSubtitleLanguageKey, encodeSyncString(it)) }
        loadSecondaryPreferredSubtitleLanguage()?.let { put(secondaryPreferredSubtitleLanguageKey, encodeSyncString(it)) }
        loadSubtitleTextColor()?.let { put(subtitleTextColorKey, encodeSyncString(it)) }
        loadSubtitleOutlineEnabled()?.let { put(subtitleOutlineEnabledKey, encodeSyncBoolean(it)) }
        loadSubtitleFontSizeSp()?.let { put(subtitleFontSizeSpKey, encodeSyncInt(it)) }
        loadSubtitleBottomOffset()?.let { put(subtitleBottomOffsetKey, encodeSyncInt(it)) }
        loadStreamReuseLastLinkEnabled()?.let { put(streamReuseLastLinkEnabledKey, encodeSyncBoolean(it)) }
        loadStreamReuseLastLinkCacheHours()?.let { put(streamReuseLastLinkCacheHoursKey, encodeSyncInt(it)) }
        loadDecoderPriority()?.let { put(decoderPriorityKey, encodeSyncInt(it)) }
        loadMapDV7ToHevc()?.let { put(mapDV7ToHevcKey, encodeSyncBoolean(it)) }
        loadTunnelingEnabled()?.let { put(tunnelingEnabledKey, encodeSyncBoolean(it)) }
        loadStreamAutoPlayMode()?.let { put(streamAutoPlayModeKey, encodeSyncString(it)) }
        loadStreamAutoPlaySource()?.let { put(streamAutoPlaySourceKey, encodeSyncString(it)) }
        loadStreamAutoPlaySelectedAddons()?.let { put(streamAutoPlaySelectedAddonsKey, encodeSyncStringSet(it)) }
        loadStreamAutoPlaySelectedPlugins()?.let { put(streamAutoPlaySelectedPluginsKey, encodeSyncStringSet(it)) }
        loadStreamAutoPlayRegex()?.let { put(streamAutoPlayRegexKey, encodeSyncString(it)) }
        loadStreamAutoPlayTimeoutSeconds()?.let { put(streamAutoPlayTimeoutSecondsKey, encodeSyncInt(it)) }
        loadSkipIntroEnabled()?.let { put(skipIntroEnabledKey, encodeSyncBoolean(it)) }
        loadAnimeSkipEnabled()?.let { put(animeSkipEnabledKey, encodeSyncBoolean(it)) }
        loadAnimeSkipClientId()?.let { put(animeSkipClientIdKey, encodeSyncString(it)) }
        loadStreamAutoPlayNextEpisodeEnabled()?.let { put(streamAutoPlayNextEpisodeEnabledKey, encodeSyncBoolean(it)) }
        loadStreamAutoPlayPreferBingeGroup()?.let { put(streamAutoPlayPreferBingeGroupKey, encodeSyncBoolean(it)) }
        loadNextEpisodeThresholdMode()?.let { put(nextEpisodeThresholdModeKey, encodeSyncString(it)) }
        loadNextEpisodeThresholdPercent()?.let { put(nextEpisodeThresholdPercentKey, encodeSyncFloat(it)) }
        loadNextEpisodeThresholdMinutesBeforeEnd()?.let { put(nextEpisodeThresholdMinutesBeforeEndKey, encodeSyncFloat(it)) }
        loadUseLibass()?.let { put(useLibassKey, encodeSyncBoolean(it)) }
        loadLibassRenderType()?.let { put(libassRenderTypeKey, encodeSyncString(it)) }
    }

    actual fun replaceFromSyncPayload(payload: JsonObject) {
        syncKeys.forEach { key ->
            NSUserDefaults.standardUserDefaults.removeObjectForKey(ProfileScopedKey.of(key))
        }

        payload.decodeSyncBoolean(showLoadingOverlayKey)?.let(::saveShowLoadingOverlay)
        payload.decodeSyncString(resizeModeKey)?.let(::saveResizeMode)
        payload.decodeSyncBoolean(holdToSpeedEnabledKey)?.let(::saveHoldToSpeedEnabled)
        payload.decodeSyncFloat(holdToSpeedValueKey)?.let(::saveHoldToSpeedValue)
        payload.decodeSyncString(preferredAudioLanguageKey)?.let(::savePreferredAudioLanguage)
        payload.decodeSyncString(secondaryPreferredAudioLanguageKey)?.let(::saveSecondaryPreferredAudioLanguage)
        payload.decodeSyncString(preferredSubtitleLanguageKey)?.let(::savePreferredSubtitleLanguage)
        payload.decodeSyncString(secondaryPreferredSubtitleLanguageKey)?.let(::saveSecondaryPreferredSubtitleLanguage)
        payload.decodeSyncString(subtitleTextColorKey)?.let(::saveSubtitleTextColor)
        payload.decodeSyncBoolean(subtitleOutlineEnabledKey)?.let(::saveSubtitleOutlineEnabled)
        payload.decodeSyncInt(subtitleFontSizeSpKey)?.let(::saveSubtitleFontSizeSp)
        payload.decodeSyncInt(subtitleBottomOffsetKey)?.let(::saveSubtitleBottomOffset)
        payload.decodeSyncBoolean(streamReuseLastLinkEnabledKey)?.let(::saveStreamReuseLastLinkEnabled)
        payload.decodeSyncInt(streamReuseLastLinkCacheHoursKey)?.let(::saveStreamReuseLastLinkCacheHours)
        payload.decodeSyncInt(decoderPriorityKey)?.let(::saveDecoderPriority)
        payload.decodeSyncBoolean(mapDV7ToHevcKey)?.let(::saveMapDV7ToHevc)
        payload.decodeSyncBoolean(tunnelingEnabledKey)?.let(::saveTunnelingEnabled)
        payload.decodeSyncString(streamAutoPlayModeKey)?.let(::saveStreamAutoPlayMode)
        payload.decodeSyncString(streamAutoPlaySourceKey)?.let(::saveStreamAutoPlaySource)
        payload.decodeSyncStringSet(streamAutoPlaySelectedAddonsKey)?.let(::saveStreamAutoPlaySelectedAddons)
        payload.decodeSyncStringSet(streamAutoPlaySelectedPluginsKey)?.let(::saveStreamAutoPlaySelectedPlugins)
        payload.decodeSyncString(streamAutoPlayRegexKey)?.let(::saveStreamAutoPlayRegex)
        payload.decodeSyncInt(streamAutoPlayTimeoutSecondsKey)?.let(::saveStreamAutoPlayTimeoutSeconds)
        payload.decodeSyncBoolean(skipIntroEnabledKey)?.let(::saveSkipIntroEnabled)
        payload.decodeSyncBoolean(animeSkipEnabledKey)?.let(::saveAnimeSkipEnabled)
        payload.decodeSyncString(animeSkipClientIdKey)?.let(::saveAnimeSkipClientId)
        payload.decodeSyncString(introDbApiKeyKey)?.let(::saveIntroDbApiKey)
        payload.decodeSyncBoolean(streamAutoPlayNextEpisodeEnabledKey)?.let(::saveStreamAutoPlayNextEpisodeEnabled)
        payload.decodeSyncBoolean(streamAutoPlayPreferBingeGroupKey)?.let(::saveStreamAutoPlayPreferBingeGroup)
        payload.decodeSyncString(nextEpisodeThresholdModeKey)?.let(::saveNextEpisodeThresholdMode)
        payload.decodeSyncFloat(nextEpisodeThresholdPercentKey)?.let(::saveNextEpisodeThresholdPercent)
        payload.decodeSyncFloat(nextEpisodeThresholdMinutesBeforeEndKey)?.let(::saveNextEpisodeThresholdMinutesBeforeEnd)
        payload.decodeSyncBoolean(useLibassKey)?.let(::saveUseLibass)
        payload.decodeSyncString(libassRenderTypeKey)?.let(::saveLibassRenderType)
    }
}
