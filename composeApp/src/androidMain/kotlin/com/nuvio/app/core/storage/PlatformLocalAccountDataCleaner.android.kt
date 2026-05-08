package com.nuvio.app.core.storage

import android.content.Context

internal actual object PlatformLocalAccountDataCleaner {
    private val preferenceNames = listOf(
        "nuvio_addons",
        "nuvio_library",
        "nuvio_home_catalog_settings",
        "nuvio_player_settings",
        "nuvio_profile_cache",
        "nuvio_avatar_cache",
        "nuvio_profile_pin_cache",
        "nuvio_theme_settings",
        "nuvio_poster_card_style",
        "nuvio_mdblist_settings",
        "nuvio_trakt_auth",
        "nuvio_trakt_library",
        "nuvio_trakt_settings",
        "nuvio_watched",
        "nuvio_stream_link_cache",
        "nuvio_continue_watching_preferences",
        "nuvio_episode_release_notifications",
        "nuvio_episode_release_notifications_platform",
        "nuvio_watch_progress",
        "nuvio_collections",
        "nuvio_plugins",
    )

    private var appContext: Context? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
    }

    actual fun wipe() {
        val context = appContext ?: return
        preferenceNames.forEach { name ->
            context.getSharedPreferences(name, Context.MODE_PRIVATE)
                .edit()
                .clear()
                .apply()
        }
    }
}
