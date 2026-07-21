package com.nuvio.app.features.simkl

import com.nuvio.app.core.build.AppVersionConfig
import io.ktor.http.encodeURLParameter

internal const val SIMKL_API_BASE_URL = "https://api.simkl.com"
internal const val SIMKL_AUTHORIZE_URL = "https://simkl.com/oauth/authorize"

internal val simklAppVersion: String
    get() = AppVersionConfig.VERSION_NAME.ifBlank { "dev" }

internal fun buildSimklApiUrl(
    path: String,
    query: Map<String, String> = emptyMap(),
): String {
    val normalizedPath = path.trim().let { value ->
        if (value.startsWith('/')) value else "/$value"
    }
    val parameters = linkedMapOf(
        "client_id" to SimklConfig.CLIENT_ID,
        "app-name" to SimklConfig.APP_NAME,
        "app-version" to simklAppVersion,
    ).apply { putAll(query) }
    return buildString {
        append(SIMKL_API_BASE_URL)
        append(normalizedPath)
        append('?')
        append(
            parameters.entries.joinToString("&") { (key, value) ->
                "${key.encodeURLParameter()}=${value.encodeURLParameter()}"
            },
        )
    }
}

internal fun simklRequestHeaders(
    accessToken: String? = null,
    contentTypeJson: Boolean = false,
): Map<String, String> = buildMap {
    put("User-Agent", "${SimklConfig.APP_NAME}/$simklAppVersion")
    accessToken?.trim()?.takeIf(String::isNotBlank)?.let { token ->
        put("Authorization", "Bearer $token")
    }
    if (contentTypeJson) put("Content-Type", "application/json")
}
