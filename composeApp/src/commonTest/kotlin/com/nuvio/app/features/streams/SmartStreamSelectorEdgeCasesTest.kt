package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Comprehensive edge case tests for SmartStreamSelector.
 * Covers resolution parsing, bandwidth calculations, HDR handling, and preference extraction.
 */
class SmartStreamSelectorEdgeCasesTest {

    // ============ RESOLUTION PARSING EDGE CASES ============

    @Test
    fun `parses non-standard resolution formats`() {
        fun stream(name: String, resolution: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution)
                    )
                )
            )
        )
        
        val qhd = stream("qhd", "QHD")
        val dci = stream("dci", "DCI 4K")
        val fhd = stream("fhd", "FHD 1080")
        
        val ranked = SmartStreamSelector.rank(listOf(qhd, fhd, dci))
        // QHD (1440p) should rank higher than FHD (1080p)
        assertEquals(qhd, ranked[0])
    }

    @Test
    fun `handles missing resolution gracefully`() {
        fun stream(name: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
        )
        
        val noRes = stream("unknown")
        val withRes = stream("720p_stream")
        
        val ranked = SmartStreamSelector.rank(listOf(noRes, withRes))
        // Streams with resolution should rank higher than those without
        assertEquals(withRes, ranked[0])
    }

    @Test
    fun `parses resolution from description and filename`() {
        fun stream(name: String, description: String) = StreamItem(
            name = name,
            description = description,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
        )
        
        val descRes = stream("stream1", "1080p HDR movie")
        val noRes = stream("stream2", "streaming source")
        
        val ranked = SmartStreamSelector.rank(listOf(noRes, descRes))
        assertEquals(descRes, ranked[0])
    }

    // ============ BANDWIDTH CALCULATION EDGE CASES ============

    @Test
    fun `handles zero bandwidth gracefully`() {
        fun stream(name: String, resolution: String, size: Long) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            behaviorHints = StreamBehaviorHints(videoSize = size),
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution, duration = 600)
                    )
                )
            )
        )
        
        val low = stream("720p", "720p", 40_000_000)
        val high = stream("1080p", "1080p", 100_000_000)
        
        // With zero bandwidth, quality ranking should apply
        val ranked = SmartStreamSelector.rank(
            listOf(low, high),
            SmartStreamSelector.Context(estimatedBandwidthKbps = 0)
        )
        assertEquals(high, ranked[0])
    }

    @Test
    fun `handles null bandwidth gracefully`() {
        fun stream(name: String, resolution: String, size: Long) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            behaviorHints = StreamBehaviorHints(videoSize = size),
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution, duration = 600)
                    )
                )
            )
        )
        
        val low = stream("720p", "720p", 40_000_000)
        val high = stream("1080p", "1080p", 100_000_000)
        
        // With null bandwidth, quality ranking should apply
        val ranked = SmartStreamSelector.rank(
            listOf(low, high),
            SmartStreamSelector.Context(estimatedBandwidthKbps = null)
        )
        assertEquals(high, ranked[0])
    }

    @Test
    fun `handles missing size or duration gracefully`() {
        fun stream(name: String, resolution: String, size: Long? = null, duration: Int? = null) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            behaviorHints = StreamBehaviorHints(videoSize = size),
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution, duration = duration)
                    )
                )
            )
        )
        
        val incomplete1 = stream("nosize", "1080p", size = null, duration = 600)
        val incomplete2 = stream("noduration", "1080p", size = 100_000_000, duration = null)
        val complete = stream("complete", "1080p", size = 100_000_000, duration = 600)
        
        // Complete streams should rank higher
        val ranked = SmartStreamSelector.rank(
            listOf(incomplete1, incomplete2, complete),
            SmartStreamSelector.Context(estimatedBandwidthKbps = 5_000)
        )
        assertEquals(complete, ranked[0])
    }

    @Test
    fun `applies softer penalty for high-bitrate streams`() {
        fun stream(name: String, resolution: String, size: Long) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            behaviorHints = StreamBehaviorHints(videoSize = size),
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution, duration = 600)
                    )
                )
            )
        )
        
        // Stream requiring 150% of bandwidth still ranks above lower quality
        val lowQuality = stream("480p", "480p", 20_000_000)
        val highBitrate = stream("1080p-high-br", "1080p", 150_000_000)
        
        val ranked = SmartStreamSelector.rank(
            listOf(lowQuality, highBitrate),
            SmartStreamSelector.Context(estimatedBandwidthKbps = 1_000)
        )
        // 1080p should still win despite bandwidth penalty
        assertEquals(highBitrate, ranked[0])
    }

    // ============ HDR AND CODEC EDGE CASES ============

    @Test
    fun `prefers matching HDR type when device supports specific types`() {
        fun stream(name: String, hdr: List<String>) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = "1080p", hdr = hdr)
                    )
                )
            )
        )
        
        val dv = stream("dolby-vision", listOf("dolbyvision"))
        val hdr10 = stream("hdr10", listOf("hdr10"))
        val sdr = stream("sdr", emptyList())
        
        // Device supports DV specifically
        val ranked = SmartStreamSelector.rank(
            listOf(sdr, hdr10, dv),
            SmartStreamSelector.Context(supportedHdrTypes = setOf("dolbyvision", "hdr10"))
        )
        assertEquals(dv, ranked[0])
    }

    @Test
    fun `handles conflicting HDR type names gracefully`() {
        fun stream(name: String, hdrStr: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(
                            resolution = "1080p",
                            hdr = listOf(hdrStr)
                        )
                    )
                )
            )
        )
        
        val dv = stream("dv", "dolby vision")
        val hdr10plus = stream("hdr10plus", "hdr10plus")
        
        val ranked = SmartStreamSelector.rank(
            listOf(dv, hdr10plus),
            SmartStreamSelector.Context(supportsHdr = true)
        )
        // Both should be ranked, original order preserved if equal score
        assertEquals(2, ranked.size)
    }

    @Test
    fun `prefers preferred codec when specified`() {
        fun stream(name: String, codec: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(
                            resolution = "1080p",
                            codec = codec
                        )
                    )
                )
            )
        )
        
        val av1 = stream("av1-stream", "av1")
        val hevc = stream("hevc-stream", "hevc")
        val h264 = stream("h264-stream", "h264")
        
        val ranked = SmartStreamSelector.rank(
            listOf(h264, av1, hevc),
            SmartStreamSelector.Context(preferredVideoCodec = "av1")
        )
        assertEquals(av1, ranked[0])
    }

    // ============ DISPLAY CAPABILITY EDGE CASES ============

    @Test
    fun `handles null display dimensions gracefully`() {
        fun stream(name: String, resolution: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution)
                    )
                )
            )
        )
        
        val low = stream("720p", "720p")
        val high = stream("1080p", "1080p")
        
        // With null display height, general quality ranking applies
        val ranked = SmartStreamSelector.rank(
            listOf(low, high),
            SmartStreamSelector.Context(displayHeight = null)
        )
        assertEquals(high, ranked[0])
    }

    @Test
    fun `handles zero display dimensions gracefully`() {
        fun stream(name: String, resolution: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution)
                    )
                )
            )
        )
        
        val low = stream("720p", "720p")
        val high = stream("1080p", "1080p")
        
        // With zero display height, general quality ranking applies
        val ranked = SmartStreamSelector.rank(
            listOf(low, high),
            SmartStreamSelector.Context(displayHeight = 0)
        )
        assertEquals(high, ranked[0])
    }

    @Test
    fun `adapts to small mobile displays`() {
        fun stream(name: String, resolution: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution)
                    )
                )
            )
        )
        
        val low = stream("720p", "720p")
        val high = stream("1080p", "1080p")
        
        // Small mobile display (480p height)
        val ranked = SmartStreamSelector.rank(
            listOf(low, high),
            SmartStreamSelector.Context(displayHeight = 480)
        )
        // 720p should rank above 1080p for small display
        assertEquals(low, ranked[0])
    }

    // ============ EXPLICIT PREFERENCE EDGE CASES ============

    @Test
    fun `handles empty preference list gracefully`() {
        fun stream(name: String, resolution: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution)
                    )
                )
            )
        )
        
        val low = stream("720p", "720p")
        val high = stream("1080p", "1080p")
        
        val ranked = SmartStreamSelector.rank(
            listOf(low, high),
            SmartStreamSelector.Context(preferredStreamTerms = emptyList())
        )
        assertEquals(high, ranked[0])
    }

    @Test
    fun `handles whitespace-only preferences gracefully`() {
        fun stream(name: String, resolution: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution)
                    )
                )
            )
        )
        
        val low = stream("720p", "720p")
        val high = stream("1080p", "1080p")
        
        // Preferences with only whitespace should be ignored
        val ranked = SmartStreamSelector.rank(
            listOf(low, high),
            SmartStreamSelector.Context(preferredStreamTerms = listOf("   ", ""))
        )
        assertEquals(high, ranked[0])
    }

    @Test
    fun `respects preference order even with lower quality match`() {
        fun stream(name: String, resolution: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution)
                    )
                )
            )
        )
        
        val secondary = stream("2nd-choice", "1080p")
        val primary = stream("1st-choice", "480p")
        val tertiary = stream("3rd-choice", "4k")
        
        // Preferences: ["1st-choice", "2nd-choice", "3rd-choice"]
        val ranked = SmartStreamSelector.rank(
            listOf(tertiary, secondary, primary),
            SmartStreamSelector.Context(
                preferredStreamTerms = listOf("1st-choice", "2nd-choice", "3rd-choice")
            )
        )
        assertEquals(primary, ranked[0])
        assertEquals(secondary, ranked[1])
        assertEquals(tertiary, ranked[2])
    }

    // ============ SOURCE QUALITY BONUSES ============

    @Test
    fun `prioritizes direct debrid streams`() {
        fun stream(
            name: String,
            resolution: String,
            isDirectDebrid: Boolean = false,
        ) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
            isDirectDebridStream = isDirectDebrid,
            clientResolve = StreamClientResolve(
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(resolution = resolution)
                    )
                )
            )
        )
        
        val regularHighQuality = stream("1080p-regular", "1080p", isDirectDebrid = false)
        val directDebridLowQuality = stream("480p-debrid", "480p", isDirectDebrid = true)
        
        val ranked = SmartStreamSelector.rank(listOf(regularHighQuality, directDebridLowQuality))
        // Direct debrid should prioritize even with lower resolution
        assertEquals(directDebridLowQuality, ranked[0])
    }

    @Test
    fun `maintains deterministic ordering for equal scores`() {
        fun stream(name: String) = StreamItem(
            name = name,
            url = "https://cdn.example.com/$name.mkv",
            addonName = "Test",
            addonId = "addon.test",
        )
        
        val first = stream("first")
        val second = stream("second")
        val third = stream("third")
        
        // Multiple runs should return same order
        val runs = (0..5).map {
            SmartStreamSelector.rank(listOf(first, second, third))
        }
        
        runs.forEach { ranked ->
            assertEquals(listOf(first, second, third), ranked)
        }
    }
}
