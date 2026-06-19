package com.nuvio.app.core.network

internal expect object SyncBackendStorage {
    fun loadSelectionPayload(): String?
    fun saveSelectionPayload(payload: String)
}

internal expect suspend fun fetchSyncBackendManifestText(url: String): String
