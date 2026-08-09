package com.nuvio.app.features.watched

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class StoredWatchedPayloadTest {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val compactJson = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
    }

    @Test
    fun providerSnapshot_roundTripsWatchedState() {
        val item = WatchedItem(
            id = "tt1234567",
            type = "movie",
            name = "Movie",
            markedAtEpochMs = 1_000L,
        )
        val providerPayload = StoredProviderWatchedPayload(
            items = listOf(item),
            fullyWatchedSeriesKeys = setOf("series:tt7654321:-1:-1"),
            extraWatchedKeys = setOf("movie:tmdb:123:-1:-1"),
            dirtyWatchedKeys = setOf("movie:tt1234567:-1:-1"),
        )
        val payload = StoredWatchedPayload(
            providerPayloads = mapOf("trakt" to providerPayload),
        )

        val restored = json.decodeFromString<StoredWatchedPayload>(json.encodeToString(payload))

        assertEquals(providerPayload, restored.providerPayloads["trakt"])
    }

    @Test
    fun legacyPayload_defaultsToNoProviderSnapshots() {
        val restored = json.decodeFromString<StoredWatchedPayload>("{\"items\":[]}")

        assertTrue(restored.providerPayloads.isEmpty())
    }

    @Test
    fun compactProviderItems_roundTripWithoutLosingMetadata() {
        val items = listOf(
            WatchedItem(
                id = "tt1234567",
                type = "series",
                name = "Show",
                poster = "poster",
                releaseInfo = "2026",
                season = 1,
                episode = 1,
                videoId = "video-1",
                trackingProviderId = "trakt",
                trackingProviderItemId = "123",
                trackingSourceUrl = "https://trakt.tv/shows/123",
                markedAtEpochMs = 1_000L,
            ),
            WatchedItem(
                id = "tt1234567",
                type = "series",
                name = "Show",
                poster = "poster",
                releaseInfo = "2026",
                season = 1,
                episode = 2,
                videoId = "video-2",
                trackingProviderId = "trakt",
                trackingProviderItemId = "123",
                trackingSourceUrl = "https://trakt.tv/shows/123",
                markedAtEpochMs = 2_000L,
            ),
        )

        val restored = expandProviderWatchedItems(compactProviderWatchedItems(items))

        assertEquals(items.toSet(), restored.toSet())
    }

    @Test
    fun compactExtraKeys_roundTripIdsContainingColons() {
        val keys = setOf(
            watchedItemKey("series", "tmdb:123", 1, 1),
            watchedItemKey("series", "tmdb:123", 1, 2),
            watchedItemKey("series", "trakt:456", 1, 1),
            watchedItemKey("movie", "tmdb:789"),
        )

        val restored = expandExtraWatchedKeys(compactExtraWatchedKeys(keys))

        assertEquals(keys, restored)
    }

    @Test
    fun compactProviderSnapshot_avoidsExpandedAliasPayloadGrowth() {
        val items = buildList {
            repeat(10) { showIndex ->
                repeat(10) { seasonIndex ->
                    repeat(10) { episodeIndex ->
                        add(
                            WatchedItem(
                                id = "tt${showIndex.toString().padStart(7, '0')}",
                                type = "series",
                                name = "Show $showIndex",
                                season = seasonIndex + 1,
                                episode = episodeIndex + 1,
                                markedAtEpochMs = 1_000L + episodeIndex,
                            ),
                        )
                    }
                }
            }
        }
        val extraKeys = buildSet {
            items.forEach { item ->
                val showIndex = item.id.removePrefix("tt").toInt()
                val contentIds = listOf(
                    item.id,
                    "tmdb:${showIndex + 100}",
                    "tvdb:${showIndex + 200}",
                    "trakt:${showIndex + 300}",
                    "show-$showIndex",
                )
                watchedItemTypeAliases(item.type).forEach { type ->
                    contentIds.forEach { contentId ->
                        val key = watchedItemKey(type, contentId, item.season, item.episode)
                        val storedKey = watchedItemKey(item.type, item.id, item.season, item.episode)
                        if (key != storedKey) add(key)
                    }
                }
            }
        }
        val legacy = StoredProviderWatchedPayload(
            items = items,
            extraWatchedKeys = extraKeys,
        )
        val compact = StoredProviderWatchedPayload(
            itemGroups = compactProviderWatchedItems(items),
            extraWatchedKeyGroups = compactExtraWatchedKeys(extraKeys),
        )

        val legacySize = json.encodeToString(legacy).length
        val compactSize = compactJson.encodeToString(compact).length

        assertEquals(items.toSet(), expandProviderWatchedItems(compact.itemGroups).toSet())
        assertEquals(extraKeys, expandExtraWatchedKeys(compact.extraWatchedKeyGroups))
        assertTrue(compactSize * 8 < legacySize, "compact=$compactSize legacy=$legacySize")
    }
}
