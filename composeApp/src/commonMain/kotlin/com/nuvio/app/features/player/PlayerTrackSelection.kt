package com.nuvio.app.features.player

import com.nuvio.app.features.addons.AddonResource
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.addons.enabledAddons

internal fun buildAddonSubtitleFetchKey(
    addons: List<ManagedAddon>,
    type: String?,
    videoId: String?,
): String? {
    val normalizedType = type?.takeIf { it.isNotBlank() } ?: return null
    val normalizedVideoId = videoId?.takeIf { it.isNotBlank() } ?: return null
    val compatibleSubtitleAddons = addons.enabledAddons().mapNotNull { addon ->
        val manifest = addon.manifest ?: return@mapNotNull null
        val supportsSubtitles = manifest.resources.any { resource ->
            resource.isCompatibleSubtitleResource(
                type = normalizedType,
                videoId = normalizedVideoId,
            )
        }
        if (!supportsSubtitles) return@mapNotNull null
        "${manifest.id}:${manifest.transportUrl}"
    }

    if (compatibleSubtitleAddons.isEmpty()) return null
    return buildString {
        append(normalizedType)
        append('|')
        append(normalizedVideoId)
        append('|')
        append(compatibleSubtitleAddons.sorted().joinToString("|"))
    }
}

internal fun AddonResource.isCompatibleSubtitleResource(type: String, videoId: String): Boolean {
    val isSubtitleResource = name.equals("subtitles", ignoreCase = true) ||
        name.equals("subtitle", ignoreCase = true)
    if (!isSubtitleResource) return false

    val requestType = if (type.equals("tv", ignoreCase = true)) "series" else type
    val typeMatches = types.isEmpty() || types.any { it.equals(requestType, ignoreCase = true) }
    if (!typeMatches) return false

    return idPrefixes.isEmpty() || idPrefixes.any { prefix -> videoId.startsWith(prefix) }
}

internal fun <T> findPreferredTrackIndex(
    tracks: List<T>,
    targets: List<String>,
    language: (T) -> String?,
): Int {
    if (targets.isEmpty()) return -1
    for (target in targets) {
        val matchIndex = tracks.indexOfFirst { track ->
            languageMatchesPreference(
                trackLanguage = language(track),
                targetLanguage = target,
            )
        }
        if (matchIndex >= 0) {
            return matchIndex
        }
    }
    return -1
}

internal enum class SubtitleAutoSelectionMode {
    FORCED_ONLY,
    NORMAL_ONLY,
}

internal data class SubtitleAutoSelectionPlan(
    val targets: List<String>,
    val mode: SubtitleAutoSelectionMode,
)

internal fun resolveAudioTrackLanguageTarget(track: AudioTrack?): String? {
    if (track == null) return null

    val directLanguage = normalizeLanguageCode(track.language)
        ?.takeUnless { it == "und" || it == "unknown" }
    if (directLanguage != null) return directLanguage

    val selectableLanguages = AvailableLanguageOptions
        .mapNotNull { option -> normalizeLanguageCode(option.code) }
        .toSet()
    return listOf(track.label, track.id).firstNotNullOfOrNull { value ->
        normalizeLanguageCode(value)?.takeIf(selectableLanguages::contains)
    }
}

internal fun resolveSubtitleAutoSelectionPlan(
    selectedAudioLanguage: String?,
    preferredAudioTargets: List<String>,
    preferredSubtitleTargets: List<String>,
    useForcedSubtitles: Boolean,
): SubtitleAutoSelectionPlan? {
    val normalizedAudioLanguage = normalizeLanguageCode(selectedAudioLanguage)
    if (useForcedSubtitles && normalizedAudioLanguage == null) return null

    val subtitleTargets = preferredSubtitleTargets
        .mapNotNull(::normalizeLanguageCode)
        .filterNot { target ->
            target == SubtitleLanguageOption.NONE ||
                target == SubtitleLanguageOption.FORCED ||
                target == AudioLanguageOption.DEFAULT
        }
        .distinct()
    val primarySubtitleTarget = subtitleTargets.firstOrNull()
    val forcedTarget = when {
        !useForcedSubtitles -> null
        primarySubtitleTarget != null &&
            normalizedAudioLanguage != null &&
            languageMatchesPreference(normalizedAudioLanguage, primarySubtitleTarget) ->
            primarySubtitleTarget
        primarySubtitleTarget == null &&
            normalizedAudioLanguage != null &&
            preferredAudioTargets.any { target ->
                languageMatchesPreference(normalizedAudioLanguage, target)
            } -> normalizedAudioLanguage
        else -> null
    }

    return SubtitleAutoSelectionPlan(
        targets = forcedTarget?.let(::listOf) ?: subtitleTargets,
        mode = if (forcedTarget != null) {
            SubtitleAutoSelectionMode.FORCED_ONLY
        } else {
            SubtitleAutoSelectionMode.NORMAL_ONLY
        },
    )
}

