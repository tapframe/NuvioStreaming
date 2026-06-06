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

internal fun findPreferredSubtitleTrackIndex(
    tracks: List<SubtitleTrack>,
    targets: List<String>,
): Int {
    if (targets.isEmpty()) return -1

    for ((targetPosition, target) in targets.withIndex()) {
        val normalizedTarget = normalizeLanguageCode(target) ?: continue
        if (normalizedTarget == SubtitleLanguageOption.FORCED) {
            val forcedIndex = tracks.indexOfFirst { it.isForced }
            if (forcedIndex >= 0) return forcedIndex
            if (targetPosition == 0) return -1
            continue
        }

        val matchIndex = tracks.indexOfFirst { track ->
            languageMatchesPreference(
                trackLanguage = track.language,
                targetLanguage = normalizedTarget,
            )
        }
        if (matchIndex >= 0) return matchIndex
    }

    return -1
}

internal fun filterAddonSubtitlesForSettings(
    subtitles: List<AddonSubtitle>,
    settings: PlayerSettingsUiState,
    selectedAddonSubtitleId: String?,
): List<AddonSubtitle> {
    val shouldFilter = settings.subtitleStyle.showOnlyPreferredLanguages ||
        settings.addonSubtitleStartupMode == AddonSubtitleStartupMode.PREFERRED_ONLY
    if (!shouldFilter) return subtitles

    val targets = preferredSubtitleTargetsForSettings(settings)
    if (targets.isEmpty()) {
        return subtitles.filter { subtitle ->
            subtitle.id == selectedAddonSubtitleId || subtitle.url == selectedAddonSubtitleId
        }
    }

    val filtered = subtitles.filter { subtitle ->
        subtitle.id == selectedAddonSubtitleId ||
            subtitle.url == selectedAddonSubtitleId ||
            targets.any { target ->
                languageMatchesPreference(
                    trackLanguage = subtitle.language,
                    targetLanguage = target,
                )
            }
    }
    return filtered
}

internal fun preferredSubtitleTargetsForSettings(settings: PlayerSettingsUiState): List<String> {
    val preferredLanguage = if (settings.subtitleStyle.useForcedSubtitles) {
        SubtitleLanguageOption.FORCED
    } else {
        settings.preferredSubtitleLanguage
    }
    return resolvePreferredSubtitleLanguageTargets(
        preferredSubtitleLanguage = preferredLanguage,
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
