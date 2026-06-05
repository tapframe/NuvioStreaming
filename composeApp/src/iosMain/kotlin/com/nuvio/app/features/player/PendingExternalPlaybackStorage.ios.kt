package com.nuvio.app.features.player

// External auto-play-next is Android-only (iOS external playback is fire-and-forget
// with no activity result), so persistence is a no-op on iOS.
actual object PendingExternalPlaybackStorage {
    actual fun load(): String? = null

    actual fun save(value: String) {}

    actual fun clear() {}
}