internal fun findPreferredSubtitleTrackIndex(
    tracks: List<SubtitleTrack>,
    targets: List<String>,
    mode: SubtitleAutoSelectionMode,
): Int {
    if (targets.isEmpty()) return -1

    for (target in targets) {
        val normalizedTarget = normalizeLanguageCode(target) ?: continue
        val matchIndex = tracks.indexOfFirst { track ->
            when (mode) {
                SubtitleAutoSelectionMode.FORCED_ONLY -> track.isForced
                SubtitleAutoSelectionMode.NORMAL_ONLY -> !track.isForced
            } &&
                listOf(track.language, track.label, track.id).any { trackLanguage ->
                    languageMatchesPreference(
                        trackLanguage = trackLanguage,
                        targetLanguage = normalizedTarget,
                    )
                }
        }
        if (matchIndex >= 0) return matchIndex
    }

    return -1
}

internal fun filterAddonSubtitlesForSettings(
    subtitles: List<AddonSubtitle>,
    settings: PlayerSettingsUiState,
): List<AddonSubtitle> {
    val shouldFilter = settings.subtitleStyle.showOnlyPreferredLanguages ||
        settings.addonSubtitleStartupMode == AddonSubtitleStartupMode.PREFERRED_ONLY
    if (!shouldFilter) return subtitles

    val targets = preferredSubtitleTargetsForSettings(settings)
    if (targets.isEmpty()) return emptyList()

    return subtitles.filter { subtitle ->
        targets.any { target ->
            languageMatchesPreference(
                trackLanguage = subtitle.language,
                targetLanguage = target,
            )
        }
    }
}

internal fun preferredSubtitleTargetsForSettings(settings: PlayerSettingsUiState): List<String> {
    return resolvePreferredSubtitleLanguageTargets(
        preferredSubtitleLanguage = settings.preferredSubtitleLanguage,
        secondaryPreferredSubtitleLanguage = settings.secondaryPreferredSubtitleLanguage,
        deviceLanguages = DeviceLanguagePreferences.preferredLanguageCodes(),
    ).filterNot { it == SubtitleLanguageOption.FORCED }
}

internal fun findPersistedAudioTrackIndex(
    tracks: List<AudioTrack>,
    preference: PersistedPlayerTrackPreference,
): Int {
    preference.audioTrackId?.takeIf { it.isNotBlank() }?.let { trackId ->
        tracks.firstOrNull { it.id == trackId }?.let { return it.index }
    }
    preference.audioLanguage?.takeIf { it.isNotBlank() }?.let { language ->
        tracks.firstOrNull { languageMatchesPreference(it.language, language) }?.let { return it.index }
    }
    preference.audioName?.takeIf { it.isNotBlank() }?.let { name ->
        tracks.firstOrNull { it.label.equals(name, ignoreCase = true) }?.let { return it.index }
    }
    return -1
}

internal fun findPersistedSubtitleTrackIndex(
    tracks: List<SubtitleTrack>,
    preference: PersistedPlayerTrackPreference,
): Int {
    preference.subtitleTrackId?.takeIf { it.isNotBlank() }?.let { trackId ->
        tracks.firstOrNull { it.id == trackId }?.let { return it.index }
    }
    preference.subtitleLanguage?.takeIf { it.isNotBlank() }?.let { language ->
        tracks.firstOrNull { languageMatchesPreference(it.language, language) }?.let { return it.index }
    }
    preference.subtitleName?.takeIf { it.isNotBlank() }?.let { name ->
        tracks.firstOrNull { it.label.equals(name, ignoreCase = true) }?.let { return it.index }
    }
    return -1
}
