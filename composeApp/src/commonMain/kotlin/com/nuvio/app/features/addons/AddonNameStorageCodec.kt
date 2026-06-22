package com.nuvio.app.features.addons

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal object AddonNameStorageCodec {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun encode(names: Map<String, String>): String {
        val sanitized = names
            .filter { (url, name) -> url.isNotBlank() && name.isNotBlank() }
            .mapValues { (_, name) -> JsonPrimitive(name) }
        return json.encodeToString(JsonObject.serializer(), JsonObject(sanitized))
    }

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
