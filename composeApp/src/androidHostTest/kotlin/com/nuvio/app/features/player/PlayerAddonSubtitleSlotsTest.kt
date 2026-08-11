package com.nuvio.app.features.player

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class PlayerAddonSubtitleSlotsTest {

    @Test
    fun detectsSupportedTextSubtitleFormatsFromDownloadedBytes() {
        assertEquals(
            "application/x-subrip",
            detectSideLoadedSubtitleMimeType("1\n00:00:01,000 --> 00:00:02,000\nHello".encodeToByteArray()),
        )
        assertEquals(
            "text/vtt",
            detectSideLoadedSubtitleMimeType("\uFEFFWEBVTT\n\n00:01.000 --> 00:02.000\nHello".encodeToByteArray()),
        )
        assertEquals(
            "text/x-ssa",
            detectSideLoadedSubtitleMimeType("[Script Info]\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello".encodeToByteArray()),
        )
        assertEquals(
            "application/ttml+xml",
            detectSideLoadedSubtitleMimeType("<?xml version=\"1.0\"?><tt xmlns=\"http://www.w3.org/ns/ttml\"><body /></tt>".encodeToByteArray()),
        )
    }

    @Test
    fun unknownTextFallsBackToSubRipBecauseAddonResultsArePredominantlySrt() {
        assertEquals(
            "application/x-subrip",
            detectSideLoadedSubtitleMimeType("not enough data to identify the format".encodeToByteArray()),
        )
    }

    @Test
    fun addonSlotsKeepSignedUrlsExactAndRemainStableAcrossReuse() {
        val registry = AddonSubtitleSlotRegistry(slotCount = 2)
        val signedUrl = "https://subs.example/file/42?token=a%2Bb&expires=4102444800"
        val first = addonSubtitle(id = "a", url = signedUrl)
        val second = addonSubtitle(id = "b", url = "https://subs.example/file/43")

        val firstSlot = assertNotNull(registry.bind(first))
        val secondSlot = assertNotNull(registry.bind(second))

        assertEquals(firstSlot, registry.bind(first))
        assertEquals(signedUrl, registry.resolveUrl(firstSlot.uri))
        assertEquals(second.url, registry.resolveUrl(secondSlot.uri))
    }

    @Test
    fun urlOnlyRestoreReusesTheSameSlotWhenFullAddonMetadataArrives() {
        val registry = AddonSubtitleSlotRegistry(slotCount = 2)
        val url = "https://subs.example/file/42"

        val restoredSlot = assertNotNull(registry.bind(url))
        val metadataSlot = assertNotNull(registry.bind(addonSubtitle(id = "opensubs-42", url = url)))

        assertEquals(restoredSlot, metadataSlot)
    }

    @Test
    fun slotCapacityIsBounded() {
        val registry = AddonSubtitleSlotRegistry(slotCount = 2)

        assertNotNull(registry.bind(addonSubtitle(id = "a", url = "https://subs.example/a")))
        assertNotNull(registry.bind(addonSubtitle(id = "b", url = "https://subs.example/b")))
        assertNull(registry.bind(addonSubtitle(id = "c", url = "https://subs.example/c")))
    }

    @Test
    fun hardClearReleasesBindingsWithoutRemovingReusableSlots() {
        val registry = AddonSubtitleSlotRegistry(slotCount = 1)
        val first = assertNotNull(
            registry.bind(addonSubtitle(id = "a", url = "https://subs.example/a")),
        )

        registry.clear()

        assertNull(registry.resolveUrl(first.uri))
        val rebound = assertNotNull(
            registry.bind(addonSubtitle(id = "b", url = "https://subs.example/b")),
        )
        assertEquals(first, rebound)
        assertEquals("https://subs.example/b", registry.resolveUrl(rebound.uri))
    }

    private fun addonSubtitle(id: String, url: String) = AddonSubtitle(
        id = id,
        url = url,
        language = "en",
        display = id,
        addonName = "Addon",
    )
}
