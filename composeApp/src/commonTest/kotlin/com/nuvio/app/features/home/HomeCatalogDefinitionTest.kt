package com.nuvio.app.features.home

import kotlin.test.Test
import kotlin.test.assertEquals

class HomeCatalogDefinitionTest {
    private val definition = HomeCatalogDefinition(
        key = "addon:movie:popular",
        defaultTitle = "Popular - Movie",
        catalogName = "Popular",
        addonName = "Addon",
        manifestUrl = "https://example.com/manifest.json",
        type = "movie",
        catalogId = "popular",
        supportsPagination = true,
        descriptorSignature = "signature",
    )

    @Test
    fun `shows the type suffix by default`() {
        assertEquals("Popular - Movie", definition.titleFor(showCatalogType = true))
    }

    @Test
    fun `omits the type suffix when disabled`() {
        assertEquals("Popular", definition.titleFor(showCatalogType = false))
    }
}
