package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class StreamAutoPlayLoadingPolicyTest {

    @Test
    fun `installed addons are loaded while plugins are still loading`() {
        val groups = listOf(
            group(addonId = "addon:torrentio", isLoading = false),
            group(addonId = "plugin:comet", isLoading = true),
        )

        assertTrue(
            groups.areAutoPlaySourcesLoaded(
                source = StreamAutoPlaySource.INSTALLED_ADDONS_ONLY,
                installedAddonIds = setOf("addon:torrentio"),
            ),
        )
    }

    @Test
    fun `installed addons remain loading until every addon finishes`() {
        val groups = listOf(
            group(addonId = "addon:torrentio", isLoading = false),
            group(addonId = "addon:comet", isLoading = true),
            group(addonId = "plugin:mediafusion", isLoading = false),
        )

        assertFalse(
            groups.areAutoPlaySourcesLoaded(
                source = StreamAutoPlaySource.INSTALLED_ADDONS_ONLY,
                installedAddonIds = setOf("addon:torrentio", "addon:comet"),
            ),
        )
    }

    @Test
    fun `enabled plugins are loaded while addons are still loading`() {
        val groups = listOf(
            group(addonId = "addon:torrentio", isLoading = true),
            group(addonId = "plugin:comet", isLoading = false),
        )

        assertTrue(
            groups.areAutoPlaySourcesLoaded(
                source = StreamAutoPlaySource.ENABLED_PLUGINS_ONLY,
                installedAddonIds = setOf("addon:torrentio"),
            ),
        )
    }

    @Test
    fun `all sources wait for addons and plugins`() {
        val groups = listOf(
            group(addonId = "addon:torrentio", isLoading = false),
            group(addonId = "plugin:comet", isLoading = true),
        )

        assertFalse(
            groups.areAutoPlaySourcesLoaded(
                source = StreamAutoPlaySource.ALL_SOURCES,
                installedAddonIds = setOf("addon:torrentio"),
            ),
        )
    }

    private fun group(addonId: String, isLoading: Boolean): AddonStreamGroup =
        AddonStreamGroup(
            addonName = addonId,
            addonId = addonId,
            streams = emptyList(),
            isLoading = isLoading,
        )
}
