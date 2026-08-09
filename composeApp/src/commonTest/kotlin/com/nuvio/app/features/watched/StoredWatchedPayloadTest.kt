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
}
