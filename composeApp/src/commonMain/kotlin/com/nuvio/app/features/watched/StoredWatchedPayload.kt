package com.nuvio.app.features.watched

import kotlinx.serialization.Serializable

@Serializable
internal data class StoredWatchedItemEntry(
    val season: Int? = null,
    val episode: Int? = null,
    val videoId: String? = null,
    val markedAtEpochMs: Long = 0L,
)

@Serializable
internal data class StoredWatchedItemGroup(
    val id: String,
    val type: String,
    val name: String,
    val poster: String? = null,
    val releaseInfo: String? = null,
    val trackingProviderId: String? = null,
    val trackingProviderItemId: String? = null,
    val trackingSourceUrl: String? = null,
    val entries: List<StoredWatchedItemEntry> = emptyList(),
)

@Serializable
internal data class StoredWatchedAliasGroup(
    val type: String,
    val ids: List<String> = emptyList(),
    val seasons: Map<Int, List<Int>> = emptyMap(),
)

@Serializable
internal data class StoredProviderWatchedPayload(
    val items: List<WatchedItem> = emptyList(),
    val itemGroups: List<StoredWatchedItemGroup> = emptyList(),
    val fullyWatchedSeriesKeys: Set<String> = emptySet(),
    val extraWatchedKeys: Set<String> = emptySet(),
    val extraWatchedKeyGroups: List<StoredWatchedAliasGroup> = emptyList(),
    val dirtyWatchedKeys: Set<String> = emptySet(),
)

@Serializable
internal data class StoredWatchedPayload(
    val items: List<WatchedItem> = emptyList(),
    val fullyWatchedSeriesKeys: Set<String> = emptySet(),
    val expandedSiblingKeys: Set<String> = emptySet(),
    val lastSuccessfulPushEpochMs: Long = 0L,
    val deltaCursorEventId: Long = 0L,
    val deltaInitialized: Boolean = false,
    val dirtyWatchedKeys: Set<String> = emptySet(),
    val providerPayloads: Map<String, StoredProviderWatchedPayload> = emptyMap(),
)

internal fun compactProviderWatchedItems(items: Collection<WatchedItem>): List<StoredWatchedItemGroup> =
    items
        .groupBy { item ->
            StoredWatchedItemGroupKey(
                id = item.id,
                type = item.type,
                name = item.name,
                poster = item.poster,
                releaseInfo = item.releaseInfo,
                trackingProviderId = item.trackingProviderId,
                trackingProviderItemId = item.trackingProviderItemId,
                trackingSourceUrl = item.trackingSourceUrl,
            )
        }
        .map { (key, groupedItems) ->
            StoredWatchedItemGroup(
                id = key.id,
                type = key.type,
                name = key.name,
                poster = key.poster,
                releaseInfo = key.releaseInfo,
                trackingProviderId = key.trackingProviderId,
                trackingProviderItemId = key.trackingProviderItemId,
                trackingSourceUrl = key.trackingSourceUrl,
                entries = groupedItems
                    .map { item ->
                        StoredWatchedItemEntry(
                            season = item.season,
                            episode = item.episode,
                            videoId = item.videoId,
                            markedAtEpochMs = item.markedAtEpochMs,
                        )
                    }
                    .sortedWith(
                        compareBy<StoredWatchedItemEntry>(
                            { it.season ?: -1 },
                            { it.episode ?: -1 },
                            { it.videoId.orEmpty() },
                            { it.markedAtEpochMs },
                        ),
                    ),
            )
        }
        .sortedWith(compareBy(StoredWatchedItemGroup::type, StoredWatchedItemGroup::id, StoredWatchedItemGroup::name))

