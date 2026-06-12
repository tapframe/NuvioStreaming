package com.nuvio.app.features.debrid

import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.core.sync.decodeSyncBoolean
import com.nuvio.app.core.sync.decodeSyncInt
import com.nuvio.app.core.sync.decodeSyncString
import com.nuvio.app.core.sync.encodeSyncBoolean
import com.nuvio.app.core.sync.encodeSyncInt
import com.nuvio.app.core.sync.encodeSyncString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import platform.Foundation.NSUserDefaults

actual object DebridSettingsStorage {
    private const val enabledKey = "debrid_enabled"
    private const val cloudLibraryEnabledKey = "debrid_cloud_library_enabled"
    private const val preferredResolverProviderIdKey = "debrid_preferred_resolver_provider_id"
    private const val torboxApiKeyKey = "debrid_torbox_api_key"
    private const val realDebridApiKeyKey = "debrid_real_debrid_api_key"
    private const val instantPlaybackPreparationLimitKey = "debrid_instant_playback_preparation_limit"
    private const val streamMaxResultsKey = "debrid_stream_max_results"
    private const val streamSortModeKey = "debrid_stream_sort_mode"
    private const val streamMinimumQualityKey = "debrid_stream_minimum_quality"
    private const val streamDolbyVisionFilterKey = "debrid_stream_dolby_vision_filter"
    private const val streamHdrFilterKey = "debrid_stream_hdr_filter"
    private const val streamCodecFilterKey = "debrid_stream_codec_filter"
    private const val streamPreferencesKey = "debrid_stream_preferences"
    private const val streamNameTemplateKey = "debrid_stream_name_template"
    private const val streamDescriptionTemplateKey = "debrid_stream_description_template"
    private const val pendingDeviceAuthorizationPrefix = "debrid_pending_device_authorization_"
    private fun syncKeys(): List<String> =
        listOf(
            enabledKey,
            cloudLibraryEnabledKey,
            preferredResolverProviderIdKey,
            instantPlaybackPreparationLimitKey,
            streamMaxResultsKey,
            streamSortModeKey,
            streamMinimumQualityKey,
            streamDolbyVisionFilterKey,
            streamHdrFilterKey,
            streamCodecFilterKey,
            streamPreferencesKey,
            streamNameTemplateKey,
            streamDescriptionTemplateKey,
        ) + DebridProviders.all().map { providerApiKeyKey(it.id) }

    actual fun loadEnabled(): Boolean? = loadBoolean(enabledKey)

    actual fun saveEnabled(enabled: Boolean) {
        saveBoolean(enabledKey, enabled)
    }

    actual fun loadCloudLibraryEnabled(): Boolean? = loadBoolean(cloudLibraryEnabledKey)

    actual fun saveCloudLibraryEnabled(enabled: Boolean) {
        saveBoolean(cloudLibraryEnabledKey, enabled)
    }

    actual fun loadPreferredResolverProviderId(): String? = loadString(preferredResolverProviderIdKey)

    actual fun savePreferredResolverProviderId(providerId: String) {
        saveString(preferredResolverProviderIdKey, providerId)
    }

    actual fun loadProviderApiKey(providerId: String): String? =
        loadString(providerApiKeyKey(providerId))

    actual fun saveProviderApiKey(providerId: String, apiKey: String) {
        saveString(providerApiKeyKey(providerId), apiKey)
    }

    actual fun loadTorboxApiKey(): String? = loadProviderApiKey(DebridProviders.TORBOX_ID)

    actual fun saveTorboxApiKey(apiKey: String) {
        saveProviderApiKey(DebridProviders.TORBOX_ID, apiKey)
    }

    actual fun loadRealDebridApiKey(): String? = loadProviderApiKey(DebridProviders.REAL_DEBRID_ID)

    actual fun saveRealDebridApiKey(apiKey: String) {
        saveProviderApiKey(DebridProviders.REAL_DEBRID_ID, apiKey)
    }

    actual fun loadInstantPlaybackPreparationLimit(): Int? = loadInt(instantPlaybackPreparationLimitKey)

    actual fun saveInstantPlaybackPreparationLimit(limit: Int) {
        saveInt(instantPlaybackPreparationLimitKey, limit)
    }

    actual fun loadStreamMaxResults(): Int? = loadInt(streamMaxResultsKey)

    actual fun saveStreamMaxResults(maxResults: Int) {
        saveInt(streamMaxResultsKey, maxResults)
    }

    actual fun loadStreamSortMode(): String? = loadString(streamSortModeKey)

    actual fun saveStreamSortMode(mode: String) {
        saveString(streamSortModeKey, mode)
    }

    actual fun loadStreamMinimumQuality(): String? = loadString(streamMinimumQualityKey)

    actual fun saveStreamMinimumQuality(quality: String) {
        saveString(streamMinimumQualityKey, quality)
    }

    actual fun loadStreamDolbyVisionFilter(): String? = loadString(streamDolbyVisionFilterKey)

    actual fun saveStreamDolbyVisionFilter(filter: String) {
        saveString(streamDolbyVisionFilterKey, filter)
    }

    actual fun loadStreamHdrFilter(): String? = loadString(streamHdrFilterKey)

    actual fun saveStreamHdrFilter(filter: String) {
        saveString(streamHdrFilterKey, filter)
    }

    actual fun loadStreamCodecFilter(): String? = loadString(streamCodecFilterKey)

    actual fun saveStreamCodecFilter(filter: String) {
        saveString(streamCodecFilterKey, filter)
    }

    actual fun loadStreamPreferences(): String? = loadString(streamPreferencesKey)

    actual fun saveStreamPreferences(preferences: String) {
        saveString(streamPreferencesKey, preferences)
    }

    actual fun loadStreamNameTemplate(): String? = loadString(streamNameTemplateKey)

    actual fun saveStreamNameTemplate(template: String) {
        saveString(streamNameTemplateKey, template)
    }

    actual fun loadStreamDescriptionTemplate(): String? = loadString(streamDescriptionTemplateKey)

    actual fun saveStreamDescriptionTemplate(template: String) {
        saveString(streamDescriptionTemplateKey, template)
    }

    actual fun loadPendingDeviceAuthorization(providerId: String): String? =
        loadString(pendingDeviceAuthorizationKey(providerId))

    actual fun savePendingDeviceAuthorization(providerId: String, payload: String) {
        saveString(pendingDeviceAuthorizationKey(providerId), payload)
    }

    actual fun clearPendingDeviceAuthorization(providerId: String) {
        NSUserDefaults.standardUserDefaults.removeObjectForKey(
            ProfileScopedKey.of(pendingDeviceAuthorizationKey(providerId)),
        )
    }

    private fun loadBoolean(key: String): Boolean? {
        val defaults = NSUserDefaults.standardUserDefaults
        val scopedKey = ProfileScopedKey.of(key)
        return if (defaults.objectForKey(scopedKey) != null) {
            defaults.boolForKey(scopedKey)
        } else {
            null
        }
    }

    private fun saveBoolean(key: String, enabled: Boolean) {
        NSUserDefaults.standardUserDefaults.setBool(enabled, forKey = ProfileScopedKey.of(key))
    }

    private fun loadInt(key: String): Int? {
        val defaults = NSUserDefaults.standardUserDefaults
        val scopedKey = ProfileScopedKey.of(key)
        return if (defaults.objectForKey(scopedKey) != null) {
            defaults.integerForKey(scopedKey).toInt()
        } else {
            null
        }
    }

    private fun saveInt(key: String, value: Int) {
        NSUserDefaults.standardUserDefaults.setInteger(value.toLong(), forKey = ProfileScopedKey.of(key))
    }

    private fun loadString(key: String): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(key))

    private fun saveString(key: String, value: String) {
        NSUserDefaults.standardUserDefaults.setObject(value, forKey = ProfileScopedKey.of(key))
    }

    actual fun exportToSyncPayload(): JsonObject = buildJsonObject {
        loadEnabled()?.let { put(enabledKey, encodeSyncBoolean(it)) }
        loadCloudLibraryEnabled()?.let { put(cloudLibraryEnabledKey, encodeSyncBoolean(it)) }
        loadPreferredResolverProviderId()?.let { put(preferredResolverProviderIdKey, encodeSyncString(it)) }
        DebridProviders.all().forEach { provider ->
            loadProviderApiKey(provider.id)?.let {
                put(providerApiKeyKey(provider.id), encodeSyncString(it))
            }
        }
        loadInstantPlaybackPreparationLimit()?.let { put(instantPlaybackPreparationLimitKey, encodeSyncInt(it)) }
        loadStreamMaxResults()?.let { put(streamMaxResultsKey, encodeSyncInt(it)) }
        loadStreamSortMode()?.let { put(streamSortModeKey, encodeSyncString(it)) }
        loadStreamMinimumQuality()?.let { put(streamMinimumQualityKey, encodeSyncString(it)) }
        loadStreamDolbyVisionFilter()?.let { put(streamDolbyVisionFilterKey, encodeSyncString(it)) }
        loadStreamHdrFilter()?.let { put(streamHdrFilterKey, encodeSyncString(it)) }
        loadStreamCodecFilter()?.let { put(streamCodecFilterKey, encodeSyncString(it)) }
        loadStreamPreferences()?.let { put(streamPreferencesKey, encodeSyncString(it)) }
        loadStreamNameTemplate()?.let { put(streamNameTemplateKey, encodeSyncString(it)) }
        loadStreamDescriptionTemplate()?.let { put(streamDescriptionTemplateKey, encodeSyncString(it)) }
    }

    actual fun replaceFromSyncPayload(payload: JsonObject) {
        syncKeys().forEach { key ->
            NSUserDefaults.standardUserDefaults.removeObjectForKey(ProfileScopedKey.of(key))
        }

        payload.decodeSyncBoolean(enabledKey)?.let(::saveEnabled)
        payload.decodeSyncBoolean(cloudLibraryEnabledKey)?.let(::saveCloudLibraryEnabled)
        payload.decodeSyncString(preferredResolverProviderIdKey)?.let(::savePreferredResolverProviderId)
        DebridProviders.all().forEach { provider ->
            payload.decodeSyncString(providerApiKeyKey(provider.id))?.let { apiKey ->
                saveProviderApiKey(provider.id, apiKey)
            }
        }
        payload.decodeSyncInt(instantPlaybackPreparationLimitKey)?.let(::saveInstantPlaybackPreparationLimit)
        payload.decodeSyncInt(streamMaxResultsKey)?.let(::saveStreamMaxResults)
        payload.decodeSyncString(streamSortModeKey)?.let(::saveStreamSortMode)
        payload.decodeSyncString(streamMinimumQualityKey)?.let(::saveStreamMinimumQuality)
        payload.decodeSyncString(streamDolbyVisionFilterKey)?.let(::saveStreamDolbyVisionFilter)
        payload.decodeSyncString(streamHdrFilterKey)?.let(::saveStreamHdrFilter)
        payload.decodeSyncString(streamCodecFilterKey)?.let(::saveStreamCodecFilter)
        payload.decodeSyncString(streamPreferencesKey)?.let(::saveStreamPreferences)
        payload.decodeSyncString(streamNameTemplateKey)?.let(::saveStreamNameTemplate)
        payload.decodeSyncString(streamDescriptionTemplateKey)?.let(::saveStreamDescriptionTemplate)
    }

    private fun providerApiKeyKey(providerId: String): String {
        val normalized = DebridProviders.byId(providerId)?.id
            ?: providerId.trim().lowercase().replace(Regex("[^a-z0-9_]+"), "_")
        return when (normalized) {
            DebridProviders.TORBOX_ID -> torboxApiKeyKey
            DebridProviders.REAL_DEBRID_ID -> realDebridApiKeyKey
            else -> "debrid_${normalized}_api_key"
        }
    }

    private fun pendingDeviceAuthorizationKey(providerId: String): String {
        val normalized = DebridProviders.byId(providerId)?.id
            ?: providerId.trim().lowercase().replace(Regex("[^a-z0-9_]+"), "_")
        return "$pendingDeviceAuthorizationPrefix$normalized"
    }
}
