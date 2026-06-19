package com.nuvio.app.core.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.accept
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.isSuccess
import platform.Foundation.NSUserDefaults

internal actual object SyncBackendStorage {
    private const val KEY_SELECTION_PAYLOAD = "nuvio_sync_backend_selection_payload_v1"

    actual fun loadSelectionPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(KEY_SELECTION_PAYLOAD)

    actual fun saveSelectionPayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = KEY_SELECTION_PAYLOAD)
    }
}

private val syncBackendHttpClient = HttpClient(Darwin) {
    install(HttpTimeout) {
        requestTimeoutMillis = 10_000
        connectTimeoutMillis = 10_000
        socketTimeoutMillis = 10_000
    }
    expectSuccess = false
}

internal actual suspend fun fetchSyncBackendManifestText(url: String): String {
    val response = syncBackendHttpClient.get(url) {
        accept(ContentType.Application.Json)
    }
    val payload = response.bodyAsText()
    if (!response.status.isSuccess()) {
        error("Sync backend manifest request failed with HTTP ${response.status.value}")
    }
    return payload.takeIf { it.isNotBlank() }
        ?: error("Sync backend manifest response was empty")
}
