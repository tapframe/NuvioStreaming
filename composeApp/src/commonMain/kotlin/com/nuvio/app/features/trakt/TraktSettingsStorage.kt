package com.nuvio.app.features.trakt

internal expect object TraktSettingsStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
    fun loadPendingWatchProgressSourcePayload(profileId: Int): String?
    fun savePendingWatchProgressSourcePayload(profileId: Int, payload: String)
    fun clearPendingWatchProgressSourcePayload(profileId: Int)
}
