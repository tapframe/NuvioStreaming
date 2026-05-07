package com.nuvio.app.features.trakt

internal expect object TraktSettingsStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}
