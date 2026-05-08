package com.nuvio.app.features.addons

import com.nuvio.app.features.settings.ThemeSettingsStorage

/**
 * Returns the device's primary BCP-47 language tag (e.g. "fr-FR", "en", "es-MX"),
 * or `null` if the platform can't determine one.
 */
internal expect fun deviceLanguageTag(): String?

/**
 * Builds the value of the HTTP `Accept-Language` header that the addon HTTP
 * client should send.
 *
 * Resolution rules:
 * - If the user has explicitly picked an in-app language, that code wins
 *   (the in-app language is always region-less, e.g. `fr`).
 * - Otherwise the device locale tag is used.
 *
 * Header format:
 * - Regional locale (`fr-FR`, `pt-BR`, `es-MX`): strict chain
 *   `fr-FR, fr;q=0.9, en;q=0.5` — accept the exact region first, then any
 *   variant of the same language, then English. Cross-region variants
 *   (e.g. `fr-CA`) are not preferred.
 * - Language only (`fr`): legacy behaviour `fr, en;q=0.7` — any French variant
 *   the addon serves is acceptable.
 * - English (with or without region): just the tag itself, no q-suffix.
 */
internal fun buildAcceptLanguageHeader(): String {
    val rawTag = ThemeSettingsStorage.loadSelectedAppLanguage()?.takeIf { it.isNotBlank() }
        ?: deviceLanguageTag()?.takeIf {
            it.isNotBlank() && !it.equals("und", ignoreCase = true)
        }
        ?: return "en"

    val normalized = rawTag.replace('_', '-').trim()
    val parts = normalized.split('-', limit = 2)
    val language = parts[0].lowercase().takeIf { it.isNotBlank() } ?: return "en"
    val region = parts.getOrNull(1)?.takeIf { it.isNotBlank() }?.uppercase()

    if (language == "en") {
        return if (region != null) "en-$region, en" else "en"
    }

    return if (region != null) {
        "$language-$region, $language;q=0.9, en;q=0.5"
    } else {
        "$language, en;q=0.7"
    }
}
