package com.nuvio.app.features.addons

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AddonNameStorageCodecTest {

    @Test
    fun `round trips a simple names map`() {
        val names = mapOf(
            "https://a.example/manifest.json" to "My Cinemeta",
            "https://b.example/manifest.json" to "Torrentio (4K)",
        )

        val restored = AddonNameStorageCodec.decode(AddonNameStorageCodec.encode(names))

        assertEquals(names, restored)
    }

    @Test
    fun `persist then initialize restores a custom name`() {
        // Simulates: user renames addon -> persist() -> app restart -> initialize() reload.
        val url = "https://torrentio.example/manifest.json"
        val customName = "Torrentio Pro"

        // persist(): only userSetName-bearing addons are stored.
        val stored = AddonNameStorageCodec.encode(mapOf(url to customName))

        // initialize(): reload and apply to a freshly rebuilt addon.
        val namesByUrl = AddonNameStorageCodec.decode(stored)
        val restored = ManagedAddon(
            manifestUrl = url,
            manifest = manifestNamed("Torrentio"),
            userSetName = namesByUrl[url],
        )

        assertEquals(customName, restored.userSetName)
        // displayTitle prefers the custom name over the manifest default.
        assertEquals(customName, restored.displayTitle)
    }

    @Test
    fun `names with tabs survive round trip`() {
        // The legacy "\t" line format would have corrupted this.
        val names = mapOf("https://a.example/manifest.json" to "Col\tumn\tName")

        val restored = AddonNameStorageCodec.decode(AddonNameStorageCodec.encode(names))

        assertEquals(names, restored)
    }

    @Test
    fun `names with newlines survive round trip`() {
        // The legacy "\n" join/split would have corrupted this.
        val names = mapOf("https://a.example/manifest.json" to "Line1\nLine2")

        val restored = AddonNameStorageCodec.decode(AddonNameStorageCodec.encode(names))

        assertEquals(names, restored)
    }

    @Test
    fun `leading and trailing whitespace in names is preserved`() {
        // The legacy trim() altered these.
        val names = mapOf("https://a.example/manifest.json" to "  spaced name  ")

        val restored = AddonNameStorageCodec.decode(AddonNameStorageCodec.encode(names))

        assertEquals(names, restored)
    }

    @Test
    fun `names with quotes and unicode survive round trip`() {
        val names = mapOf(
            "https://a.example/manifest.json" to "Sa\"id's \uD83C\uDFAC addon",
            "https://b.example/manifest.json" to "Ünïcödé 日本語",
        )

        val restored = AddonNameStorageCodec.decode(AddonNameStorageCodec.encode(names))

        assertEquals(names, restored)
    }

    @Test
    fun `blank urls and names are dropped on encode`() {
        val names = mapOf(
            "https://keep.example/manifest.json" to "Keep",
            "" to "no url",
            "https://blank-name.example/manifest.json" to "",
            "   " to "blank url",
        )

        val restored = AddonNameStorageCodec.decode(AddonNameStorageCodec.encode(names))

        assertEquals(mapOf("https://keep.example/manifest.json" to "Keep"), restored)
    }

    @Test
    fun `decoding null returns empty map`() {
        assertTrue(AddonNameStorageCodec.decode(null).isEmpty())
    }

    @Test
    fun `decoding blank returns empty map`() {
        assertTrue(AddonNameStorageCodec.decode("   ").isEmpty())
    }

    @Test
    fun `decoding malformed json returns empty map and does not throw`() {
        assertTrue(AddonNameStorageCodec.decode("{not valid json").isEmpty())
        assertTrue(AddonNameStorageCodec.decode("[\"array\",\"not\",\"object\"]").isEmpty())
        assertTrue(AddonNameStorageCodec.decode("42").isEmpty())
    }

    @Test
    fun `decoding tolerates non-string and blank values`() {
        val payload = """{"https://a/manifest.json":"ok","https://b/manifest.json":123,"https://c/manifest.json":""}"""

        val restored = AddonNameStorageCodec.decode(payload)

        assertEquals(mapOf("https://a/manifest.json" to "ok"), restored)
    }

    @Test
    fun `empty map encodes to empty json object and decodes back to empty`() {
        val encoded = AddonNameStorageCodec.encode(emptyMap())
        assertEquals("{}", encoded)
        assertTrue(AddonNameStorageCodec.decode(encoded).isEmpty())
    }
}

private fun manifestNamed(name: String) = AddonManifest(
    id = name,
    name = name,
    description = "",
    version = "1.0.0",
    resources = listOf(AddonResource(name = "catalog", types = listOf("movie"))),
    types = listOf("movie"),
    catalogs = listOf(AddonCatalog(type = "movie", id = "popular", name = "Popular")),
    transportUrl = "https://$name.example/manifest.json",
)
