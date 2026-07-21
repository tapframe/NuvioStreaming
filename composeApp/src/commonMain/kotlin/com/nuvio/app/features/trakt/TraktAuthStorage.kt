package com.nuvio.app.features.trakt

internal expect object TraktAuthStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
    fun removeProfile(profileId: Int)
}
