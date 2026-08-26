package com.nuvio.app.features.search

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SearchRequestStateTest {
    @Test
    fun `matching request reuses completed state`() {
        assertTrue(
            canReuseRequestState(
                forceRefresh = false,
                requestKey = "query:addons:settings",
                cachedRequestKey = "query:addons:settings",
            ),
        )
    }

    @Test
    fun `changed or forced request reloads state`() {
        assertFalse(
            canReuseRequestState(
                forceRefresh = false,
                requestKey = "new-query",
                cachedRequestKey = "old-query",
            ),
        )
        assertFalse(
            canReuseRequestState(
                forceRefresh = true,
                requestKey = "same-query",
                cachedRequestKey = "same-query",
            ),
        )
    }

    @Test
    fun `preferred discover catalog is restored ahead of current fallback`() {
        val fallback = discoverCatalog(key = "fallback", type = "movie")
        val preferred = discoverCatalog(key = "preferred", type = "series")

        val selected = resolveDiscoverCatalog(
            sources = listOf(fallback, preferred),
            preferredCatalogKey = preferred.key,
            currentCatalogKey = fallback.key,
        )

        assertEquals(preferred, selected)
    }

    @Test
    fun `current discover catalog remains when preference is unavailable`() {
        val current = discoverCatalog(key = "current", type = "movie")

        val selected = resolveDiscoverCatalog(
            sources = listOf(discoverCatalog(key = "first", type = "movie"), current),
            preferredCatalogKey = "unavailable",
            currentCatalogKey = current.key,
        )

        assertEquals(current, selected)
    }

    private fun discoverCatalog(key: String, type: String): DiscoverCatalogOption =
        DiscoverCatalogOption(
            key = key,
            addonName = "Addon",
            manifestUrl = "https://example.com/manifest.json",
            type = type,
            catalogId = key,
            catalogName = key,
        )
}
