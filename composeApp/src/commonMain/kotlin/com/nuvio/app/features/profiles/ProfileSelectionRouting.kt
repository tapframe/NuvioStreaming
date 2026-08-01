package com.nuvio.app.features.profiles

internal fun routeProfileSelection(
    profile: NuvioProfile,
    isEditMode: Boolean,
    onEditProfile: (NuvioProfile) -> Unit,
    onPinRequired: (NuvioProfile) -> Unit,
    onProfileSelected: (NuvioProfile) -> Unit,
) {
    when {
        isEditMode -> onEditProfile(profile)
        profile.pinEnabled -> onPinRequired(profile)
        else -> onProfileSelected(profile)
    }
}
