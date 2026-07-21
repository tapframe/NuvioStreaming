package com.nuvio.app.features.addons

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AddonModelsTest {

    @Test
    fun `disabled addon is installed but not active`() {
        val addon = ManagedAddon(
            manifestUrl = "https://example.test/manifest.json",
            manifest = manifest(),
            enabled = false,
        )

        assertFalse(addon.isActive)
        assertEquals(0, listOf(addon).toOverview().activeAddons)
        assertEquals(0, listOf(addon).toOverview().totalCatalogs)
    }

    @Test
    fun `enabled addons helper filters disabled addons`() {
        val enabled = ManagedAddon(
            manifestUrl = "https://enabled.example/manifest.json",
            manifest = manifest(id = "enabled"),
            enabled = true,
        )
        val disabled = ManagedAddon(
            manifestUrl = "https://disabled.example/manifest.json",
            manifest = manifest(id = "disabled"),
            enabled = false,
        )

        assertEquals(listOf(enabled), listOf(enabled, disabled).enabledAddons())
        assertTrue(enabled.isActive)
    }

    @Test
    fun `addon name overrides survive local storage round trip`() {
        val manifestUrl = "https://example.test/configured/user\tvalue/manifest.json"
        val customName = "My renamed addon\nwith a second line"
        val payload = listOf(
            ManagedAddon(
                manifestUrl = manifestUrl,
                userSetName = customName,
            ),
        ).encodeNameOverrides()

        assertEquals(mapOf(manifestUrl to customName), decodeAddonNameOverrides(payload))
    }

    @Test
    fun `pending addon restores its locally stored server name`() {
        val addon = null.toPendingAddon(
            manifestUrl = "https://example.test/manifest.json",
            userSetName = "Renamed on the website",
            enabled = true,
        )

        assertEquals("Renamed on the website", addon.userSetName)
        assertEquals("Renamed on the website", addon.displayTitle)
    }

    @Test
    fun `blank server name clears a cached override`() {
        val addon = ManagedAddon(
            manifestUrl = "https://example.test/manifest.json",
            manifest = manifest(),
            userSetName = "Stale cached name",
        ).toPendingAddon(
            manifestUrl = "https://example.test/manifest.json",
            userSetName = null,
            replaceUserSetName = true,
            enabled = true,
        )

        assertNull(addon.userSetName)
        assertEquals("addon", addon.displayTitle)
    }

    @Test
    fun `profile operation becomes stale when profile changes`() {
        val tracker = AddonProfileOperationTracker(initialProfileId = 1)
        val profileOnePull = tracker.snapshot()

        tracker.activate(profileId = 2)

        assertFalse(tracker.isCurrent(profileOnePull))
        assertTrue(tracker.isCurrent(tracker.snapshot()))
    }

    @Test
    fun `new generation invalidates work even for the same effective profile`() {
        val tracker = AddonProfileOperationTracker(initialProfileId = 1)
        val oldPull = tracker.snapshot()

        tracker.activate(profileId = 1)

        assertFalse(tracker.isCurrent(oldPull))
    }

    @Test
    fun `malformed addon name cache is ignored`() {
        assertTrue(decodeAddonNameOverrides("not-json").isEmpty())
    }
}

private fun manifest(id: String = "addon") = AddonManifest(
    id = id,
    name = id,
    description = "",
    version = "1.0.0",
    resources = listOf(AddonResource(name = "catalog", types = listOf("movie"))),
    types = listOf("movie"),
    catalogs = listOf(AddonCatalog(type = "movie", id = "popular", name = "Popular")),
    transportUrl = "https://$id.example/manifest.json",
)
