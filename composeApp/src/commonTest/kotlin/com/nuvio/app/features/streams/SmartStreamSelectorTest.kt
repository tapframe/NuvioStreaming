package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertEquals

class SmartStreamSelectorTest {
    private fun stream(
        name: String,
        addonId: String = "addon.test",
        url: String? = "https://cdn.example.com/video.mkv",
        resolution: String? = null,
        cached: Boolean = false,
        notWebReady: Boolean = false,
        sizeBytes: Long? = null,
        durationSeconds: Long? = null,
        codec: String? = null,
        hdr: List<String> = emptyList(),
    ) = StreamItem(
        name = name,
        url = url,
        addonName = "Test",
        addonId = addonId,
        behaviorHints = StreamBehaviorHints(
            videoSize = sizeBytes,
            notWebReady = notWebReady,
        ),
        clientResolve = resolution?.let {
            StreamClientResolve(
                type = if (cached) "debrid" else null,
                service = if (cached) "realdebrid" else null,
                isCached = cached,
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        parsed = StreamClientResolveParsed(
                            resolution = it,
                            codec = codec,
                            hdr = hdr,
                            duration = durationSeconds,
                        )
                    )
                )
            )
        }
    )

    @Test
    fun `ranks higher quality when no constraints are supplied`() {
        val low = stream("720p", resolution = "720p")
        val high = stream("1080p", resolution = "1080p")
        assertEquals(listOf(high, low), SmartStreamSelector.rank(listOf(low, high)))
    }

    @Test
    fun `prefers cached debrid over otherwise equal direct stream`() {
        val direct = stream("1080p", resolution = "1080p")
        val cached = stream("1080p cached", addonId = "addon.debrid", resolution = "1080p", cached = true)
        assertEquals(cached, SmartStreamSelector.rank(listOf(direct, cached)).first())
    }

    @Test
    fun `penalizes non web ready streams`() {
        val normal = stream("1080p", resolution = "1080p")
        val notReady = stream("1080p", resolution = "1080p", notWebReady = true)
        assertEquals(normal, SmartStreamSelector.rank(listOf(notReady, normal)).first())
    }

    @Test
    fun `uses display height to avoid unnecessary 4k selection`() {
        val hd = stream("1080p", resolution = "1080p")
        val uhd = stream("2160p", resolution = "2160p")
        val ranked = SmartStreamSelector.rank(
            listOf(uhd, hd),
            SmartStreamSelector.Context(displayHeight = 1080)
        )
        assertEquals(hd, ranked.first())
    }

    @Test
    fun `uses bandwidth to avoid a stream that cannot safely fit the connection`() {
        val low = stream(
            "720p",
            resolution = "720p",
            sizeBytes = 40_000_000,
            durationSeconds = 600,
        )
        val high = stream(
            "1080p",
            resolution = "1080p",
            sizeBytes = 100_000_000,
            durationSeconds = 600,
        )
        val ranked = SmartStreamSelector.rank(
            listOf(high, low),
            SmartStreamSelector.Context(estimatedBandwidthKbps = 1_000)
        )
        assertEquals(low, ranked.first())
    }

    @Test
    fun `prefers requested codec when quality is otherwise equal`() {
        val h264 = stream("1080p h264", resolution = "1080p", codec = "h264")
        val hevc = stream("1080p hevc", resolution = "1080p", codec = "hevc")
        val ranked = SmartStreamSelector.rank(
            listOf(h264, hevc),
            SmartStreamSelector.Context(preferredVideoCodec = "hevc")
        )
        assertEquals(hevc, ranked.first())
    }

    @Test
    fun `prefers hdr only when the device supports hdr`() {
        val sdr = stream("1080p SDR", resolution = "1080p")
        val hdr = stream("1080p HDR", resolution = "1080p", hdr = listOf("HDR10"))
        assertEquals(
            hdr,
            SmartStreamSelector.rank(
                listOf(sdr, hdr),
                SmartStreamSelector.Context(supportsHdr = true)
            ).first()
        )
        assertEquals(
            sdr,
            SmartStreamSelector.rank(
                listOf(hdr, sdr),
                SmartStreamSelector.Context(supportsHdr = false)
            ).first()
        )
    }

    @Test
    fun `ranking remains deterministic for equal scores`() {
        val first = stream("1080p A", resolution = "1080p")
        val second = stream("1080p B", resolution = "1080p")
        assertEquals(listOf(first, second), SmartStreamSelector.rank(listOf(first, second)))
    }
}
