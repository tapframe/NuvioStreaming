package com.nuvio.app.features.player

import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.player.skip.NextEpisodeThresholdMode
import com.nuvio.app.features.streams.StreamAutoPlayMode
import com.nuvio.app.features.streams.StreamAutoPlaySource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlayerSettingsUiState(
    val showLoadingOverlay: Boolean = true,
    val resizeMode: PlayerResizeMode = PlayerResizeMode.Fit,
    val holdToSpeedEnabled: Boolean = true,
    val holdToSpeedValue: Float = 2f,
    val preferredAudioLanguage: String = AudioLanguageOption.DEVICE,
    val secondaryPreferredAudioLanguage: String? = null,
    val preferredSubtitleLanguage: String = SubtitleLanguageOption.NONE,
    val secondaryPreferredSubtitleLanguage: String? = null,
    val subtitleStyle: SubtitleStyleState = SubtitleStyleState.DEFAULT,
    val streamReuseLastLinkEnabled: Boolean = false,
    val streamReuseLastLinkCacheHours: Int = 24,
    val decoderPriority: Int = 1,
    val mapDV7ToHevc: Boolean = false,
    val tunnelingEnabled: Boolean = false,
    val streamAutoPlayMode: StreamAutoPlayMode = StreamAutoPlayMode.MANUAL,
    val streamAutoPlaySource: StreamAutoPlaySource = StreamAutoPlaySource.ALL_SOURCES,
    val streamAutoPlaySelectedAddons: Set<String> = emptySet(),
    val streamAutoPlaySelectedPlugins: Set<String> = emptySet(),
    val streamAutoPlayRegex: String = "",
    val streamAutoPlayTimeoutSeconds: Int = 3,
    val skipIntroEnabled: Boolean = true,
    val animeSkipEnabled: Boolean = false,
    val animeSkipClientId: String = "",
    val introDbApiKey: String = "",
    val introSubmitEnabled: Boolean = false,
    val streamAutoPlayNextEpisodeEnabled: Boolean = false,
    val streamAutoPlayPreferBingeGroup: Boolean = true,
    val nextEpisodeThresholdMode: NextEpisodeThresholdMode = NextEpisodeThresholdMode.PERCENTAGE,
    val nextEpisodeThresholdPercent: Float = 99f,
    val nextEpisodeThresholdMinutesBeforeEnd: Float = 2f,
    val useLibass: Boolean = false,
    val libassRenderType: String = "CUES",
)

object PlayerSettingsRepository {
    private val _uiState = MutableStateFlow(PlayerSettingsUiState())
    val uiState: StateFlow<PlayerSettingsUiState> = _uiState.asStateFlow()

