package com.nuvio.app.features.catalog

import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.AddonExtraProperty
import com.nuvio.app.features.home.MetaPreview
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CatalogPaginationStateTest {
    @Test
    fun `pagination advances by returned raw item count`() {
        val state = nextCatalogPaginationState(
            supportsPagination = true,
            requestedSkip = 11,
            page = page(rawItemCount = 17, nextSkip = 28),
            loadedNewItems = true,
            consecutiveDuplicatePages = 0,
        )

        assertEquals(28, state.nextSkip)
        assertEquals(0, state.consecutiveDuplicatePages)
    }

    @Test
    fun `pagination advances through duplicate page with returned next skip`() {
        val state = nextCatalogPaginationState(
            supportsPagination = true,
            requestedSkip = 45,
            page = page(rawItemCount = 18, nextSkip = 63),
            loadedNewItems = false,
            consecutiveDuplicatePages = 0,
        )

        assertEquals(63, state.nextSkip)
        assertEquals(1, state.consecutiveDuplicatePages)
    }

    @Test
    fun `pagination stops after duplicate page limit`() {
        val state = nextCatalogPaginationState(
            supportsPagination = true,
            requestedSkip = 81,
            page = page(rawItemCount = 18, nextSkip = 99),
            loadedNewItems = false,
            consecutiveDuplicatePages = 2,
        )

        assertNull(state.nextSkip)
        assertEquals(3, state.consecutiveDuplicatePages)
    }

    @Test
    fun `pagination support matches skip extra case insensitively`() {
        val catalog = AddonCatalog(
            type = "movie",
            id = "popular",
            name = "Popular",
            extra = listOf(AddonExtraProperty(name = "Skip")),
        )

        assertTrue(catalog.supportsPagination())
    }

    private fun page(
        rawItemCount: Int,
        nextSkip: Int?,
    ): CatalogPage =
        CatalogPage(
            items = listOf(
                MetaPreview(
                    id = "tt$rawItemCount",
                    type = "movie",
                    name = "Movie $rawItemCount",
                ),
            ),
            rawItemCount = rawItemCount,
            nextSkip = nextSkip,
        )
}
