package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertEquals

class StreamAutoPlaySmartSelectionTest {
    @Test
    fun `first stream autoplay uses smart ranking instead of provider order`() {
        val low = StreamItem(
            name = "720p",
            url = "https://cdn.example.com/720p.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = "720p")
                    )
                )
            ),
        )
        val high = StreamItem(
            name = "1080p",
            url = "https://cdn.example.com/1080p.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = "1080p")
                    )
                )
            ),
        )

        val selected = StreamAutoPlaySelector.selectAutoPlayStream(
            streams = listOf(low, high),
            mode = StreamAutoPlayMode.FIRST_STREAM,
            regexPattern = "",
            source = StreamAutoPlaySource.ALL_SOURCES,
            installedAddonNames = emptySet(),
            selectedAddons = emptySet(),
            selectedPlugins = emptySet(),
        )

        assertEquals(high, selected)
    }

    @Test
    fun `manual mode does not apply smart ranking`() {
        val first = StreamItem(
            name = "first",
            url = "https://cdn.example.com/first.mkv",
            addonName = "Test",
            addonId = "addon.test",
        )
        val second = StreamItem(
            name = "second",
            url = "https://cdn.example.com/second.mkv",
            addonName = "Test",
            addonId = "addon.test",
        )

        val evaluation = StreamAutoPlaySelector.evaluateAutoPlayStream(
            streams = listOf(first, second),
            mode = StreamAutoPlayMode.MANUAL,
            regexPattern = "",
            source = StreamAutoPlaySource.ALL_SOURCES,
            installedAddonNames = emptySet(),
            selectedAddons = emptySet(),
            selectedPlugins = emptySet(),
        )

        assertEquals(null, evaluation.stream)
        assertEquals(emptyList(), evaluation.readyStreams)
    }
}
