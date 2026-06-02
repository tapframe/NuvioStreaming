package com.nuvio.app.features.addons

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.addons_manifest_missing_field
import org.jetbrains.compose.resources.getString

internal object AddonManifestParser {
    private val json = Json {
        ignoreUnknownKeys = true
    }

    fun parse(
        manifestUrl: String,
        payload: String,
    ): AddonManifest {
        val root = json.parseToJsonElement(payload).jsonObject
        val defaultTypes = root.stringList("types")
        val defaultPrefixes = root.stringList("idPrefixes")

        return AddonManifest(
            id = root.requiredString("id"),
            name = root.requiredString("name"),
            description = root.optionalString("description").orEmpty(),
            version = root.requiredString("version"),
            logoUrl = root.optionalString("logo")?.resolveAgainstManifest(manifestUrl),
            resources = root.resources(defaultTypes, defaultPrefixes),
            types = defaultTypes,
            idPrefixes = defaultPrefixes,
            catalogs = root.catalogs(),
            behaviorHints = root.behaviorHints(),
            transportUrl = manifestUrl,
        )
    }

    private fun JsonObject.resources(
        defaultTypes: List<String>,
        defaultPrefixes: List<String>,
    ): List<AddonResource> =
        array("resources").map { resource ->
            when (resource) {
                is JsonPrimitive -> AddonResource(
                    name = resource.contentOrNull.orEmpty(),
                    types = defaultTypes,
                    idPrefixes = defaultPrefixes,
                )

                else -> {
                    val obj = resource.jsonObject
                    AddonResource(
                        name = obj.requiredString("name"),
                        types = obj.stringList("types").ifEmpty { defaultTypes },
                        idPrefixes = obj.stringList("idPrefixes").ifEmpty { defaultPrefixes },
                    )
                }
            }
        }.filter { it.name.isNotBlank() }

    private fun JsonObject.catalogs(): List<AddonCatalog> =
        array("catalogs").map { catalogElement ->
            val catalog = catalogElement.jsonObject
            AddonCatalog(
                type = catalog.requiredString("type"),
                id = catalog.requiredString("id"),
                name = catalog.optionalString("name").orEmpty().ifBlank { catalog.requiredString("id") },
                extra = catalog.array("extra").mapNotNull { extraElement ->
                    extraElement.jsonObject.optionalString("name")?.takeIf { it.isNotBlank() }?.let { name ->
                        AddonExtraProperty(
                            name = name,
                            isRequired = extraElement.jsonObject.boolean("isRequired"),
                            options = extraElement.jsonObject.stringList("options"),
                            optionsLimit = extraElement.jsonObject.int("optionsLimit"),
                        )
                    }
                },
            )
        }

    private fun JsonObject.behaviorHints(): AddonBehaviorHints {
        val hints = this["behaviorHints"]?.jsonObject ?: return AddonBehaviorHints()
        return AddonBehaviorHints(
            configurable = hints.boolean("configurable"),
            configurationRequired = hints.boolean("configurationRequired"),
            adult = hints.boolean("adult"),
            p2p = hints.boolean("p2p"),
        )
    }

    private fun JsonObject.requiredString(name: String): String =
        optionalString(name)?.takeIf { it.isNotBlank() }
            ?: throw IllegalArgumentException(
                runBlocking { getString(Res.string.addons_manifest_missing_field, name) },
            )

    private fun JsonObject.optionalString(name: String): String? =
        this[name]?.jsonPrimitive?.contentOrNull

    private fun JsonObject.stringList(name: String): List<String> =
        array(name).mapNotNull { element ->
            element.jsonPrimitive.contentOrNull?.takeIf { it.isNotBlank() }
        }

    private fun JsonObject.array(name: String): JsonArray =
        (this[name] as? JsonArray) ?: JsonArray(emptyList())

    private fun JsonObject.boolean(name: String): Boolean =
        this[name]?.jsonPrimitive?.booleanOrNull == true

    private fun JsonObject.int(name: String): Int? =
        this[name]?.jsonPrimitive?.contentOrNull?.toIntOrNull()
}

private fun String.resolveAgainstManifest(manifestUrl: String): String =
    when {
        startsWith("http://") || startsWith("https://") || startsWith("data:") -> this
        startsWith("//") -> "https:$this"
        else -> {
            val manifestBase = manifestUrl.substringBefore("?").substringBeforeLast('/', "")
            if (startsWith('/')) {
                val origin = manifestBase.substringBefore("/", missingDelimiterValue = manifestBase)
                val schemeAndHost = if (origin.contains("://")) {
                    val scheme = origin.substringBefore("://")
                    val host = manifestBase.substringAfter("://").substringBefore("/")
                    "$scheme://$host"
                } else {
                    manifestBase
                }
                "$schemeAndHost$this"
            } else {
                "$manifestBase/$this"
            }
        }
    }
