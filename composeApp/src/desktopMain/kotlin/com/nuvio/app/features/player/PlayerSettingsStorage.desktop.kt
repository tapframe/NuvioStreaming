package com.nuvio.app.features.player

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey
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
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal actual object PlayerSettingsStorage {
    private const val showLoadingOverlayKey = "show_loading_overlay"
    private const val resizeModeKey = "resize_mode"
    private const val holdToSpeedEnabledKey = "hold_to_speed_enabled"
    private const val holdToSpeedValueKey = "hold_to_speed_value"
    private const val externalPlayerEnabledKey = "external_player_enabled"
    private const val externalPlayerForwardSubtitlesKey = "external_player_forward_subtitles"
    private const val externalPlayerIdKey = "external_player_id"
    private const val preferredAudioLanguageKey = "preferred_audio_language"
    private const val secondaryPreferredAudioLanguageKey = "secondary_preferred_audio_language"
    private const val preferredSubtitleLanguageKey = "preferred_subtitle_language"
    private const val secondaryPreferredSubtitleLanguageKey = "secondary_preferred_subtitle_language"
    private const val subtitleTextColorKey = "subtitle_text_color"
    private const val subtitleBackgroundColorKey = "subtitle_background_color"
    private const val subtitleOutlineColorKey = "subtitle_outline_color"
    private const val subtitleOutlineEnabledKey = "subtitle_outline_enabled"
    private const val subtitleOutlineWidthKey = "subtitle_outline_width"
    private const val subtitleBoldKey = "subtitle_bold"
    private const val subtitleFontSizeSpKey = "subtitle_font_size_sp"
    private const val subtitleBottomOffsetKey = "subtitle_bottom_offset"
    private const val subtitleUseForcedSubtitlesKey = "subtitle_use_forced_subtitles"
    private const val subtitleShowOnlyPreferredLanguagesKey = "subtitle_show_only_preferred_languages"
    private const val addonSubtitleStartupModeKey = "addon_subtitle_startup_mode"
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
    private const val streamAutoPlayReuseBingeGroupKey = "stream_auto_play_reuse_binge_group"
    private const val nextEpisodeThresholdModeKey = "next_episode_threshold_mode"
    private const val nextEpisodeThresholdPercentKey = "next_episode_threshold_percent_v2"
    private const val nextEpisodeThresholdMinutesBeforeEndKey = "next_episode_threshold_minutes_before_end_v2"
    private const val useLibassKey = "use_libass"
    private const val libassRenderTypeKey = "libass_render_type"
    private const val iosVideoOutputPresetKey = "ios_video_output_preset"
    private const val iosToneMappingModeKey = "ios_tone_mapping_mode"
    private const val iosTargetPrimariesKey = "ios_target_primaries"
    private const val iosTargetTransferKey = "ios_target_transfer"
    private const val iosHardwareDecoderModeKey = "ios_hardware_decoder_mode"
    private const val iosAudioOutputModeKey = "ios_audio_output_mode"
    private const val iosExtendedDynamicRangeEnabledKey = "ios_extended_dynamic_range_enabled"
    private const val iosTargetColorspaceHintEnabledKey = "ios_target_colorspace_hint_enabled"
    private const val iosHdrComputePeakEnabledKey = "ios_hdr_compute_peak_enabled"
    private const val iosDebandEnabledKey = "ios_deband_enabled"
    private const val iosInterpolationEnabledKey = "ios_interpolation_enabled"
    private const val iosBrightnessKey = "ios_brightness"
    private const val iosContrastKey = "ios_contrast"
    private const val iosSaturationKey = "ios_saturation"
    private const val iosGammaKey = "ios_gamma"
    private val syncKeys = listOf(
        showLoadingOverlayKey,
        resizeModeKey,
        holdToSpeedEnabledKey,
        holdToSpeedValueKey,
        externalPlayerEnabledKey,
        externalPlayerForwardSubtitlesKey,
        externalPlayerIdKey,
        preferredAudioLanguageKey,
        secondaryPreferredAudioLanguageKey,
        preferredSubtitleLanguageKey,
        secondaryPreferredSubtitleLanguageKey,
        subtitleTextColorKey,
        subtitleBackgroundColorKey,
        subtitleOutlineColorKey,
        subtitleOutlineEnabledKey,
        subtitleOutlineWidthKey,
        subtitleBoldKey,
        subtitleFontSizeSpKey,
        subtitleBottomOffsetKey,
        subtitleUseForcedSubtitlesKey,
        subtitleShowOnlyPreferredLanguagesKey,
        addonSubtitleStartupModeKey,
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
        streamAutoPlayReuseBingeGroupKey,
        nextEpisodeThresholdModeKey,
        nextEpisodeThresholdPercentKey,
        nextEpisodeThresholdMinutesBeforeEndKey,
        useLibassKey,
        libassRenderTypeKey,
        iosVideoOutputPresetKey,
        iosToneMappingModeKey,
        iosTargetPrimariesKey,
        iosTargetTransferKey,
        iosHardwareDecoderModeKey,
        iosAudioOutputModeKey,
        iosExtendedDynamicRangeEnabledKey,
        iosTargetColorspaceHintEnabledKey,
        iosHdrComputePeakEnabledKey,
        iosDebandEnabledKey,
        iosInterpolationEnabledKey,
        iosBrightnessKey,
        iosContrastKey,
        iosSaturationKey,
        iosGammaKey,
    )
    private val store = DesktopStorage.store("nuvio_player_settings")

    actual fun loadShowLoadingOverlay(): Boolean? = loadBoolean(showLoadingOverlayKey)
    actual fun saveShowLoadingOverlay(enabled: Boolean) = saveBoolean(showLoadingOverlayKey, enabled)
    actual fun loadResizeMode(): String? = loadString(resizeModeKey)
    actual fun saveResizeMode(mode: String) = saveString(resizeModeKey, mode)
    actual fun loadHoldToSpeedEnabled(): Boolean? = loadBoolean(holdToSpeedEnabledKey)
    actual fun saveHoldToSpeedEnabled(enabled: Boolean) = saveBoolean(holdToSpeedEnabledKey, enabled)
    actual fun loadHoldToSpeedValue(): Float? = loadFloat(holdToSpeedValueKey)
    actual fun saveHoldToSpeedValue(speed: Float) = saveFloat(holdToSpeedValueKey, speed)
    actual fun loadExternalPlayerEnabled(): Boolean? = loadBoolean(externalPlayerEnabledKey)
    actual fun saveExternalPlayerEnabled(enabled: Boolean) = saveBoolean(externalPlayerEnabledKey, enabled)
    actual fun loadExternalPlayerForwardSubtitles(): Boolean? = loadBoolean(externalPlayerForwardSubtitlesKey)
    actual fun saveExternalPlayerForwardSubtitles(enabled: Boolean) = saveBoolean(externalPlayerForwardSubtitlesKey, enabled)
    actual fun loadExternalPlayerId(): String? = loadString(externalPlayerIdKey)
    actual fun saveExternalPlayerId(playerId: String?) = saveOptionalString(externalPlayerIdKey, playerId)
    actual fun loadPreferredAudioLanguage(): String? = loadString(preferredAudioLanguageKey)
    actual fun savePreferredAudioLanguage(language: String) = saveString(preferredAudioLanguageKey, language)
    actual fun loadSecondaryPreferredAudioLanguage(): String? = loadString(secondaryPreferredAudioLanguageKey)
    actual fun saveSecondaryPreferredAudioLanguage(language: String?) = saveOptionalString(secondaryPreferredAudioLanguageKey, language)
    actual fun loadPreferredSubtitleLanguage(): String? = loadString(preferredSubtitleLanguageKey)
    actual fun savePreferredSubtitleLanguage(language: String) = saveString(preferredSubtitleLanguageKey, language)
    actual fun loadSecondaryPreferredSubtitleLanguage(): String? = loadString(secondaryPreferredSubtitleLanguageKey)
    actual fun saveSecondaryPreferredSubtitleLanguage(language: String?) = saveOptionalString(secondaryPreferredSubtitleLanguageKey, language)
    actual fun loadSubtitleTextColor(): String? = loadString(subtitleTextColorKey)
    actual fun saveSubtitleTextColor(colorHex: String) = saveString(subtitleTextColorKey, colorHex)
    actual fun loadSubtitleBackgroundColor(): String? = loadString(subtitleBackgroundColorKey)
    actual fun saveSubtitleBackgroundColor(colorHex: String) = saveString(subtitleBackgroundColorKey, colorHex)
    actual fun loadSubtitleOutlineColor(): String? = loadString(subtitleOutlineColorKey)
    actual fun saveSubtitleOutlineColor(colorHex: String) = saveString(subtitleOutlineColorKey, colorHex)
    actual fun loadSubtitleOutlineEnabled(): Boolean? = loadBoolean(subtitleOutlineEnabledKey)
    actual fun saveSubtitleOutlineEnabled(enabled: Boolean) = saveBoolean(subtitleOutlineEnabledKey, enabled)
    actual fun loadSubtitleOutlineWidth(): Int? = loadInt(subtitleOutlineWidthKey)
    actual fun saveSubtitleOutlineWidth(width: Int) = saveInt(subtitleOutlineWidthKey, width)
    actual fun loadSubtitleBold(): Boolean? = loadBoolean(subtitleBoldKey)
    actual fun saveSubtitleBold(enabled: Boolean) = saveBoolean(subtitleBoldKey, enabled)
    actual fun loadSubtitleFontSizeSp(): Int? = loadInt(subtitleFontSizeSpKey)
    actual fun saveSubtitleFontSizeSp(fontSizeSp: Int) = saveInt(subtitleFontSizeSpKey, fontSizeSp)
    actual fun loadSubtitleBottomOffset(): Int? = loadInt(subtitleBottomOffsetKey)
    actual fun saveSubtitleBottomOffset(bottomOffset: Int) = saveInt(subtitleBottomOffsetKey, bottomOffset)
    actual fun loadSubtitleUseForcedSubtitles(): Boolean? = loadBoolean(subtitleUseForcedSubtitlesKey)
    actual fun saveSubtitleUseForcedSubtitles(enabled: Boolean) = saveBoolean(subtitleUseForcedSubtitlesKey, enabled)
    actual fun loadSubtitleShowOnlyPreferredLanguages(): Boolean? = loadBoolean(subtitleShowOnlyPreferredLanguagesKey)
    actual fun saveSubtitleShowOnlyPreferredLanguages(enabled: Boolean) = saveBoolean(subtitleShowOnlyPreferredLanguagesKey, enabled)
    actual fun loadAddonSubtitleStartupMode(): String? = loadString(addonSubtitleStartupModeKey)
    actual fun saveAddonSubtitleStartupMode(mode: String) = saveString(addonSubtitleStartupModeKey, mode)
    actual fun loadStreamReuseLastLinkEnabled(): Boolean? = loadBoolean(streamReuseLastLinkEnabledKey)
    actual fun saveStreamReuseLastLinkEnabled(enabled: Boolean) = saveBoolean(streamReuseLastLinkEnabledKey, enabled)
    actual fun loadStreamReuseLastLinkCacheHours(): Int? = loadInt(streamReuseLastLinkCacheHoursKey)
    actual fun saveStreamReuseLastLinkCacheHours(hours: Int) = saveInt(streamReuseLastLinkCacheHoursKey, hours)
    actual fun loadDecoderPriority(): Int? = loadInt(decoderPriorityKey)
    actual fun saveDecoderPriority(priority: Int) = saveInt(decoderPriorityKey, priority)
    actual fun loadMapDV7ToHevc(): Boolean? = loadBoolean(mapDV7ToHevcKey)
    actual fun saveMapDV7ToHevc(enabled: Boolean) = saveBoolean(mapDV7ToHevcKey, enabled)
    actual fun loadTunnelingEnabled(): Boolean? = loadBoolean(tunnelingEnabledKey)
    actual fun saveTunnelingEnabled(enabled: Boolean) = saveBoolean(tunnelingEnabledKey, enabled)
    actual fun loadStreamAutoPlayMode(): String? = loadString(streamAutoPlayModeKey)
    actual fun saveStreamAutoPlayMode(mode: String) = saveString(streamAutoPlayModeKey, mode)
    actual fun loadStreamAutoPlaySource(): String? = loadString(streamAutoPlaySourceKey)
    actual fun saveStreamAutoPlaySource(source: String) = saveString(streamAutoPlaySourceKey, source)
    actual fun loadStreamAutoPlaySelectedAddons(): Set<String>? = loadStringSet(streamAutoPlaySelectedAddonsKey)
    actual fun saveStreamAutoPlaySelectedAddons(addons: Set<String>) = saveStringSet(streamAutoPlaySelectedAddonsKey, addons)
    actual fun loadStreamAutoPlaySelectedPlugins(): Set<String>? = loadStringSet(streamAutoPlaySelectedPluginsKey)
    actual fun saveStreamAutoPlaySelectedPlugins(plugins: Set<String>) = saveStringSet(streamAutoPlaySelectedPluginsKey, plugins)
    actual fun loadStreamAutoPlayRegex(): String? = loadString(streamAutoPlayRegexKey)
    actual fun saveStreamAutoPlayRegex(regex: String) = saveString(streamAutoPlayRegexKey, regex)
    actual fun loadStreamAutoPlayTimeoutSeconds(): Int? = loadInt(streamAutoPlayTimeoutSecondsKey)
    actual fun saveStreamAutoPlayTimeoutSeconds(seconds: Int) = saveInt(streamAutoPlayTimeoutSecondsKey, seconds)
    actual fun loadSkipIntroEnabled(): Boolean? = loadBoolean(skipIntroEnabledKey)
    actual fun saveSkipIntroEnabled(enabled: Boolean) = saveBoolean(skipIntroEnabledKey, enabled)
    actual fun loadAnimeSkipEnabled(): Boolean? = loadBoolean(animeSkipEnabledKey)
    actual fun saveAnimeSkipEnabled(enabled: Boolean) = saveBoolean(animeSkipEnabledKey, enabled)
    actual fun loadAnimeSkipClientId(): String? = loadString(animeSkipClientIdKey)
    actual fun saveAnimeSkipClientId(clientId: String) = saveString(animeSkipClientIdKey, clientId)
    actual fun loadIntroDbApiKey(): String? = loadString(introDbApiKeyKey)
    actual fun saveIntroDbApiKey(apiKey: String) = saveString(introDbApiKeyKey, apiKey)
    actual fun loadIntroSubmitEnabled(): Boolean? = loadBoolean(introSubmitEnabledKey)
    actual fun saveIntroSubmitEnabled(enabled: Boolean) = saveBoolean(introSubmitEnabledKey, enabled)
    actual fun loadStreamAutoPlayNextEpisodeEnabled(): Boolean? = loadBoolean(streamAutoPlayNextEpisodeEnabledKey)
    actual fun saveStreamAutoPlayNextEpisodeEnabled(enabled: Boolean) = saveBoolean(streamAutoPlayNextEpisodeEnabledKey, enabled)
    actual fun loadStreamAutoPlayPreferBingeGroup(): Boolean? = loadBoolean(streamAutoPlayPreferBingeGroupKey)
    actual fun saveStreamAutoPlayPreferBingeGroup(enabled: Boolean) = saveBoolean(streamAutoPlayPreferBingeGroupKey, enabled)
    actual fun loadStreamAutoPlayReuseBingeGroup(): Boolean? = loadBoolean(streamAutoPlayReuseBingeGroupKey)
    actual fun saveStreamAutoPlayReuseBingeGroup(enabled: Boolean) = saveBoolean(streamAutoPlayReuseBingeGroupKey, enabled)
    actual fun loadNextEpisodeThresholdMode(): String? = loadString(nextEpisodeThresholdModeKey)
    actual fun saveNextEpisodeThresholdMode(mode: String) = saveString(nextEpisodeThresholdModeKey, mode)
    actual fun loadNextEpisodeThresholdPercent(): Float? = loadFloat(nextEpisodeThresholdPercentKey)
    actual fun saveNextEpisodeThresholdPercent(percent: Float) = saveFloat(nextEpisodeThresholdPercentKey, percent)
    actual fun loadNextEpisodeThresholdMinutesBeforeEnd(): Float? = loadFloat(nextEpisodeThresholdMinutesBeforeEndKey)
    actual fun saveNextEpisodeThresholdMinutesBeforeEnd(minutes: Float) = saveFloat(nextEpisodeThresholdMinutesBeforeEndKey, minutes)
    actual fun loadUseLibass(): Boolean? = loadBoolean(useLibassKey)
    actual fun saveUseLibass(enabled: Boolean) = saveBoolean(useLibassKey, enabled)
    actual fun loadLibassRenderType(): String? = loadString(libassRenderTypeKey)
    actual fun saveLibassRenderType(renderType: String) = saveString(libassRenderTypeKey, renderType)
    actual fun loadIosVideoOutputPreset(): String? = loadString(iosVideoOutputPresetKey)
    actual fun saveIosVideoOutputPreset(preset: String) = saveString(iosVideoOutputPresetKey, preset)
    actual fun loadIosToneMappingMode(): String? = loadString(iosToneMappingModeKey)
    actual fun saveIosToneMappingMode(mode: String) = saveString(iosToneMappingModeKey, mode)
    actual fun loadIosTargetPrimaries(): String? = loadString(iosTargetPrimariesKey)
    actual fun saveIosTargetPrimaries(primaries: String) = saveString(iosTargetPrimariesKey, primaries)
    actual fun loadIosTargetTransfer(): String? = loadString(iosTargetTransferKey)
    actual fun saveIosTargetTransfer(transfer: String) = saveString(iosTargetTransferKey, transfer)
    actual fun loadIosHardwareDecoderMode(): String? = loadString(iosHardwareDecoderModeKey)
    actual fun saveIosHardwareDecoderMode(mode: String) = saveString(iosHardwareDecoderModeKey, mode)
    actual fun loadIosAudioOutputMode(): String? = loadString(iosAudioOutputModeKey)
    actual fun saveIosAudioOutputMode(mode: String) = saveString(iosAudioOutputModeKey, mode)
    actual fun loadIosExtendedDynamicRangeEnabled(): Boolean? = loadBoolean(iosExtendedDynamicRangeEnabledKey)
    actual fun saveIosExtendedDynamicRangeEnabled(enabled: Boolean) = saveBoolean(iosExtendedDynamicRangeEnabledKey, enabled)
    actual fun loadIosTargetColorspaceHintEnabled(): Boolean? = loadBoolean(iosTargetColorspaceHintEnabledKey)
    actual fun saveIosTargetColorspaceHintEnabled(enabled: Boolean) = saveBoolean(iosTargetColorspaceHintEnabledKey, enabled)
    actual fun loadIosHdrComputePeakEnabled(): Boolean? = loadBoolean(iosHdrComputePeakEnabledKey)
    actual fun saveIosHdrComputePeakEnabled(enabled: Boolean) = saveBoolean(iosHdrComputePeakEnabledKey, enabled)
    actual fun loadIosDebandEnabled(): Boolean? = loadBoolean(iosDebandEnabledKey)
    actual fun saveIosDebandEnabled(enabled: Boolean) = saveBoolean(iosDebandEnabledKey, enabled)
    actual fun loadIosInterpolationEnabled(): Boolean? = loadBoolean(iosInterpolationEnabledKey)
    actual fun saveIosInterpolationEnabled(enabled: Boolean) = saveBoolean(iosInterpolationEnabledKey, enabled)
    actual fun loadIosBrightness(): Int? = loadInt(iosBrightnessKey)
    actual fun saveIosBrightness(value: Int) = saveInt(iosBrightnessKey, value)
    actual fun loadIosContrast(): Int? = loadInt(iosContrastKey)
    actual fun saveIosContrast(value: Int) = saveInt(iosContrastKey, value)
    actual fun loadIosSaturation(): Int? = loadInt(iosSaturationKey)
    actual fun saveIosSaturation(value: Int) = saveInt(iosSaturationKey, value)
    actual fun loadIosGamma(): Int? = loadInt(iosGammaKey)
    actual fun saveIosGamma(value: Int) = saveInt(iosGammaKey, value)

    private fun scoped(key: String): String = ProfileScopedKey.of(key)
    private fun loadString(key: String): String? = store.getString(scoped(key))
    private fun saveString(key: String, value: String) = store.putString(scoped(key), value)
    private fun saveOptionalString(key: String, value: String?) = store.putString(scoped(key), value?.takeIf { it.isNotBlank() })
    private fun loadBoolean(key: String): Boolean? = store.getBoolean(scoped(key))
    private fun saveBoolean(key: String, value: Boolean) = store.putBoolean(scoped(key), value)
    private fun loadInt(key: String): Int? = store.getInt(scoped(key))
    private fun saveInt(key: String, value: Int) = store.putInt(scoped(key), value)
    private fun loadFloat(key: String): Float? = store.getFloat(scoped(key))
    private fun saveFloat(key: String, value: Float) = store.putFloat(scoped(key), value)
    private fun loadStringSet(key: String): Set<String>? = store.getStringSet(scoped(key))
    private fun saveStringSet(key: String, values: Set<String>) = store.putStringSet(scoped(key), values)

    actual fun exportToSyncPayload(): JsonObject = buildJsonObject {
        loadShowLoadingOverlay()?.let { put(showLoadingOverlayKey, encodeSyncBoolean(it)) }
        loadResizeMode()?.let { put(resizeModeKey, encodeSyncString(it)) }
        loadHoldToSpeedEnabled()?.let { put(holdToSpeedEnabledKey, encodeSyncBoolean(it)) }
        loadHoldToSpeedValue()?.let { put(holdToSpeedValueKey, encodeSyncFloat(it)) }
        loadExternalPlayerEnabled()?.let { put(externalPlayerEnabledKey, encodeSyncBoolean(it)) }
        loadExternalPlayerForwardSubtitles()?.let { put(externalPlayerForwardSubtitlesKey, encodeSyncBoolean(it)) }
        loadExternalPlayerId()?.let { put(externalPlayerIdKey, encodeSyncString(it)) }
        loadPreferredAudioLanguage()?.let { put(preferredAudioLanguageKey, encodeSyncString(it)) }
        loadSecondaryPreferredAudioLanguage()?.let { put(secondaryPreferredAudioLanguageKey, encodeSyncString(it)) }
        loadPreferredSubtitleLanguage()?.let { put(preferredSubtitleLanguageKey, encodeSyncString(it)) }
        loadSecondaryPreferredSubtitleLanguage()?.let { put(secondaryPreferredSubtitleLanguageKey, encodeSyncString(it)) }
        loadSubtitleTextColor()?.let { put(subtitleTextColorKey, encodeSyncString(it)) }
        loadSubtitleBackgroundColor()?.let { put(subtitleBackgroundColorKey, encodeSyncString(it)) }
        loadSubtitleOutlineColor()?.let { put(subtitleOutlineColorKey, encodeSyncString(it)) }
        loadSubtitleOutlineEnabled()?.let { put(subtitleOutlineEnabledKey, encodeSyncBoolean(it)) }
        loadSubtitleOutlineWidth()?.let { put(subtitleOutlineWidthKey, encodeSyncInt(it)) }
        loadSubtitleBold()?.let { put(subtitleBoldKey, encodeSyncBoolean(it)) }
        loadSubtitleFontSizeSp()?.let { put(subtitleFontSizeSpKey, encodeSyncInt(it)) }
        loadSubtitleBottomOffset()?.let { put(subtitleBottomOffsetKey, encodeSyncInt(it)) }
        loadSubtitleUseForcedSubtitles()?.let { put(subtitleUseForcedSubtitlesKey, encodeSyncBoolean(it)) }
        loadSubtitleShowOnlyPreferredLanguages()?.let { put(subtitleShowOnlyPreferredLanguagesKey, encodeSyncBoolean(it)) }
        loadAddonSubtitleStartupMode()?.let { put(addonSubtitleStartupModeKey, encodeSyncString(it)) }
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
        loadStreamAutoPlayReuseBingeGroup()?.let { put(streamAutoPlayReuseBingeGroupKey, encodeSyncBoolean(it)) }
        loadNextEpisodeThresholdMode()?.let { put(nextEpisodeThresholdModeKey, encodeSyncString(it)) }
        loadNextEpisodeThresholdPercent()?.let { put(nextEpisodeThresholdPercentKey, encodeSyncFloat(it)) }
        loadNextEpisodeThresholdMinutesBeforeEnd()?.let { put(nextEpisodeThresholdMinutesBeforeEndKey, encodeSyncFloat(it)) }
        loadUseLibass()?.let { put(useLibassKey, encodeSyncBoolean(it)) }
        loadLibassRenderType()?.let { put(libassRenderTypeKey, encodeSyncString(it)) }
        loadIosVideoOutputPreset()?.let { put(iosVideoOutputPresetKey, encodeSyncString(it)) }
        loadIosToneMappingMode()?.let { put(iosToneMappingModeKey, encodeSyncString(it)) }
        loadIosTargetPrimaries()?.let { put(iosTargetPrimariesKey, encodeSyncString(it)) }
        loadIosTargetTransfer()?.let { put(iosTargetTransferKey, encodeSyncString(it)) }
        loadIosHardwareDecoderMode()?.let { put(iosHardwareDecoderModeKey, encodeSyncString(it)) }
        loadIosAudioOutputMode()?.let { put(iosAudioOutputModeKey, encodeSyncString(it)) }
        loadIosExtendedDynamicRangeEnabled()?.let { put(iosExtendedDynamicRangeEnabledKey, encodeSyncBoolean(it)) }
        loadIosTargetColorspaceHintEnabled()?.let { put(iosTargetColorspaceHintEnabledKey, encodeSyncBoolean(it)) }
        loadIosHdrComputePeakEnabled()?.let { put(iosHdrComputePeakEnabledKey, encodeSyncBoolean(it)) }
        loadIosDebandEnabled()?.let { put(iosDebandEnabledKey, encodeSyncBoolean(it)) }
        loadIosInterpolationEnabled()?.let { put(iosInterpolationEnabledKey, encodeSyncBoolean(it)) }
        loadIosBrightness()?.let { put(iosBrightnessKey, encodeSyncInt(it)) }
        loadIosContrast()?.let { put(iosContrastKey, encodeSyncInt(it)) }
        loadIosSaturation()?.let { put(iosSaturationKey, encodeSyncInt(it)) }
        loadIosGamma()?.let { put(iosGammaKey, encodeSyncInt(it)) }
    }

    actual fun replaceFromSyncPayload(payload: JsonObject) {
        store.removeAll(syncKeys.map(::scoped))
        payload.decodeSyncBoolean(showLoadingOverlayKey)?.let(::saveShowLoadingOverlay)
        payload.decodeSyncString(resizeModeKey)?.let(::saveResizeMode)
        payload.decodeSyncBoolean(holdToSpeedEnabledKey)?.let(::saveHoldToSpeedEnabled)
        payload.decodeSyncFloat(holdToSpeedValueKey)?.let(::saveHoldToSpeedValue)
        payload.decodeSyncBoolean(externalPlayerEnabledKey)?.let(::saveExternalPlayerEnabled)
        payload.decodeSyncBoolean(externalPlayerForwardSubtitlesKey)?.let(::saveExternalPlayerForwardSubtitles)
        payload.decodeSyncString(externalPlayerIdKey)?.let(::saveExternalPlayerId)
        payload.decodeSyncString(preferredAudioLanguageKey)?.let(::savePreferredAudioLanguage)
        payload.decodeSyncString(secondaryPreferredAudioLanguageKey)?.let(::saveSecondaryPreferredAudioLanguage)
        payload.decodeSyncString(preferredSubtitleLanguageKey)?.let(::savePreferredSubtitleLanguage)
        payload.decodeSyncString(secondaryPreferredSubtitleLanguageKey)?.let(::saveSecondaryPreferredSubtitleLanguage)
        payload.decodeSyncString(subtitleTextColorKey)?.let(::saveSubtitleTextColor)
        payload.decodeSyncString(subtitleBackgroundColorKey)?.let(::saveSubtitleBackgroundColor)
        payload.decodeSyncString(subtitleOutlineColorKey)?.let(::saveSubtitleOutlineColor)
        payload.decodeSyncBoolean(subtitleOutlineEnabledKey)?.let(::saveSubtitleOutlineEnabled)
        payload.decodeSyncInt(subtitleOutlineWidthKey)?.let(::saveSubtitleOutlineWidth)
        payload.decodeSyncBoolean(subtitleBoldKey)?.let(::saveSubtitleBold)
        payload.decodeSyncInt(subtitleFontSizeSpKey)?.let(::saveSubtitleFontSizeSp)
        payload.decodeSyncInt(subtitleBottomOffsetKey)?.let(::saveSubtitleBottomOffset)
        payload.decodeSyncBoolean(subtitleUseForcedSubtitlesKey)?.let(::saveSubtitleUseForcedSubtitles)
        payload.decodeSyncBoolean(subtitleShowOnlyPreferredLanguagesKey)?.let(::saveSubtitleShowOnlyPreferredLanguages)
        payload.decodeSyncString(addonSubtitleStartupModeKey)?.let(::saveAddonSubtitleStartupMode)
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
        payload.decodeSyncBoolean(introSubmitEnabledKey)?.let(::saveIntroSubmitEnabled)
        payload.decodeSyncBoolean(streamAutoPlayNextEpisodeEnabledKey)?.let(::saveStreamAutoPlayNextEpisodeEnabled)
        payload.decodeSyncBoolean(streamAutoPlayPreferBingeGroupKey)?.let(::saveStreamAutoPlayPreferBingeGroup)
        payload.decodeSyncBoolean(streamAutoPlayReuseBingeGroupKey)?.let(::saveStreamAutoPlayReuseBingeGroup)
        payload.decodeSyncString(nextEpisodeThresholdModeKey)?.let(::saveNextEpisodeThresholdMode)
        payload.decodeSyncFloat(nextEpisodeThresholdPercentKey)?.let(::saveNextEpisodeThresholdPercent)
        payload.decodeSyncFloat(nextEpisodeThresholdMinutesBeforeEndKey)?.let(::saveNextEpisodeThresholdMinutesBeforeEnd)
        payload.decodeSyncBoolean(useLibassKey)?.let(::saveUseLibass)
        payload.decodeSyncString(libassRenderTypeKey)?.let(::saveLibassRenderType)
        payload.decodeSyncString(iosVideoOutputPresetKey)?.let(::saveIosVideoOutputPreset)
        payload.decodeSyncString(iosToneMappingModeKey)?.let(::saveIosToneMappingMode)
        payload.decodeSyncString(iosTargetPrimariesKey)?.let(::saveIosTargetPrimaries)
        payload.decodeSyncString(iosTargetTransferKey)?.let(::saveIosTargetTransfer)
        payload.decodeSyncString(iosHardwareDecoderModeKey)?.let(::saveIosHardwareDecoderMode)
        payload.decodeSyncString(iosAudioOutputModeKey)?.let(::saveIosAudioOutputMode)
        payload.decodeSyncBoolean(iosExtendedDynamicRangeEnabledKey)?.let(::saveIosExtendedDynamicRangeEnabled)
        payload.decodeSyncBoolean(iosTargetColorspaceHintEnabledKey)?.let(::saveIosTargetColorspaceHintEnabled)
        payload.decodeSyncBoolean(iosHdrComputePeakEnabledKey)?.let(::saveIosHdrComputePeakEnabled)
        payload.decodeSyncBoolean(iosDebandEnabledKey)?.let(::saveIosDebandEnabled)
        payload.decodeSyncBoolean(iosInterpolationEnabledKey)?.let(::saveIosInterpolationEnabled)
        payload.decodeSyncInt(iosBrightnessKey)?.let(::saveIosBrightness)
        payload.decodeSyncInt(iosContrastKey)?.let(::saveIosContrast)
        payload.decodeSyncInt(iosSaturationKey)?.let(::saveIosSaturation)
        payload.decodeSyncInt(iosGammaKey)?.let(::saveIosGamma)
    }
}