internal fun expandProviderWatchedItems(groups: Collection<StoredWatchedItemGroup>): List<WatchedItem> =
    groups.flatMap { group ->
        group.entries.map { entry ->
            WatchedItem(
                id = group.id,
                type = group.type,
                name = group.name,
                poster = group.poster,
                releaseInfo = group.releaseInfo,
                season = entry.season,
                episode = entry.episode,
                videoId = entry.videoId,
                trackingProviderId = group.trackingProviderId,
                trackingProviderItemId = group.trackingProviderItemId,
                trackingSourceUrl = group.trackingSourceUrl,
                markedAtEpochMs = entry.markedAtEpochMs,
            )
        }
    }

internal fun compactExtraWatchedKeys(keys: Collection<String>): List<StoredWatchedAliasGroup> {
    val seasonsByContent = linkedMapOf<WatchedAliasContentKey, MutableMap<Int, MutableSet<Int>>>()
    keys.forEach { key ->
        val parsed = parseStoredWatchedKey(key) ?: return@forEach
        seasonsByContent
            .getOrPut(WatchedAliasContentKey(type = parsed.type, id = parsed.id), ::linkedMapOf)
            .getOrPut(parsed.season, ::linkedSetOf)
            .add(parsed.episode)
    }

    val idsBySignature = linkedMapOf<WatchedAliasSignature, MutableSet<String>>()
    seasonsByContent.forEach { (content, seasons) ->
        val normalizedSeasons = seasons
            .entries
            .sortedBy { (season, _) -> season }
            .associate { (season, episodes) -> season to episodes.sorted() }
        idsBySignature
            .getOrPut(
                WatchedAliasSignature(type = content.type, seasons = normalizedSeasons),
                ::linkedSetOf,
            )
            .add(content.id)
    }

    return idsBySignature
        .map { (signature, ids) ->
            StoredWatchedAliasGroup(
                type = signature.type,
                ids = ids.sorted(),
                seasons = signature.seasons,
            )
        }
        .sortedWith(
            compareBy<StoredWatchedAliasGroup>(
                StoredWatchedAliasGroup::type,
                { it.ids.firstOrNull().orEmpty() },
            ),
        )
}

internal fun expandExtraWatchedKeys(groups: Collection<StoredWatchedAliasGroup>): Set<String> = buildSet {
    groups.forEach { group ->
        group.ids.forEach { id ->
            group.seasons.forEach { (season, episodes) ->
                episodes.forEach { episode ->
                    add(
                        watchedItemKey(
                            type = group.type,
                            id = id,
                            season = season.takeUnless { it == -1 },
                            episode = episode.takeUnless { it == -1 },
                        ),
                    )
                }
            }
        }
    }
}

private data class StoredWatchedItemGroupKey(
    val id: String,
    val type: String,
    val name: String,
    val poster: String?,
    val releaseInfo: String?,
    val trackingProviderId: String?,
    val trackingProviderItemId: String?,
    val trackingSourceUrl: String?,
)

private data class WatchedAliasContentKey(
    val type: String,
    val id: String,
)

private data class WatchedAliasSignature(
    val type: String,
    val seasons: Map<Int, List<Int>>,
)

private data class ParsedStoredWatchedKey(
    val type: String,
    val id: String,
    val season: Int,
    val episode: Int,
)

private fun parseStoredWatchedKey(key: String): ParsedStoredWatchedKey? {
    val episodeSeparator = key.lastIndexOf(':')
    if (episodeSeparator <= 0) return null
    val seasonSeparator = key.lastIndexOf(':', episodeSeparator - 1)
    if (seasonSeparator <= 0) return null
    val typeSeparator = key.indexOf(':')
    if (typeSeparator <= 0 || typeSeparator >= seasonSeparator) return null

    val type = key.substring(0, typeSeparator)
    val id = key.substring(typeSeparator + 1, seasonSeparator)
    val season = key.substring(seasonSeparator + 1, episodeSeparator).toIntOrNull() ?: return null
    val episode = key.substring(episodeSeparator + 1).toIntOrNull() ?: return null
    if (id.isBlank()) return null

    return ParsedStoredWatchedKey(
        type = type,
        id = id,
        season = season,
        episode = episode,
    )
}
