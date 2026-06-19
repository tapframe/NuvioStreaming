package com.nuvio.app.core.network

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.Proxy
import java.util.concurrent.TimeUnit

internal actual object SyncBackendStorage {
    private const val PREFS_NAME = "nuvio_sync_backend"
    private const val KEY_SELECTION_PAYLOAD = "selection_payload_v1"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    actual fun loadSelectionPayload(): String? =
        preferences?.getString(KEY_SELECTION_PAYLOAD, null)

    actual fun saveSelectionPayload(payload: String) {
        preferences
            ?.edit()
            ?.putString(KEY_SELECTION_PAYLOAD, payload)
            ?.apply()
    }
}

private val syncBackendHttpClient = OkHttpClient.Builder()
    .dns(IPv4FirstDns())
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(10, TimeUnit.SECONDS)
    .writeTimeout(10, TimeUnit.SECONDS)
    .followRedirects(true)
    .followSslRedirects(true)
    .proxy(Proxy.NO_PROXY)
    .build()

internal actual suspend fun fetchSyncBackendManifestText(url: String): String =
    withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(url)
            .get()
            .header("Accept", "application/json")
            .build()

        syncBackendHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                error("Sync backend manifest request failed with HTTP ${response.code}")
            }
            response.body?.string()?.takeIf { it.isNotBlank() }
                ?: error("Sync backend manifest response was empty")
        }
    }
