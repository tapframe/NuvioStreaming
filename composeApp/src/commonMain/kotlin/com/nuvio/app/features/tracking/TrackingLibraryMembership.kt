package com.nuvio.app.features.tracking

data class TrackingMembershipResolution(
    val providerId: TrackingProviderId,
    val requestedListKey: String,
    val resolvedListKey: String,
) {
    val wasRewritten: Boolean
        get() = requestedListKey != resolvedListKey
}

data class TrackingMembershipApplyResult(
    val resolutions: List<TrackingMembershipResolution> = emptyList(),
) {
    val rewrites: List<TrackingMembershipResolution>
        get() = resolutions.filter(TrackingMembershipResolution::wasRewritten)
}
