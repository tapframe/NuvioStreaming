package com.nuvio.app.features.player

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object PlayerTrackPreferenceStorage {
    private const val subtitleTypeKey = "subtitle_type"
    private const val subtitleLanguageKey = "subtitle_language"
    private const val subtitleNameKey = "subtitle_name"
    private const val subtitleTrackIdKey = "subtitle_track_id"
    private const val addonSubtitleIdKey = "addon_subtitle_id"
    private const val addonSubtitleUrlKey = "addon_subtitle_url"
    private const val addonSubtitleAddonNameKey = "addon_subtitle_addon_name"
    private const val audioLanguageKey = "audio_language"
    private const val audioNameKey = "audio_name"
    private const val audioTrackIdKey = "audio_track_id"
    private const val subtitleDelayMsKey = "subtitle_delay_ms"
    private val store = DesktopStorage.store("nuvio_player_track_preferences")

    actual fun load(contentId: String): PersistedPlayerTrackPreference? {
        val id = contentId.normalizedStorageId() ?: return null
        val preference = PersistedPlayerTrackPreference(
            subtitleType = loadString(subtitleTypeKey, id),
            subtitleLanguage = loadString(subtitleLanguageKey, id),
            subtitleName = loadString(subtitleNameKey, id),
            subtitleTrackId = loadString(subtitleTrackIdKey, id),
            addonSubtitleId = loadString(addonSubtitleIdKey, id),
            addonSubtitleUrl = loadString(addonSubtitleUrlKey, id),
            addonSubtitleAddonName = loadString(addonSubtitleAddonNameKey, id),
            audioLanguage = loadString(audioLanguageKey, id),
            audioName = loadString(audioNameKey, id),
            audioTrackId = loadString(audioTrackIdKey, id),
        )
        return preference.takeIf {
            listOf(
                it.subtitleType,
                it.subtitleLanguage,
                it.subtitleName,
                it.subtitleTrackId,
                it.addonSubtitleId,
                it.addonSubtitleUrl,
                it.addonSubtitleAddonName,
                it.audioLanguage,
                it.audioName,
                it.audioTrackId,
            ).any { value -> !value.isNullOrBlank() }
        }
    }

    actual fun save(contentId: String, preference: PersistedPlayerTrackPreference) {
        val id = contentId.normalizedStorageId() ?: return
        putOptionalString(subtitleTypeKey, id, preference.subtitleType)
        putOptionalString(subtitleLanguageKey, id, preference.subtitleLanguage)
        putOptionalString(subtitleNameKey, id, preference.subtitleName)
        putOptionalString(subtitleTrackIdKey, id, preference.subtitleTrackId)
        putOptionalString(addonSubtitleIdKey, id, preference.addonSubtitleId)
        putOptionalString(addonSubtitleUrlKey, id, preference.addonSubtitleUrl)
        putOptionalString(addonSubtitleAddonNameKey, id, preference.addonSubtitleAddonName)
        putOptionalString(audioLanguageKey, id, preference.audioLanguage)
        putOptionalString(audioNameKey, id, preference.audioName)
        putOptionalString(audioTrackIdKey, id, preference.audioTrackId)
    }

    actual fun loadSubtitleDelayMs(videoId: String): Int? {
        val id = videoId.normalizedStorageId() ?: return null
        return store.getInt(scopedKey(subtitleDelayMsKey, id))
    }

    actual fun saveSubtitleDelayMs(videoId: String, delayMs: Int) {
        val id = videoId.normalizedStorageId() ?: return
        store.putInt(
            scopedKey(subtitleDelayMsKey, id),
            delayMs.coerceIn(SUBTITLE_DELAY_MIN_MS, SUBTITLE_DELAY_MAX_MS),
        )
    }

    private fun loadString(field: String, contentId: String): String? =
        store.getString(scopedKey(field, contentId))?.takeIf { it.isNotBlank() }

    private fun putOptionalString(field: String, contentId: String, value: String?) {
        val key = scopedKey(field, contentId)
        if (value.isNullOrBlank()) {
            store.remove(key)
        } else {
            store.putString(key, value)
        }
    }

    private fun scopedKey(field: String, contentId: String): String =
        ProfileScopedKey.of("$field|$contentId")

    private fun String.normalizedStorageId(): String? =
        trim().takeIf { it.isNotBlank() }
}
