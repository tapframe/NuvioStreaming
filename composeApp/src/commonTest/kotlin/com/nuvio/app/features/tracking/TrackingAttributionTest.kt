package com.nuvio.app.features.tracking

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TrackingAttributionTest {
    @Test
    fun `resolver matches content and provider without depending on active source`() {
        val items = sequenceOf(
            attributedItem(
                contentId = "tt123",
                providerId = "trakt",
                sourceUrl = "https://trakt.tv/movies/123",
            ),
            attributedItem(
                contentId = "TT123",
                providerId = "simkl",
                sourceUrl = "https://simkl.com/movies/456",
                providerItemId = "simkl:456",
            ),
        )

        val result = resolveTrackingAttribution(
            contentId = "tt123",
            providerId = TrackingProviderId.SIMKL,
            items = items,
        )

        assertEquals("simkl:456", result?.providerItemId)
        assertEquals("https://simkl.com/movies/456", result?.sourceUrl)
    }

    @Test
    fun `resolver rejects missing links and mismatched content`() {
        assertNull(
            resolveTrackingAttribution(
                contentId = "tt123",
                providerId = TrackingProviderId.SIMKL,
                items = sequenceOf(
                    attributedItem("tt999", "simkl", "https://simkl.com/movies/999"),
                    attributedItem("tt123", "simkl", null),
                ),
            ),
        )
    }

    private fun attributedItem(
        contentId: String,
        providerId: String,
        sourceUrl: String?,
        providerItemId: String? = null,
    ): TrackingAttributedItem = object : TrackingAttributedItem {
        override val trackingContentId = contentId
        override val trackingProviderId = providerId
        override val trackingProviderItemId = providerItemId
        override val trackingSourceUrl = sourceUrl
    }
}
