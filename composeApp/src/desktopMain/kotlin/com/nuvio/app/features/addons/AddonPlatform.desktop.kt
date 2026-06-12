package com.nuvio.app.features.addons

import com.nuvio.app.core.storage.DesktopStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

internal actual object AddonStorage {
    private val store = DesktopStorage.store("nuvio_addons")
    private val json = Json { ignoreUnknownKeys = true }

    actual fun loadInstalledAddonUrls(profileId: Int): List<String> =
        store.getString("installed_addon_urls_$profileId")
            ?.let { payload -> runCatching { json.decodeFromString<List<String>>(payload) }.getOrNull() }
            ?: emptyList()

    actual fun saveInstalledAddonUrls(profileId: Int, urls: List<String>) {
        store.putString("installed_addon_urls_$profileId", json.encodeToString(urls))
    }

    actual fun loadAddonEnabledStates(profileId: Int): Map<String, Boolean> =
        store.getString("addon_enabled_states_$profileId")
            ?.let { payload -> runCatching { json.decodeFromString<Map<String, Boolean>>(payload) }.getOrNull() }
            ?: emptyMap()

    actual fun saveAddonEnabledStates(profileId: Int, states: Map<String, Boolean>) {
        store.putString("addon_enabled_states_$profileId", json.encodeToString(states))
    }
}

private val desktopHttpClient: HttpClient = HttpClient.newBuilder()
    .connectTimeout(Duration.ofSeconds(30))
    .followRedirects(HttpClient.Redirect.NORMAL)
    .build()

actual suspend fun httpGetText(url: String): String =
    httpGetTextWithHeaders(url, emptyMap())

actual suspend fun httpPostJson(url: String, body: String): String =
    httpPostJsonWithHeaders(url, body, emptyMap())

actual suspend fun httpGetTextWithHeaders(
    url: String,
    headers: Map<String, String>,
): String =
    httpRequestRaw("GET", url, headers, body = "").body

actual suspend fun httpPostJsonWithHeaders(
    url: String,
    body: String,
    headers: Map<String, String>,
): String =
    httpRequestRaw(
        method = "POST",
        url = url,
        headers = mapOf("Content-Type" to "application/json") + headers,
        body = body,
    ).body

actual suspend fun httpRequestRaw(
    method: String,
    url: String,
    headers: Map<String, String>,
    body: String,
    followRedirects: Boolean,
): RawHttpResponse = withContext(Dispatchers.IO) {
    val client = if (followRedirects) {
        desktopHttpClient
    } else {
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build()
    }
    val normalizedMethod = method.trim().uppercase().ifBlank { "GET" }
    val requestBuilder = HttpRequest.newBuilder()
        .uri(URI(url))
        .timeout(Duration.ofSeconds(60))
        .method(
            normalizedMethod,
            if (normalizedMethod == "GET" || normalizedMethod == "HEAD") {
                HttpRequest.BodyPublishers.noBody()
            } else {
                HttpRequest.BodyPublishers.ofString(body)
            },
        )

    headers.forEach { (key, value) ->
        if (key.isNotBlank() && value.isNotBlank()) {
            requestBuilder.header(key, value)
        }
    }

    val response = client.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString())
    RawHttpResponse(
        status = response.statusCode(),
        statusText = "HTTP ${response.statusCode()}",
        url = response.uri().toString(),
        body = response.body(),
        headers = response.headers().map().mapValues { (_, values) -> values.joinToString(",") },
    )
}
