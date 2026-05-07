package com.nuvio.app.core.storage

import platform.Foundation.NSUserDefaults

internal actual object PlatformLocalAccountDataCleaner {
    private val plainKeys = listOf(
        "profile_payload",
        "avatar_catalog_payload",
    )
    private val profilePinCachePrefixes = listOf("profile_pin_cache_")
    private val profileIndexedPrefixes = listOf(
        "installed_manifest_urls_",
        "plugins_state_",
        "library_payload_",
        "watched_payload_",
        "watch_progress_payload_",
    )
    private val profileScopedBaseKeys = listOf(
        "catalog_settings_payload",
        "continue_watching_preferences_payload",
        "poster_card_style_payload",
        "episode_release_notifications_payload",
        "episode_release_notification_scheduled_ids",
        "selected_theme",
        "amoled_enabled",
        "show_loading_overlay",
        "preferred_audio_language",
        "secondary_preferred_audio_language",
        "preferred_subtitle_language",
        "secondary_preferred_subtitle_language",
        "subtitle_text_color",
        "subtitle_outline_enabled",
        "subtitle_font_size_sp",
        "subtitle_bottom_offset",
        "stream_reuse_last_link_enabled",
        "stream_reuse_last_link_cache_hours",
        "mdblist_enabled",
        "mdblist_api_key",
        "mdblist_use_imdb",
        "mdblist_use_tmdb",
        "mdblist_use_tomatoes",
        "mdblist_use_metacritic",
        "mdblist_use_trakt",
        "mdblist_use_letterboxd",
        "mdblist_use_audience",
        "trakt_auth_payload",
        "trakt_library_payload",
        "trakt_settings_payload",
        "collections_payload",
    )

    actual fun wipe() {
        val defaults = NSUserDefaults.standardUserDefaults

        plainKeys.forEach(defaults::removeObjectForKey)

        (1..4).forEach { profileId ->
            profileIndexedPrefixes.forEach { prefix ->
                defaults.removeObjectForKey("$prefix$profileId")
            }
            profilePinCachePrefixes.forEach { prefix ->
                defaults.removeObjectForKey("$prefix$profileId")
            }
            profileScopedBaseKeys.forEach { baseKey ->
                defaults.removeObjectForKey("${baseKey}_$profileId")
            }
        }

        for (key in defaults.dictionaryRepresentation().keys) {
            val keyString = key as? String ?: continue
            if (keyString.startsWith("stream_link_")) {
                defaults.removeObjectForKey(keyString)
            }
        }
    }
}
