package com.nuvio.app.features.addons

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AddonRefreshRulesTest {

    @Test
    fun `remote snapshot replaces order names and enabled states atomically`() {
        val preservedManifest = refreshManifest("existing")
        val existing = listOf(
            ManagedAddon(
                manifestUrl = "https://one.example/manifest.json",
                manifest = preservedManifest,
                userSetName = "Old name",
                enabled = false,
            ),
        )

        val merged = mergeRemoteAddonSnapshot(
            existingAddons = existing,
            remoteAddons = listOf(
                RemoteAddonValue(
                    manifestUrl = "https://two.example/manifest.json",
                    userSetName = "Second",
                    enabled = false,
                ),
                RemoteAddonValue(
                    manifestUrl = "https://one.example/manifest.json",
                    userSetName = "Renamed",
                    enabled = true,
                ),
            ),
            forceManifestRefresh = false,
        )

        assertEquals(
            listOf(
                "https://two.example/manifest.json",
                "https://one.example/manifest.json",
            ),
            merged.map(ManagedAddon::manifestUrl),
        )
        assertEquals("Second", merged[0].userSetName)
        assertFalse(merged[0].enabled)
        assertEquals("Renamed", merged[1].userSetName)
        assertTrue(merged[1].enabled)
        assertSame(preservedManifest, merged[1].manifest)
    }

    @Test
    fun `forced snapshot refreshes enabled manifests only`() {
        val merged = mergeRemoteAddonSnapshot(
            existingAddons = listOf(
                ManagedAddon(
                    manifestUrl = "https://one.example/manifest.json",
                    manifest = refreshManifest("one"),
                    errorMessage = "old error",
                ),
            ),
            remoteAddons = listOf(
                RemoteAddonValue(
                    manifestUrl = "https://one.example/manifest.json",
                    userSetName = null,
                    enabled = true,
                ),
                RemoteAddonValue(
                    manifestUrl = "https://two.example/manifest.json",
                    userSetName = null,
                    enabled = false,
                ),
            ),
            forceManifestRefresh = true,
        )

        assertTrue(merged[0].isRefreshing)
        assertNull(merged[0].errorMessage)
        assertFalse(merged[1].isRefreshing)
    }

    @Test
    fun `remote disable stops an in flight refresh`() {
        val merged = mergeRemoteAddonSnapshot(
            existingAddons = listOf(
                ManagedAddon(
                    manifestUrl = "https://one.example/manifest.json",
                    isRefreshing = true,
                ),
            ),
            remoteAddons = listOf(
                RemoteAddonValue(
                    manifestUrl = "https://one.example/manifest.json",
                    userSetName = null,
                    enabled = false,
                ),
            ),
            forceManifestRefresh = true,
        )

        assertFalse(merged.single().isRefreshing)
        assertFalse(merged.single().enabled)
    }

    @Test
    fun `remote snapshot clears a removed custom name`() {
        val merged = mergeRemoteAddonSnapshot(
            existingAddons = listOf(
                ManagedAddon(
                    manifestUrl = "https://one.example/manifest.json",
                    manifest = refreshManifest("one"),
                    userSetName = "Old custom name",
                ),
            ),
            remoteAddons = listOf(
                RemoteAddonValue(
                    manifestUrl = "https://one.example/manifest.json",
                    userSetName = null,
                    enabled = true,
                ),
            ),
            forceManifestRefresh = false,
        )

        assertNull(merged.single().userSetName)
    }

    @Test
    fun `successful empty snapshot clears the profile`() {
        val merged = mergeRemoteAddonSnapshot(
            existingAddons = listOf(
                ManagedAddon(
                    manifestUrl = "https://one.example/manifest.json",
                    manifest = refreshManifest("one"),
                ),
            ),
            remoteAddons = emptyList(),
            forceManifestRefresh = true,
        )

        assertTrue(merged.isEmpty())
    }

    @Test
    fun `remote snapshot is rejected when profile or local state changed`() {
        assertTrue(
            canApplyRemoteAddonSnapshot(
                currentProfileId = 2,
                snapshotProfileId = 2,
                currentMutationRevision = 7,
                expectedMutationRevision = 7,
                hasPendingPush = false,
            ),
        )
        assertFalse(
            canApplyRemoteAddonSnapshot(
                currentProfileId = 2,
                snapshotProfileId = 1,
                currentMutationRevision = 7,
                expectedMutationRevision = 7,
                hasPendingPush = false,
            ),
        )
        assertFalse(
            canApplyRemoteAddonSnapshot(
                currentProfileId = 2,
                snapshotProfileId = 2,
                currentMutationRevision = 8,
                expectedMutationRevision = 7,
                hasPendingPush = false,
            ),
        )
        assertFalse(
            canApplyRemoteAddonSnapshot(
                currentProfileId = 2,
                snapshotProfileId = 2,
                currentMutationRevision = 7,
                expectedMutationRevision = 7,
                hasPendingPush = true,
            ),
        )
    }
}

private fun refreshManifest(id: String) = AddonManifest(
    id = id,
    name = id,
    description = "",
    version = "1.0.0",
    resources = listOf(AddonResource(name = "catalog", types = listOf("movie"))),
    types = listOf("movie"),
    catalogs = listOf(AddonCatalog(type = "movie", id = "popular", name = "Popular")),
    transportUrl = "https://$id.example/manifest.json",
)
