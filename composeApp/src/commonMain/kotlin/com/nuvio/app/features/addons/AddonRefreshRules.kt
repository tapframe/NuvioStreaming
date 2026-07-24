package com.nuvio.app.features.addons

internal data class RemoteAddonValue(
    val manifestUrl: String,
    val userSetName: String?,
    val enabled: Boolean,
)

internal fun canApplyRemoteAddonSnapshot(
    currentProfileId: Int,
    snapshotProfileId: Int,
    currentMutationRevision: Long,
    expectedMutationRevision: Long,
    hasPendingPush: Boolean,
): Boolean =
    currentProfileId == snapshotProfileId &&
        currentMutationRevision == expectedMutationRevision &&
        !hasPendingPush

internal fun mergeRemoteAddonSnapshot(
    existingAddons: List<ManagedAddon>,
    remoteAddons: List<RemoteAddonValue>,
    forceManifestRefresh: Boolean,
): List<ManagedAddon> {
    val existingByUrl = existingAddons.associateBy(ManagedAddon::manifestUrl)
    return remoteAddons.map { remote ->
        val existing = existingByUrl[remote.manifestUrl]
        val normalizedName = remote.userSetName?.takeIf(String::isNotBlank)
        val merged = when {
            existing == null -> ManagedAddon(
                manifestUrl = remote.manifestUrl,
                isRefreshing = remote.enabled,
                userSetName = normalizedName,
                enabled = remote.enabled,
            )
            existing.manifest != null -> existing.copy(
                manifestUrl = remote.manifestUrl,
                isRefreshing = false,
                userSetName = normalizedName,
                enabled = remote.enabled,
            )
            existing.isRefreshing -> existing.copy(
                manifestUrl = remote.manifestUrl,
                userSetName = normalizedName,
                enabled = remote.enabled,
            )
            else -> existing.copy(
                manifestUrl = remote.manifestUrl,
                isRefreshing = remote.enabled,
                errorMessage = null,
                userSetName = normalizedName,
                enabled = remote.enabled,
            )
        }
        when {
            !merged.enabled -> merged.copy(isRefreshing = false)
            forceManifestRefresh -> merged.copy(isRefreshing = true, errorMessage = null)
            else -> merged
        }
    }
}
