package com.nuvio.app.features.watched

import kotlinx.serialization.Serializable

@Serializable
internal data class StoredProviderWatchedPayload(
    val items: List<WatchedItem> = emptyList(),
    val fullyWatchedSeriesKeys: Set<String> = emptySet(),
    val extraWatchedKeys: Set<String> = emptySet(),
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
