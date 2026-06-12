package com.nuvio.app.features.streams

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.core.sync.decodeSyncBoolean
import com.nuvio.app.core.sync.decodeSyncString
import com.nuvio.app.core.sync.encodeSyncBoolean
import com.nuvio.app.core.sync.encodeSyncString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal actual object StreamBadgeSettingsStorage {
    private const val streamBadgeRulesKey = "stream_badge_rules"
    private const val showFileSizeBadgesKey = "show_file_size_badges"
    private const val streamBadgePlacementKey = "stream_badge_placement"
    private const val legacyDebridStreamBadgeRulesKey = "debrid_stream_badge_rules"
    private val syncKeys = listOf(streamBadgeRulesKey, showFileSizeBadgesKey, streamBadgePlacementKey)
    private val store = DesktopStorage.store("nuvio_stream_badge_settings")
    private val legacyDebridStore = DesktopStorage.store("nuvio_debrid_settings")

    actual fun loadStreamBadgeRules(): String? = loadString(streamBadgeRulesKey)
    actual fun saveStreamBadgeRules(rules: String) = saveString(streamBadgeRulesKey, rules)
    actual fun loadShowFileSizeBadges(): Boolean? = loadBoolean(showFileSizeBadgesKey)
    actual fun saveShowFileSizeBadges(enabled: Boolean) = saveBoolean(showFileSizeBadgesKey, enabled)
    actual fun loadStreamBadgePlacement(): String? = loadString(streamBadgePlacementKey)
    actual fun saveStreamBadgePlacement(placement: String) = saveString(streamBadgePlacementKey, placement)

    actual fun loadLegacyDebridStreamBadgeRules(): String? =
        legacyDebridStore.getString(ProfileScopedKey.of(legacyDebridStreamBadgeRulesKey))

    actual fun clearLegacyDebridStreamBadgeRules() {
        legacyDebridStore.remove(ProfileScopedKey.of(legacyDebridStreamBadgeRulesKey))
    }

    private fun loadString(key: String): String? = store.getString(ProfileScopedKey.of(key))
    private fun saveString(key: String, value: String) = store.putString(ProfileScopedKey.of(key), value)
    private fun loadBoolean(key: String): Boolean? = store.getBoolean(ProfileScopedKey.of(key))
    private fun saveBoolean(key: String, value: Boolean) = store.putBoolean(ProfileScopedKey.of(key), value)

    actual fun exportToSyncPayload(): JsonObject = buildJsonObject {
        loadStreamBadgeRules()?.let { put(streamBadgeRulesKey, encodeSyncString(it)) }
        loadShowFileSizeBadges()?.let { put(showFileSizeBadgesKey, encodeSyncBoolean(it)) }
        loadStreamBadgePlacement()?.let { put(streamBadgePlacementKey, encodeSyncString(it)) }
    }

    actual fun replaceFromSyncPayload(payload: JsonObject) {
        store.removeAll(syncKeys.map(ProfileScopedKey::of))
        payload.decodeSyncString(streamBadgeRulesKey)?.let(::saveStreamBadgeRules)
        payload.decodeSyncBoolean(showFileSizeBadgesKey)?.let(::saveShowFileSizeBadges)
        payload.decodeSyncString(streamBadgePlacementKey)?.let(::saveStreamBadgePlacement)
    }
}
