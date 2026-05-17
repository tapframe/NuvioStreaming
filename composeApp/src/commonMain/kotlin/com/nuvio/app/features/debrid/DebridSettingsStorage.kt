package com.nuvio.app.features.debrid

import kotlinx.serialization.json.JsonObject

internal expect object DebridSettingsStorage {
    fun loadEnabled(): Boolean?
    fun saveEnabled(enabled: Boolean)
    fun loadTorboxApiKey(): String?
    fun saveTorboxApiKey(apiKey: String)
    fun loadRealDebridApiKey(): String?
    fun saveRealDebridApiKey(apiKey: String)
    fun loadInstantPlaybackPreparationLimit(): Int?
    fun saveInstantPlaybackPreparationLimit(limit: Int)
    fun loadStreamNameTemplate(): String?
    fun saveStreamNameTemplate(template: String)
    fun loadStreamDescriptionTemplate(): String?
    fun saveStreamDescriptionTemplate(template: String)
    fun exportToSyncPayload(): JsonObject
    fun replaceFromSyncPayload(payload: JsonObject)
}
