package com.nuvio.app.features.home

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ReleaseInfoUtilsTest {

    @Test
    fun `raw released date after today is unreleased`() {
        val item = preview(rawReleaseDate = "2026-06-15T00:00:00.000Z", releaseInfo = "2026")

        assertTrue(item.isUnreleased(todayIsoDate = "2026-05-06"))
    }

    @Test
    fun `release info full date after today is unreleased`() {
        val item = preview(rawReleaseDate = null, releaseInfo = "2026-06-15")

        assertTrue(item.isUnreleased(todayIsoDate = "2026-05-06"))
    }

    @Test
    fun `future release info year is unreleased`() {
        val item = preview(rawReleaseDate = null, releaseInfo = "Coming in 2027")

        assertTrue(item.isUnreleased(todayIsoDate = "2026-05-06"))
    }

    @Test
    fun `released and unknown dates are kept`() {
        assertFalse(preview(rawReleaseDate = "2026-05-06", releaseInfo = "2026").isUnreleased("2026-05-06"))
        assertFalse(preview(rawReleaseDate = "2026-05-05", releaseInfo = "2026").isUnreleased("2026-05-06"))
        assertFalse(preview(rawReleaseDate = null, releaseInfo = null).isUnreleased("2026-05-06"))
    }

    @Test
    fun `catalog section filters unreleased items`() {
        val section = HomeCatalogSection(
            key = "addon:movie:popular",
            title = "Popular",
            subtitle = "Addon",
            addonName = "Addon",
            type = "movie",
            manifestUrl = "https://example.com/manifest.json",
            catalogId = "popular",
            items = listOf(
                preview(id = "released", rawReleaseDate = "2026-05-01", releaseInfo = "2026"),
                preview(id = "future", rawReleaseDate = "2026-07-01", releaseInfo = "2026"),
            ),
            availableItemCount = 2,
        )

        val result = section.filterReleasedItems(todayIsoDate = "2026-05-06")

        assertEquals(listOf("released"), result.items.map { it.id })
        assertEquals(2, result.availableItemCount)
    }

    private fun preview(
        id: String = "tt1",
        rawReleaseDate: String?,
        releaseInfo: String?,
    ): MetaPreview = MetaPreview(
        id = id,
        type = "movie",
        name = id,
        rawReleaseDate = rawReleaseDate,
        releaseInfo = releaseInfo,
    )
}
