package com.nuvio.app.features.tracking

data class TrackingMembershipResolution(
    val providerId: TrackingProviderId,
    val requestedListKey: String,
    val resolvedListKey: String,
) {
    val wasRewritten: Boolean
        get() = requestedListKey != resolvedListKey
}

enum class TrackingMembershipRemovalImpact {
    WATCHED_HISTORY,
    RATING,
}

data class TrackingMembershipRemovalConfirmation(
    val providerId: TrackingProviderId,
    val impacts: Set<TrackingMembershipRemovalImpact>,
)

data class TrackingMembershipApplyResult(
    val resolutions: List<TrackingMembershipResolution> = emptyList(),
    val requiredRemovalConfirmations: List<TrackingMembershipRemovalConfirmation> = emptyList(),
) {
    val rewrites: List<TrackingMembershipResolution>
        get() = resolutions.filter(TrackingMembershipResolution::wasRewritten)

    val requiresRemovalConfirmation: Boolean
        get() = requiredRemovalConfirmations.isNotEmpty()
}
