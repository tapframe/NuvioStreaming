package com.nuvio.app.features.collection

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

internal object CollectionJsonPreserver {
    fun merge(
        json: Json,
        rawCollectionsJson: JsonElement,
        collections: List<Collection>,
    ): JsonArray {
        val rawById = rawCollectionsJson.asObjectArrayById()
        return buildJsonArray {
            collections.forEach { collection ->
                add(
                    mergeCollection(
                        json = json,
                        raw = rawById[collection.id],
                        collection = collection,
                    ),
                )
            }
        }
    }

    private fun mergeCollection(
        json: Json,
        raw: JsonObject?,
        collection: Collection,
    ): JsonObject {
        val encoded = json.encodeToJsonElement(Collection.serializer(), collection).jsonObject
        val rawFoldersById = raw?.get("folders").asObjectArrayById()
        val mergedFolders = buildJsonArray {
            collection.folders.forEach { folder ->
                add(
                    mergeFolder(
                        json = json,
                        raw = rawFoldersById[folder.id],
                        folder = folder,
                    ),
                )
            }
        }
        return mergeObjects(raw, encoded, mapOf("folders" to mergedFolders))
    }

    private fun mergeFolder(
        json: Json,
        raw: JsonObject?,
        folder: CollectionFolder,
    ): JsonObject {
        val encoded = json.encodeToJsonElement(CollectionFolder.serializer(), folder).jsonObject
        val rawSourcesByKey = raw?.get("catalogSources").asObjectArrayByKey(::sourceKey)
        val mergedSources = buildJsonArray {
            folder.catalogSources.forEach { source ->
                val sourceElement =
                    json.encodeToJsonElement(CollectionCatalogSource.serializer(), source)
                add(
                    mergeSource(
                        json = json,
                        raw = rawSourcesByKey[sourceKey(sourceElement)],
                        source = source,
                    ),
                )
            }
        }
        return mergeObjects(raw, encoded, mapOf("catalogSources" to mergedSources))
    }

    private fun mergeSource(
        json: Json,
        raw: JsonObject?,
        source: CollectionCatalogSource,
    ): JsonObject {
        val encoded = json.encodeToJsonElement(CollectionCatalogSource.serializer(), source).jsonObject
        return mergeObjects(raw, encoded)
    }

    private fun mergeObjects(
        raw: JsonObject?,
        encoded: JsonObject,
        overrides: Map<String, JsonElement> = emptyMap(),
    ): JsonObject = buildJsonObject {
        raw?.forEach { (key, value) -> put(key, value) }
        encoded.forEach { (key, value) -> put(key, overrides[key] ?: value) }
    }

    private fun JsonElement?.asObjectArrayById(): Map<String, JsonObject> =
        asObjectArrayByKey { obj -> obj["id"]?.jsonPrimitive?.contentOrNull }

    private fun JsonElement?.asObjectArrayByKey(keySelector: (JsonObject) -> String?): Map<String, JsonObject> =
        (this as? JsonArray)
            ?.mapNotNull { element ->
                val obj = element as? JsonObject ?: return@mapNotNull null
                keySelector(obj)?.let { key -> key to obj }
            }
            ?.toMap()
            .orEmpty()

    private fun sourceKey(element: JsonElement): String? {
        val obj = element as? JsonObject ?: return null
        val addonId = obj["addonId"]?.jsonPrimitive?.contentOrNull ?: return null
        val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: return null
        val catalogId = obj["catalogId"]?.jsonPrimitive?.contentOrNull ?: return null
        return "$addonId|$type|$catalogId"
    }
}
