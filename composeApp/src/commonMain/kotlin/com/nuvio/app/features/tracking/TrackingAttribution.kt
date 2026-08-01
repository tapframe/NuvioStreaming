package com.nuvio.app.features.tracking

interface TrackingAttributedItem {
    val trackingContentId: String
    val trackingProviderId: String?
    val trackingProviderItemId: String?
    val trackingSourceUrl: String?
}

data class TrackingAttribution(
    val providerId: TrackingProviderId,
    val providerItemId: String?,
    val sourceUrl: String,
)

internal fun resolveTrackingAttribution(
    contentId: String,
    providerId: TrackingProviderId,
    items: Sequence<TrackingAttributedItem>,
): TrackingAttribution? = items.firstNotNullOfOrNull { item ->
    val sourceUrl = item.trackingSourceUrl?.trim()?.takeIf(String::isNotEmpty)
    if (
        sourceUrl != null &&
        item.trackingContentId.equals(contentId, ignoreCase = true) &&
        TrackingProviderId.fromStorage(item.trackingProviderId) == providerId
    ) {
        TrackingAttribution(
            providerId = providerId,
            providerItemId = item.trackingProviderItemId,
            sourceUrl = sourceUrl,
        )
    } else {
        null
    }
}
