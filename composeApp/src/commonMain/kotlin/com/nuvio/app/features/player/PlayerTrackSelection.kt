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
            subtitleLanguageMatchesTarget(
                trackLanguage = track.languageVariant(),
                normalizedTarget = normalizedTarget,
            )
        }
        if (matchIndex >= 0) return matchIndex

        val labelMatchIndex = tracks.indexOfFirst { track ->
            track.hasNoUsableLanguageTag() &&
                subtitleLanguageMatchesTarget(
                    trackLanguage = normalizeLanguageCode(track.label),
                    normalizedTarget = normalizedTarget,
                )
        }
        if (labelMatchIndex >= 0) return labelMatchIndex
    }

    return -1
}

private fun SubtitleTrack.hasNoUsableLanguageTag(): Boolean {
    val normalized = normalizeLanguageCode(language)
    return normalized == null || normalized == "und"
}

// Tracks tagged with a bare "pt" or "es" often carry the regional variant only in
// their name/id (e.g. "Português (Brasil)"); mirror the TV app's variant detection
// so pt-BR / es-419 preferences can find them.
private fun SubtitleTrack.languageVariant(): String? {
    val base = normalizeLanguageCode(language) ?: return null
    val haystack = listOfNotNull(label, language, id)
        .joinToString(" ")
        .lowercase()
    return when (base) {
        "pt" -> when {
            BRAZILIAN_TAGS.any(haystack::contains) && EUROPEAN_PT_TAGS.none(haystack::contains) -> "pt-br"
            else -> base
        }
        "es" -> when {
            LATINO_TAGS.any(haystack::contains) && CASTILIAN_TAGS.none(haystack::contains) -> "es-419"
            else -> base
        }
        else -> base
    }
}

// Regional pairs are matched exactly, mirroring the TV app: a "pt" preference must
// not select a Brazilian track and "es" must not select a Latin American one, nor
// the reverse. All other languages keep the primary-subtag fallback.
private fun subtitleLanguageMatchesTarget(trackLanguage: String?, normalizedTarget: String): Boolean {
    val variant = trackLanguage ?: return false
    return when (normalizedTarget) {
        "pt" -> variant == "pt"
        "es" -> variant == "es"
        "pt-br" -> variant == "pt-br"
        "es-419" -> variant == "es-419"
        else -> languageMatchesPreference(variant, normalizedTarget)
    }
}

private val BRAZILIAN_TAGS = listOf(
    "pt-br", "pt_br", "pob", "brazilian", "brazil", "brasil", "brasileiro", " br", "(br)",
)
private val EUROPEAN_PT_TAGS = listOf(
    "pt-pt", "pt_pt", "iberian", "european", "portugal", "europeu", " eu", "(eu)",
)
private val LATINO_TAGS = listOf(
    "es-419", "es_419", "es-la", "es-lat", "latino", "latinoamerica",
    "latinoamericano", "latam", "lat am", "latin america",
)
private val CASTILIAN_TAGS = listOf(
    "es-es", "es_es", "castilian", "castellano", "spain", "españa", "espana", "iberian",
)

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
