package com.nuvio.app.features.debrid

import kotlinx.serialization.json.JsonObject

internal expect object DebridSettingsStorage {
    fun loadEnabled(): Boolean?
    fun saveEnabled(enabled: Boolean)
    fun loadCloudLibraryEnabled(): Boolean?
    fun saveCloudLibraryEnabled(enabled: Boolean)
    fun loadPreferredResolverProviderId(): String?
    fun savePreferredResolverProviderId(providerId: String)
    fun loadProviderApiKey(providerId: String): String?
    fun saveProviderApiKey(providerId: String, apiKey: String)
    fun loadTorboxApiKey(): String?
    fun saveTorboxApiKey(apiKey: String)
    fun loadRealDebridApiKey(): String?
    fun saveRealDebridApiKey(apiKey: String)
    fun loadInstantPlaybackPreparationLimit(): Int?
    fun saveInstantPlaybackPreparationLimit(limit: Int)
    fun loadStreamMaxResults(): Int?
    fun saveStreamMaxResults(maxResults: Int)
    fun loadStreamSortMode(): String?
    fun saveStreamSortMode(mode: String)
    fun loadStreamMinimumQuality(): String?
    fun saveStreamMinimumQuality(quality: String)
    fun loadStreamDolbyVisionFilter(): String?
    fun saveStreamDolbyVisionFilter(filter: String)
    fun loadStreamHdrFilter(): String?
    fun saveStreamHdrFilter(filter: String)
    fun loadStreamCodecFilter(): String?
    fun saveStreamCodecFilter(filter: String)
    fun loadStreamPreferences(): String?
    fun saveStreamPreferences(preferences: String)
    fun loadStreamNameTemplate(): String?
    fun saveStreamNameTemplate(template: String)
    fun loadStreamDescriptionTemplate(): String?
    fun saveStreamDescriptionTemplate(template: String)
    fun exportToSyncPayload(): JsonObject
    fun replaceFromSyncPayload(payload: JsonObject)
}
