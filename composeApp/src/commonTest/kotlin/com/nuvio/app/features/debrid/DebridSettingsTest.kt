package com.nuvio.app.features.debrid

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DebridSettingsTest {
    @Test
    fun `normalizes provider ids when reading api keys`() {
        val settings = DebridSettings(
            providerApiKeys = mapOf(DebridProviders.TORBOX_ID to "tb_key"),
        )

        assertEquals("tb_key", settings.apiKeyFor("TORBOX"))
        assertEquals("tb_key", settings.torboxApiKey)
        assertEquals("", settings.realDebridApiKey)
    }

    @Test
    fun `configured services are driven by visible registered providers`() {
        val settings = DebridSettings(
            providerApiKeys = mapOf(
                DebridProviders.TORBOX_ID to "tb_key",
                DebridProviders.PREMIUMIZE_ID to "pm_key",
                DebridProviders.REAL_DEBRID_ID to "rd_key",
            ),
        )

        val services = DebridProviders.configuredServices(settings)

        assertEquals(listOf(DebridProviders.TORBOX_ID, DebridProviders.PREMIUMIZE_ID), services.map { it.provider.id })
        assertEquals(listOf("tb_key", "pm_key"), services.map { it.apiKey })
        assertTrue(settings.hasAnyApiKey)
        assertFalse(DebridProviders.isVisible(DebridProviders.REAL_DEBRID_ID))
    }

    @Test
    fun `preferred resolver uses saved provider when connected and falls back otherwise`() {
        val preferred = DebridSettings(
            enabled = true,
            providerApiKeys = mapOf(
                DebridProviders.TORBOX_ID to "tb_key",
                DebridProviders.PREMIUMIZE_ID to "pm_key",
            ),
            preferredResolverProviderId = DebridProviders.PREMIUMIZE_ID,
        )
        val fallback = preferred.copy(preferredResolverProviderId = DebridProviders.REAL_DEBRID_ID)

        assertEquals(DebridProviders.PREMIUMIZE_ID, preferred.activeResolverProviderId)
        assertEquals(DebridProviders.TORBOX_ID, fallback.activeResolverProviderId)
        assertTrue(preferred.canResolvePlayableLinks)
    }

    @Test
    fun `cloud library and link resolving capabilities are independent`() {
        val settings = DebridSettings(
            enabled = false,
            cloudLibraryEnabled = true,
            providerApiKeys = mapOf(DebridProviders.TORBOX_ID to "tb_key"),
        )

        assertTrue(settings.canUseCloudLibrary)
        assertFalse(settings.canResolvePlayableLinks)
    }
}
