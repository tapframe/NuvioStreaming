package com.nuvio.app.features.player

internal fun isPluginStream(addonId: String?): Boolean =
    addonId?.startsWith("plugin_") == true

internal fun playbackHeadersForStream(
    addonId: String?,
    headers: Map<String, String>?,
): Map<String, String> {
    val sanitized = sanitizePlaybackHeaders(headers)
    if (!isPluginStream(addonId)) return sanitized

    val hasUserAgent = sanitized.keys.any { it.equals("User-Agent", ignoreCase = true) }
    if (hasUserAgent) return sanitized

    return sanitized + ("User-Agent" to defaultPluginPlaybackUserAgent())
}
