package com.nuvio.app.features.watchprogress

import com.nuvio.app.core.storage.DesktopStorage

internal actual object ResumePromptStorage {
    private val store = DesktopStorage.store("nuvio_resume_prompt")

    actual fun loadWasInPlayer(): Boolean =
        store.getBoolean("was_in_player") ?: false

    actual fun saveWasInPlayer(value: Boolean) {
        store.putBoolean("was_in_player", value)
    }

    actual fun loadLastPlayerVideoId(): String? =
        store.getString("last_player_video_id")

    actual fun saveLastPlayerVideoId(videoId: String?) {
        store.putString("last_player_video_id", videoId?.takeIf { it.isNotBlank() })
    }
}
