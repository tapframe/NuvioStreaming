package com.nuvio.app.features.addons

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Pure, platform-independent (de)serialization for the locally persisted
 * "user set addon names" map (`manifestUrl -> userSetName`).
 *
 * Stored as a JSON object so that names containing tabs, newlines or other
 * delimiter characters round-trip exactly. This is intentionally more robust
 * than the legacy `"$url\t$name"` line format which broke whenever a name
 * contained a tab/newline or had significant leading/trailing whitespace.
 *
 * Keeping the logic here (commonMain) lets both the Android and iOS
 * `AddonStorage` actuals share one implementation and lets it be unit tested
 * directly without any platform storage dependency.
 */
internal object AddonNameStorageCodec {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    /** Serialize a names map to a JSON object string. Blank urls/names are dropped. */
    fun encode(names: Map<String, String>): String {
        val sanitized = names
            .filter { (url, name) -> url.isNotBlank() && name.isNotBlank() }
            .mapValues { (_, name) -> JsonPrimitive(name) }
        return json.encodeToString(JsonObject.serializer(), JsonObject(sanitized))
    }

    /**
     * Parse a previously [encode]d payload. Tolerates:
     *  - null / blank input -> empty map
     *  - malformed JSON -> empty map (never throws)
     *  - non-string values -> skipped
     *  - blank keys/values -> skipped
     */
    fun decode(payload: String?): Map<String, String> {
        if (payload.isNullOrBlank()) return emptyMap()
        val root = runCatching { json.parseToJsonElement(payload) as? JsonObject }
            .getOrNull() ?: return emptyMap()
        return buildMap {
            root.forEach { (url, element) ->
                if (url.isBlank()) return@forEach
                val name = (element as? JsonPrimitive)
                    ?.takeIf { it.isString }
                    ?.contentOrNull
                    ?.takeIf { it.isNotBlank() }
                    ?: return@forEach
                put(url, name)
            }
        }
    }
}
