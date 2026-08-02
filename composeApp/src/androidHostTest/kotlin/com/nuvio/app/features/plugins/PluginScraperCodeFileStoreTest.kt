package com.nuvio.app.features.plugins

import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PluginScraperCodeFileStoreTest {
    @Test
    fun scraperCodeRoundTripsWithoutRewritingUnlessRequested() {
        val root = Files.createTempDirectory("nuvio-plugin-code").toFile()
        try {
            val store = PluginScraperCodeFileStore(root)
            val scraperId = "https://plugins.example/manifest.json:scraper"
            val original = "x".repeat(4 * 1024 * 1024)
            val refreshed = "updated scraper"

            assertFalse(store.contains(1, scraperId))
            assertTrue(store.save(1, scraperId, original, overwrite = false))
            assertEquals(original, store.load(1, scraperId))

            assertTrue(store.save(1, scraperId, refreshed, overwrite = false))
            assertEquals(original, store.load(1, scraperId))

            assertTrue(store.save(1, scraperId, refreshed, overwrite = true))
            assertEquals(refreshed, store.load(1, scraperId))
            assertFalse(store.contains(2, scraperId))
        } finally {
            root.deleteRecursively()
        }
    }
}
