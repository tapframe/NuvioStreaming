package com.nuvio.app.features.tmdb

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.core.sync.decodeSyncBoolean
import com.nuvio.app.core.sync.decodeSyncString
import com.nuvio.app.core.sync.encodeSyncBoolean
import com.nuvio.app.core.sync.encodeSyncString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal actual object TmdbSettingsStorage {
    private const val enabledKey = "tmdb_enabled"
    private const val apiKeyKey = "tmdb_api_key"
    private const val languageKey = "tmdb_language"
    private const val useTrailersKey = "tmdb_use_trailers"
    private const val useArtworkKey = "tmdb_use_artwork"
    private const val useBasicInfoKey = "tmdb_use_basic_info"
    private const val useDetailsKey = "tmdb_use_details"
    private const val useCreditsKey = "tmdb_use_credits"
    private const val useProductionsKey = "tmdb_use_productions"
    private const val useNetworksKey = "tmdb_use_networks"
    private const val useEpisodesKey = "tmdb_use_episodes"
    private const val useSeasonPostersKey = "tmdb_use_season_posters"
    private const val useMoreLikeThisKey = "tmdb_use_more_like_this"
    private const val useCollectionsKey = "tmdb_use_collections"
    private val syncKeys = listOf(
        enabledKey,
        apiKeyKey,
        languageKey,
        useTrailersKey,
        useArtworkKey,
        useBasicInfoKey,
        useDetailsKey,
        useCreditsKey,
        useProductionsKey,
        useNetworksKey,
        useEpisodesKey,
        useSeasonPostersKey,
        useMoreLikeThisKey,
        useCollectionsKey,
    )
    private val store = DesktopStorage.store("nuvio_tmdb_settings")

    actual fun loadEnabled(): Boolean? = loadBoolean(enabledKey)
    actual fun saveEnabled(enabled: Boolean) = saveBoolean(enabledKey, enabled)
    actual fun loadApiKey(): String? = loadString(apiKeyKey)
    actual fun saveApiKey(apiKey: String) = saveString(apiKeyKey, apiKey)
    actual fun loadLanguage(): String? = loadString(languageKey)
    actual fun saveLanguage(language: String) = saveString(languageKey, language)
    actual fun loadUseTrailers(): Boolean? = loadBoolean(useTrailersKey)
    actual fun saveUseTrailers(enabled: Boolean) = saveBoolean(useTrailersKey, enabled)
    actual fun loadUseArtwork(): Boolean? = loadBoolean(useArtworkKey)
    actual fun saveUseArtwork(enabled: Boolean) = saveBoolean(useArtworkKey, enabled)
    actual fun loadUseBasicInfo(): Boolean? = loadBoolean(useBasicInfoKey)
    actual fun saveUseBasicInfo(enabled: Boolean) = saveBoolean(useBasicInfoKey, enabled)
    actual fun loadUseDetails(): Boolean? = loadBoolean(useDetailsKey)
    actual fun saveUseDetails(enabled: Boolean) = saveBoolean(useDetailsKey, enabled)
    actual fun loadUseCredits(): Boolean? = loadBoolean(useCreditsKey)
    actual fun saveUseCredits(enabled: Boolean) = saveBoolean(useCreditsKey, enabled)
    actual fun loadUseProductions(): Boolean? = loadBoolean(useProductionsKey)
    actual fun saveUseProductions(enabled: Boolean) = saveBoolean(useProductionsKey, enabled)
    actual fun loadUseNetworks(): Boolean? = loadBoolean(useNetworksKey)
    actual fun saveUseNetworks(enabled: Boolean) = saveBoolean(useNetworksKey, enabled)
    actual fun loadUseEpisodes(): Boolean? = loadBoolean(useEpisodesKey)
    actual fun saveUseEpisodes(enabled: Boolean) = saveBoolean(useEpisodesKey, enabled)
    actual fun loadUseSeasonPosters(): Boolean? = loadBoolean(useSeasonPostersKey)
    actual fun saveUseSeasonPosters(enabled: Boolean) = saveBoolean(useSeasonPostersKey, enabled)
    actual fun loadUseMoreLikeThis(): Boolean? = loadBoolean(useMoreLikeThisKey)
    actual fun saveUseMoreLikeThis(enabled: Boolean) = saveBoolean(useMoreLikeThisKey, enabled)
    actual fun loadUseCollections(): Boolean? = loadBoolean(useCollectionsKey)
    actual fun saveUseCollections(enabled: Boolean) = saveBoolean(useCollectionsKey, enabled)

    private fun loadString(key: String): String? = store.getString(ProfileScopedKey.of(key))
    private fun saveString(key: String, value: String) = store.putString(ProfileScopedKey.of(key), value)
    private fun loadBoolean(key: String): Boolean? = store.getBoolean(ProfileScopedKey.of(key))
    private fun saveBoolean(key: String, value: Boolean) = store.putBoolean(ProfileScopedKey.of(key), value)

    actual fun exportToSyncPayload(): JsonObject = buildJsonObject {
        loadEnabled()?.let { put(enabledKey, encodeSyncBoolean(it)) }
        loadApiKey()?.let { put(apiKeyKey, encodeSyncString(it)) }
        loadLanguage()?.let { put(languageKey, encodeSyncString(it)) }
        loadUseTrailers()?.let { put(useTrailersKey, encodeSyncBoolean(it)) }
        loadUseArtwork()?.let { put(useArtworkKey, encodeSyncBoolean(it)) }
        loadUseBasicInfo()?.let { put(useBasicInfoKey, encodeSyncBoolean(it)) }
        loadUseDetails()?.let { put(useDetailsKey, encodeSyncBoolean(it)) }
        loadUseCredits()?.let { put(useCreditsKey, encodeSyncBoolean(it)) }
        loadUseProductions()?.let { put(useProductionsKey, encodeSyncBoolean(it)) }
        loadUseNetworks()?.let { put(useNetworksKey, encodeSyncBoolean(it)) }
        loadUseEpisodes()?.let { put(useEpisodesKey, encodeSyncBoolean(it)) }
        loadUseSeasonPosters()?.let { put(useSeasonPostersKey, encodeSyncBoolean(it)) }
        loadUseMoreLikeThis()?.let { put(useMoreLikeThisKey, encodeSyncBoolean(it)) }
        loadUseCollections()?.let { put(useCollectionsKey, encodeSyncBoolean(it)) }
    }

    actual fun replaceFromSyncPayload(payload: JsonObject) {
        store.removeAll(syncKeys.map(ProfileScopedKey::of))
        payload.decodeSyncBoolean(enabledKey)?.let(::saveEnabled)
        payload.decodeSyncString(apiKeyKey)?.let(::saveApiKey)
        payload.decodeSyncString(languageKey)?.let(::saveLanguage)
        payload.decodeSyncBoolean(useTrailersKey)?.let(::saveUseTrailers)
        payload.decodeSyncBoolean(useArtworkKey)?.let(::saveUseArtwork)
        payload.decodeSyncBoolean(useBasicInfoKey)?.let(::saveUseBasicInfo)
        payload.decodeSyncBoolean(useDetailsKey)?.let(::saveUseDetails)
        payload.decodeSyncBoolean(useCreditsKey)?.let(::saveUseCredits)
        payload.decodeSyncBoolean(useProductionsKey)?.let(::saveUseProductions)
        payload.decodeSyncBoolean(useNetworksKey)?.let(::saveUseNetworks)
        payload.decodeSyncBoolean(useEpisodesKey)?.let(::saveUseEpisodes)
        payload.decodeSyncBoolean(useSeasonPostersKey)?.let(::saveUseSeasonPosters)
        payload.decodeSyncBoolean(useMoreLikeThisKey)?.let(::saveUseMoreLikeThis)
        payload.decodeSyncBoolean(useCollectionsKey)?.let(::saveUseCollections)
    }
}