    private var hasLoaded = false
    private var showLoadingOverlay = true
    private var resizeMode = PlayerResizeMode.Fit
    private var holdToSpeedEnabled = true
    private var holdToSpeedValue = 2f
    private var preferredAudioLanguage = AudioLanguageOption.DEVICE
    private var secondaryPreferredAudioLanguage: String? = null
    private var preferredSubtitleLanguage = SubtitleLanguageOption.NONE
    private var secondaryPreferredSubtitleLanguage: String? = null
    private var subtitleStyle = SubtitleStyleState.DEFAULT
    private var streamReuseLastLinkEnabled = false
    private var streamReuseLastLinkCacheHours = 24
    private var decoderPriority = 1
    private var mapDV7ToHevc = false
    private var tunnelingEnabled = false
    private var streamAutoPlayMode = StreamAutoPlayMode.MANUAL
    private var streamAutoPlaySource = StreamAutoPlaySource.ALL_SOURCES
    private var streamAutoPlaySelectedAddons: Set<String> = emptySet()
    private var streamAutoPlaySelectedPlugins: Set<String> = emptySet()
    private var streamAutoPlayRegex = ""
    private var streamAutoPlayTimeoutSeconds = 3
    private var skipIntroEnabled = true
    private var animeSkipEnabled = false
    private var animeSkipClientId = ""
    private var introDbApiKey = ""
    private var introSubmitEnabled = false
    private var streamAutoPlayNextEpisodeEnabled = false
    private var streamAutoPlayPreferBingeGroup = true
    private var nextEpisodeThresholdMode = NextEpisodeThresholdMode.PERCENTAGE
    private var nextEpisodeThresholdPercent = 99f
    private var nextEpisodeThresholdMinutesBeforeEnd = 2f
    private var useLibass = false
    private var libassRenderType = "CUES"

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        showLoadingOverlay = true
        resizeMode = PlayerResizeMode.Fit
        holdToSpeedEnabled = true
        holdToSpeedValue = 2f
        preferredAudioLanguage = AudioLanguageOption.DEVICE
        secondaryPreferredAudioLanguage = null
        preferredSubtitleLanguage = SubtitleLanguageOption.NONE
        secondaryPreferredSubtitleLanguage = null
        subtitleStyle = SubtitleStyleState.DEFAULT
        streamReuseLastLinkEnabled = false
        streamReuseLastLinkCacheHours = 24
        decoderPriority = 1
        mapDV7ToHevc = false
        tunnelingEnabled = false
        streamAutoPlayMode = StreamAutoPlayMode.MANUAL
        streamAutoPlaySource = StreamAutoPlaySource.ALL_SOURCES
        streamAutoPlaySelectedAddons = emptySet()
        streamAutoPlaySelectedPlugins = emptySet()
        streamAutoPlayRegex = ""
        streamAutoPlayTimeoutSeconds = 3
        skipIntroEnabled = true
        animeSkipEnabled = false
        animeSkipClientId = ""
        introDbApiKey = ""
        introSubmitEnabled = false
        streamAutoPlayNextEpisodeEnabled = false
        streamAutoPlayPreferBingeGroup = true
        nextEpisodeThresholdMode = NextEpisodeThresholdMode.PERCENTAGE
        nextEpisodeThresholdPercent = 99f
        nextEpisodeThresholdMinutesBeforeEnd = 2f
        useLibass = false
        libassRenderType = "CUES"
        publish()
    }

    private fun loadFromDisk() {
        hasLoaded = true
        showLoadingOverlay = PlayerSettingsStorage.loadShowLoadingOverlay() ?: true
        resizeMode = PlayerSettingsStorage.loadResizeMode()
            ?.let { runCatching { PlayerResizeMode.valueOf(it) }.getOrNull() }
            ?: PlayerResizeMode.Fit
        holdToSpeedEnabled = PlayerSettingsStorage.loadHoldToSpeedEnabled() ?: true
        holdToSpeedValue = PlayerSettingsStorage.loadHoldToSpeedValue() ?: 2f
        preferredAudioLanguage =
            normalizeLanguageCode(PlayerSettingsStorage.loadPreferredAudioLanguage())
                ?: AudioLanguageOption.DEVICE
        secondaryPreferredAudioLanguage =
            normalizeLanguageCode(PlayerSettingsStorage.loadSecondaryPreferredAudioLanguage())
        preferredSubtitleLanguage =
            normalizeLanguageCode(PlayerSettingsStorage.loadPreferredSubtitleLanguage())
                ?: SubtitleLanguageOption.NONE
        secondaryPreferredSubtitleLanguage =
            normalizeLanguageCode(PlayerSettingsStorage.loadSecondaryPreferredSubtitleLanguage())
        subtitleStyle = SubtitleStyleState(
            textColor = subtitleColorFromStorage(PlayerSettingsStorage.loadSubtitleTextColor())
                ?: SubtitleStyleState.DEFAULT.textColor,
            outlineEnabled = PlayerSettingsStorage.loadSubtitleOutlineEnabled()
                ?: SubtitleStyleState.DEFAULT.outlineEnabled,
            fontSizeSp = PlayerSettingsStorage.loadSubtitleFontSizeSp()
                ?: SubtitleStyleState.DEFAULT.fontSizeSp,
            bottomOffset = PlayerSettingsStorage.loadSubtitleBottomOffset()
                ?: SubtitleStyleState.DEFAULT.bottomOffset,
        )
        streamReuseLastLinkEnabled = PlayerSettingsStorage.loadStreamReuseLastLinkEnabled() ?: false
        streamReuseLastLinkCacheHours = PlayerSettingsStorage.loadStreamReuseLastLinkCacheHours() ?: 24
        decoderPriority = PlayerSettingsStorage.loadDecoderPriority() ?: 1
        mapDV7ToHevc = PlayerSettingsStorage.loadMapDV7ToHevc() ?: false
        tunnelingEnabled = PlayerSettingsStorage.loadTunnelingEnabled() ?: false
        streamAutoPlayMode = PlayerSettingsStorage.loadStreamAutoPlayMode()
            ?.let { runCatching { StreamAutoPlayMode.valueOf(it) }.getOrNull() }
            ?: StreamAutoPlayMode.MANUAL
        streamAutoPlaySource = PlayerSettingsStorage.loadStreamAutoPlaySource()
            ?.let { runCatching { StreamAutoPlaySource.valueOf(it) }.getOrNull() }
            ?: StreamAutoPlaySource.ALL_SOURCES
        streamAutoPlaySelectedAddons = PlayerSettingsStorage.loadStreamAutoPlaySelectedAddons() ?: emptySet()
        streamAutoPlaySelectedPlugins = PlayerSettingsStorage.loadStreamAutoPlaySelectedPlugins() ?: emptySet()
        if (!AppFeaturePolicy.pluginsEnabled) {
            val normalizedSource = normalizeStreamAutoPlaySource(streamAutoPlaySource)
            if (normalizedSource != streamAutoPlaySource) {
                streamAutoPlaySource = normalizedSource
                PlayerSettingsStorage.saveStreamAutoPlaySource(normalizedSource.name)
            }
            if (streamAutoPlaySelectedPlugins.isNotEmpty()) {
                streamAutoPlaySelectedPlugins = emptySet()
                PlayerSettingsStorage.saveStreamAutoPlaySelectedPlugins(emptySet())
            }
        }
        streamAutoPlayRegex = PlayerSettingsStorage.loadStreamAutoPlayRegex() ?: ""
        streamAutoPlayTimeoutSeconds = PlayerSettingsStorage.loadStreamAutoPlayTimeoutSeconds() ?: 3
        skipIntroEnabled = PlayerSettingsStorage.loadSkipIntroEnabled() ?: true
        animeSkipEnabled = PlayerSettingsStorage.loadAnimeSkipEnabled() ?: false
        animeSkipClientId = PlayerSettingsStorage.loadAnimeSkipClientId() ?: ""
        introDbApiKey = PlayerSettingsStorage.loadIntroDbApiKey() ?: ""
        introSubmitEnabled = PlayerSettingsStorage.loadIntroSubmitEnabled() ?: false
        streamAutoPlayNextEpisodeEnabled = PlayerSettingsStorage.loadStreamAutoPlayNextEpisodeEnabled() ?: false
        streamAutoPlayPreferBingeGroup = PlayerSettingsStorage.loadStreamAutoPlayPreferBingeGroup() ?: true
        nextEpisodeThresholdMode = PlayerSettingsStorage.loadNextEpisodeThresholdMode()
            ?.let { runCatching { NextEpisodeThresholdMode.valueOf(it) }.getOrNull() }
            ?: NextEpisodeThresholdMode.PERCENTAGE
        nextEpisodeThresholdPercent = PlayerSettingsStorage.loadNextEpisodeThresholdPercent() ?: 99f
        nextEpisodeThresholdMinutesBeforeEnd = PlayerSettingsStorage.loadNextEpisodeThresholdMinutesBeforeEnd() ?: 2f
        useLibass = PlayerSettingsStorage.loadUseLibass() ?: false
        libassRenderType = PlayerSettingsStorage.loadLibassRenderType() ?: "CUES"
        publish()
    }

    fun setShowLoadingOverlay(enabled: Boolean) {
        ensureLoaded()
        if (showLoadingOverlay == enabled) return
        showLoadingOverlay = enabled
        publish()
        PlayerSettingsStorage.saveShowLoadingOverlay(enabled)
    }

    fun setResizeMode(mode: PlayerResizeMode) {
        ensureLoaded()
        if (resizeMode == mode) return
        resizeMode = mode
        publish()
        PlayerSettingsStorage.saveResizeMode(mode.name)
    }

    fun setHoldToSpeedEnabled(enabled: Boolean) {
        ensureLoaded()
        if (holdToSpeedEnabled == enabled) return
        holdToSpeedEnabled = enabled
        publish()
        PlayerSettingsStorage.saveHoldToSpeedEnabled(enabled)
    }

    fun setHoldToSpeedValue(speed: Float) {
        ensureLoaded()
        val normalized = speed.coerceIn(1f, 4f)
        if (holdToSpeedValue == normalized) return
        holdToSpeedValue = normalized
        publish()
        PlayerSettingsStorage.saveHoldToSpeedValue(normalized)
    }

    fun setPreferredAudioLanguage(language: String) {
        ensureLoaded()
        val normalized = normalizeLanguageCode(language) ?: AudioLanguageOption.DEVICE
        if (preferredAudioLanguage == normalized) return
        preferredAudioLanguage = normalized
        publish()
        PlayerSettingsStorage.savePreferredAudioLanguage(normalized)
    }

    fun setSecondaryPreferredAudioLanguage(language: String?) {
        ensureLoaded()
        val normalized = normalizeLanguageCode(language)
        if (secondaryPreferredAudioLanguage == normalized) return
        secondaryPreferredAudioLanguage = normalized
        publish()
        PlayerSettingsStorage.saveSecondaryPreferredAudioLanguage(normalized)
    }

    fun setPreferredSubtitleLanguage(language: String) {
        ensureLoaded()
        val normalized = normalizeLanguageCode(language) ?: SubtitleLanguageOption.NONE
        if (preferredSubtitleLanguage == normalized) return
        preferredSubtitleLanguage = normalized
        publish()
        PlayerSettingsStorage.savePreferredSubtitleLanguage(normalized)
    }

    fun setSecondaryPreferredSubtitleLanguage(language: String?) {
        ensureLoaded()
        val normalized = normalizeLanguageCode(language)
        if (secondaryPreferredSubtitleLanguage == normalized) return
        secondaryPreferredSubtitleLanguage = normalized
        publish()
        PlayerSettingsStorage.saveSecondaryPreferredSubtitleLanguage(normalized)
    }

    fun setSubtitleStyle(style: SubtitleStyleState) {
        ensureLoaded()
        if (subtitleStyle == style) return
        subtitleStyle = style
        publish()
        PlayerSettingsStorage.saveSubtitleTextColor(style.textColor.toStorageHexString())
        PlayerSettingsStorage.saveSubtitleOutlineEnabled(style.outlineEnabled)
        PlayerSettingsStorage.saveSubtitleFontSizeSp(style.fontSizeSp)
        PlayerSettingsStorage.saveSubtitleBottomOffset(style.bottomOffset)
    }

    fun setStreamReuseLastLinkEnabled(enabled: Boolean) {
        ensureLoaded()
        if (streamReuseLastLinkEnabled == enabled) return
        streamReuseLastLinkEnabled = enabled
        publish()
        PlayerSettingsStorage.saveStreamReuseLastLinkEnabled(enabled)
    }

    fun setStreamReuseLastLinkCacheHours(hours: Int) {
        ensureLoaded()
        if (streamReuseLastLinkCacheHours == hours) return
        streamReuseLastLinkCacheHours = hours
        publish()
        PlayerSettingsStorage.saveStreamReuseLastLinkCacheHours(hours)
    }

    fun setDecoderPriority(priority: Int) {
        ensureLoaded()
        if (decoderPriority == priority) return
        decoderPriority = priority
        publish()
        PlayerSettingsStorage.saveDecoderPriority(priority)
    }

    fun setMapDV7ToHevc(enabled: Boolean) {
        ensureLoaded()
        if (mapDV7ToHevc == enabled) return
        mapDV7ToHevc = enabled
        publish()
        PlayerSettingsStorage.saveMapDV7ToHevc(enabled)
    }

    fun setTunnelingEnabled(enabled: Boolean) {
        ensureLoaded()
        if (tunnelingEnabled == enabled) return
        tunnelingEnabled = enabled
        publish()
        PlayerSettingsStorage.saveTunnelingEnabled(enabled)
    }

    fun setStreamAutoPlayMode(mode: StreamAutoPlayMode) {
        ensureLoaded()
        if (streamAutoPlayMode == mode) return
        streamAutoPlayMode = mode
        publish()
        PlayerSettingsStorage.saveStreamAutoPlayMode(mode.name)
    }

    fun setStreamAutoPlaySource(source: StreamAutoPlaySource) {
        ensureLoaded()
        val normalizedSource = normalizeStreamAutoPlaySource(source)
        if (streamAutoPlaySource == normalizedSource) return
        streamAutoPlaySource = normalizedSource
        publish()
        PlayerSettingsStorage.saveStreamAutoPlaySource(normalizedSource.name)
    }

    fun setStreamAutoPlaySelectedAddons(addons: Set<String>) {
        ensureLoaded()
        if (streamAutoPlaySelectedAddons == addons) return
        streamAutoPlaySelectedAddons = addons
        publish()
        PlayerSettingsStorage.saveStreamAutoPlaySelectedAddons(addons)
    }

    fun setStreamAutoPlaySelectedPlugins(plugins: Set<String>) {
        ensureLoaded()
        val normalizedPlugins = if (AppFeaturePolicy.pluginsEnabled) plugins else emptySet()
        if (streamAutoPlaySelectedPlugins == normalizedPlugins) return
        streamAutoPlaySelectedPlugins = normalizedPlugins
        publish()
        PlayerSettingsStorage.saveStreamAutoPlaySelectedPlugins(normalizedPlugins)
    }

    fun setStreamAutoPlayRegex(regex: String) {
        ensureLoaded()
        if (streamAutoPlayRegex == regex) return
        streamAutoPlayRegex = regex
        publish()
        PlayerSettingsStorage.saveStreamAutoPlayRegex(regex)
    }

    fun setStreamAutoPlayTimeoutSeconds(seconds: Int) {
        ensureLoaded()
        if (streamAutoPlayTimeoutSeconds == seconds) return
        streamAutoPlayTimeoutSeconds = seconds
        publish()
        PlayerSettingsStorage.saveStreamAutoPlayTimeoutSeconds(seconds)
    }

    fun setSkipIntroEnabled(enabled: Boolean) {
        ensureLoaded()
        if (skipIntroEnabled == enabled) return
        skipIntroEnabled = enabled
        publish()
        PlayerSettingsStorage.saveSkipIntroEnabled(enabled)
    }

    fun setAnimeSkipEnabled(enabled: Boolean) {
        ensureLoaded()
        if (animeSkipEnabled == enabled) return
        animeSkipEnabled = enabled
        publish()
        PlayerSettingsStorage.saveAnimeSkipEnabled(enabled)
    }

    fun setAnimeSkipClientId(clientId: String) {
        ensureLoaded()
        if (animeSkipClientId == clientId) return
        animeSkipClientId = clientId
        publish()
        PlayerSettingsStorage.saveAnimeSkipClientId(clientId)
    }

    fun setIntroDbApiKey(apiKey: String) {
        ensureLoaded()
        if (introDbApiKey == apiKey) return
        introDbApiKey = apiKey
        publish()
        PlayerSettingsStorage.saveIntroDbApiKey(apiKey)
    }

    fun setIntroSubmitEnabled(enabled: Boolean) {
        ensureLoaded()
        if (introSubmitEnabled == enabled) return
        introSubmitEnabled = enabled
        publish()
        PlayerSettingsStorage.saveIntroSubmitEnabled(enabled)
    }

    fun setStreamAutoPlayNextEpisodeEnabled(enabled: Boolean) {
        ensureLoaded()
        if (streamAutoPlayNextEpisodeEnabled == enabled) return
        streamAutoPlayNextEpisodeEnabled = enabled
        publish()
        PlayerSettingsStorage.saveStreamAutoPlayNextEpisodeEnabled(enabled)
    }

    fun setStreamAutoPlayPreferBingeGroup(enabled: Boolean) {
        ensureLoaded()
        if (streamAutoPlayPreferBingeGroup == enabled) return
        streamAutoPlayPreferBingeGroup = enabled
        publish()
        PlayerSettingsStorage.saveStreamAutoPlayPreferBingeGroup(enabled)
    }

    fun setNextEpisodeThresholdMode(mode: NextEpisodeThresholdMode) {
        ensureLoaded()
        if (nextEpisodeThresholdMode == mode) return
        nextEpisodeThresholdMode = mode
        publish()
        PlayerSettingsStorage.saveNextEpisodeThresholdMode(mode.name)
    }

    fun setNextEpisodeThresholdPercent(percent: Float) {
        ensureLoaded()
        if (nextEpisodeThresholdPercent == percent) return
        nextEpisodeThresholdPercent = percent
        publish()
        PlayerSettingsStorage.saveNextEpisodeThresholdPercent(percent)
    }

    fun setNextEpisodeThresholdMinutesBeforeEnd(minutes: Float) {
        ensureLoaded()
        if (nextEpisodeThresholdMinutesBeforeEnd == minutes) return
        nextEpisodeThresholdMinutesBeforeEnd = minutes
        publish()
        PlayerSettingsStorage.saveNextEpisodeThresholdMinutesBeforeEnd(minutes)
    }

    fun setUseLibass(enabled: Boolean) {
        ensureLoaded()
        if (useLibass == enabled) return
        useLibass = enabled
        publish()
        PlayerSettingsStorage.saveUseLibass(enabled)
    }

    fun setLibassRenderType(renderType: String) {
        ensureLoaded()
        if (libassRenderType == renderType) return
        libassRenderType = renderType
        publish()
        PlayerSettingsStorage.saveLibassRenderType(renderType)
    }

    private fun publish() {
        _uiState.value = PlayerSettingsUiState(
            showLoadingOverlay = showLoadingOverlay,
            resizeMode = resizeMode,
            holdToSpeedEnabled = holdToSpeedEnabled,
            holdToSpeedValue = holdToSpeedValue,
            preferredAudioLanguage = preferredAudioLanguage,
            secondaryPreferredAudioLanguage = secondaryPreferredAudioLanguage,
            preferredSubtitleLanguage = preferredSubtitleLanguage,
            secondaryPreferredSubtitleLanguage = secondaryPreferredSubtitleLanguage,
            subtitleStyle = subtitleStyle,
            streamReuseLastLinkEnabled = streamReuseLastLinkEnabled,
            streamReuseLastLinkCacheHours = streamReuseLastLinkCacheHours,
            decoderPriority = decoderPriority,
            mapDV7ToHevc = mapDV7ToHevc,
            tunnelingEnabled = tunnelingEnabled,
            streamAutoPlayMode = streamAutoPlayMode,
            streamAutoPlaySource = streamAutoPlaySource,
            streamAutoPlaySelectedAddons = streamAutoPlaySelectedAddons,
            streamAutoPlaySelectedPlugins = streamAutoPlaySelectedPlugins,
            streamAutoPlayRegex = streamAutoPlayRegex,
            streamAutoPlayTimeoutSeconds = streamAutoPlayTimeoutSeconds,
            skipIntroEnabled = skipIntroEnabled,
            animeSkipEnabled = animeSkipEnabled,
            animeSkipClientId = animeSkipClientId,
            introDbApiKey = introDbApiKey,
            introSubmitEnabled = introSubmitEnabled,
            streamAutoPlayNextEpisodeEnabled = streamAutoPlayNextEpisodeEnabled,
            streamAutoPlayPreferBingeGroup = streamAutoPlayPreferBingeGroup,
            nextEpisodeThresholdMode = nextEpisodeThresholdMode,
            nextEpisodeThresholdPercent = nextEpisodeThresholdPercent,
            nextEpisodeThresholdMinutesBeforeEnd = nextEpisodeThresholdMinutesBeforeEnd,
            useLibass = useLibass,
            libassRenderType = libassRenderType,
        )
    }

    private fun normalizeStreamAutoPlaySource(source: StreamAutoPlaySource): StreamAutoPlaySource {
        return if (!AppFeaturePolicy.pluginsEnabled && source == StreamAutoPlaySource.ENABLED_PLUGINS_ONLY) {
            StreamAutoPlaySource.ALL_SOURCES
        } else {
            source
        }
    }
}
