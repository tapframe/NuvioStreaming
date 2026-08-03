package com.nuvio.app.features.tmdb

import platform.Foundation.NSUserDefaults

internal actual object AnimeIdCacheStorage {
    private const val PAYLOAD_KEY = "nuvio_anime_tmdb_mappings_v1"

    actual fun loadPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(PAYLOAD_KEY)

    actual fun savePayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = PAYLOAD_KEY)
    }

    actual fun clear() {
        NSUserDefaults.standardUserDefaults.removeObjectForKey(PAYLOAD_KEY)
    }
}
