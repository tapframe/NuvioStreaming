package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamClientResolve
import com.nuvio.app.features.streams.StreamClientResolveParsed
import com.nuvio.app.features.streams.StreamClientResolveRaw
import com.nuvio.app.features.streams.StreamClientResolveStream
import com.nuvio.app.features.streams.StreamItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DirectDebridStreamFilterTest {
    @Test
    fun `keeps only cached supported debrid streams`() {
        val torbox = stream(service = DebridProviders.TORBOX_ID, cached = true)
        val uncached = stream(service = DebridProviders.TORBOX_ID, cached = false)
        val unsupported = stream(service = "other", cached = true)
        val torrent = stream(service = DebridProviders.REAL_DEBRID_ID, cached = true, type = "torrent")

        val filtered = DirectDebridStreamFilter.filterInstant(listOf(torbox, uncached, unsupported, torrent))

        assertEquals(1, filtered.size)
        assertEquals("Torbox Instant", filtered.single().addonName)
        assertEquals("debrid:torbox", filtered.single().addonId)
    }

    @Test
    fun `dedupes by hash file and filename identity`() {
        val first = stream(service = DebridProviders.REAL_DEBRID_ID, cached = true, infoHash = "ABC", fileIdx = 2)
        val duplicate = stream(service = DebridProviders.REAL_DEBRID_ID, cached = true, infoHash = "abc", fileIdx = 2)
        val otherFile = stream(service = DebridProviders.REAL_DEBRID_ID, cached = true, infoHash = "abc", fileIdx = 3)

        val filtered = DirectDebridStreamFilter.filterInstant(listOf(first, duplicate, otherFile))

        assertEquals(2, filtered.size)
    }

    @Test
    fun `direct debrid stream is not treated as unsupported torrent`() {
        val direct = stream(service = DebridProviders.TORBOX_ID, cached = true, infoHash = "hash")
        val plainTorrent = StreamItem(
            name = "Torrent",
            infoHash = "hash",
            addonName = "Addon",
            addonId = "addon",
        )

        assertTrue(direct.isDirectDebridStream)
        assertFalse(direct.isTorrentStream)
        assertTrue(plainTorrent.isTorrentStream)
    }

    @Test
    fun `sorts and limits streams by quality and size`() {
        val streams = listOf(
            stream(resolution = "1080p", size = 20),
            stream(resolution = "2160p", size = 10),
            stream(resolution = "2160p", size = 30),
            stream(resolution = "720p", size = 40),
        )

        val filtered = DirectDebridStreamFilter.filterInstant(
            streams,
            DebridSettings(
                streamMaxResults = 2,
                streamSortMode = DebridStreamSortMode.QUALITY_DESC,
            ),
        )

        assertEquals(listOf(30L, 10L), filtered.map { it.clientResolve?.stream?.raw?.size })
    }

    @Test
    fun `filters minimum quality dolby vision hdr and codec`() {
        val hdrHevc = stream(resolution = "2160p", hdr = listOf("HDR10"), codec = "HEVC", size = 10)
        val dvHevc = stream(resolution = "2160p", hdr = listOf("DV", "HDR10"), codec = "HEVC", size = 20)
        val sdrAvc = stream(resolution = "1080p", codec = "AVC", size = 30)
        val hdHevc = stream(resolution = "720p", codec = "HEVC", size = 40)

        val noDvHdrHevc4k = DirectDebridStreamFilter.filterInstant(
            listOf(hdrHevc, dvHevc, sdrAvc, hdHevc),
            DebridSettings(
                streamMinimumQuality = DebridStreamMinimumQuality.P2160,
                streamDolbyVisionFilter = DebridStreamFeatureFilter.EXCLUDE,
                streamHdrFilter = DebridStreamFeatureFilter.ONLY,
                streamCodecFilter = DebridStreamCodecFilter.HEVC,
            ),
        )

        assertEquals(listOf(10L), noDvHdrHevc4k.map { it.clientResolve?.stream?.raw?.size })

        val dvOnly = DirectDebridStreamFilter.filterInstant(
            listOf(hdrHevc, dvHevc, sdrAvc, hdHevc),
            DebridSettings(streamDolbyVisionFilter = DebridStreamFeatureFilter.ONLY),
        )

        assertEquals(listOf(20L), dvOnly.map { it.clientResolve?.stream?.raw?.size })
    }

    @Test
    fun `applies stream preference filters and sort criteria`() {
        val remuxAtmos = stream(
            resolution = "2160p",
            quality = "BluRay REMUX",
            codec = "HEVC",
            audio = listOf("Atmos", "TrueHD"),
            channels = listOf("7.1"),
            languages = listOf("en"),
            group = "GOOD",
            size = 40_000_000_000,
        )
        val webAac = stream(
            resolution = "2160p",
            quality = "WEB-DL",
            codec = "AVC",
            audio = listOf("AAC"),
            channels = listOf("2.0"),
            languages = listOf("en"),
            group = "NOPE",
            size = 4_000_000_000,
        )
        val blurayDts = stream(
            resolution = "1080p",
            quality = "BluRay",
            codec = "AVC",
            audio = listOf("DTS"),
            channels = listOf("5.1"),
            languages = listOf("hi"),
            group = "GOOD",
            size = 12_000_000_000,
        )

        val filtered = DirectDebridStreamFilter.filterInstant(
            listOf(webAac, blurayDts, remuxAtmos),
            DebridSettings(
                streamPreferences = DebridStreamPreferences(
                    maxResults = 2,
                    maxPerResolution = 1,
                    sizeMinGb = 5,
                    requiredResolutions = listOf(DebridStreamResolution.P2160, DebridStreamResolution.P1080),
                    excludedQualities = listOf(DebridStreamQuality.WEB_DL),
                    requiredAudioChannels = listOf(DebridStreamAudioChannel.CH_7_1, DebridStreamAudioChannel.CH_5_1),
                    excludedEncodes = listOf(DebridStreamEncode.UNKNOWN),
                    excludedLanguages = listOf(DebridStreamLanguage.IT),
                    requiredReleaseGroups = listOf("GOOD"),
                    sortCriteria = listOf(
                        DebridStreamSortCriterion(DebridStreamSortKey.AUDIO_TAG, DebridStreamSortDirection.DESC),
                        DebridStreamSortCriterion(DebridStreamSortKey.SIZE, DebridStreamSortDirection.ASC),
                    ),
                ),
            ),
        )

        assertEquals(listOf(40_000_000_000L, 12_000_000_000L), filtered.map { it.clientResolve?.stream?.raw?.size })
    }

    private fun stream(
        service: String? = DebridProviders.TORBOX_ID,
        cached: Boolean? = true,
        type: String = "debrid",
        infoHash: String = "hash",
        fileIdx: Int = 1,
        resolution: String? = null,
        quality: String? = null,
        hdr: List<String> = emptyList(),
        codec: String? = null,
        audio: List<String> = emptyList(),
        channels: List<String> = emptyList(),
        languages: List<String> = emptyList(),
        group: String? = null,
        size: Long? = null,
    ): StreamItem =
        StreamItem(
            name = "Stream ${resolution.orEmpty()} ${quality.orEmpty()} ${codec.orEmpty()}",
            description = "Stream ${resolution.orEmpty()} ${quality.orEmpty()} ${codec.orEmpty()}",
            addonName = "Direct Debrid",
            addonId = "debrid",
            clientResolve = StreamClientResolve(
                type = type,
                service = service,
                isCached = cached,
                infoHash = infoHash + size.orEmptyHashPart() + resolution.orEmpty() + quality.orEmpty() + codec.orEmpty(),
                fileIdx = fileIdx,
                filename = "video ${resolution.orEmpty()} ${quality.orEmpty()} ${codec.orEmpty()}.mkv",
                torrentName = "Torrent ${resolution.orEmpty()} ${quality.orEmpty()}",
                stream = StreamClientResolveStream(
                    raw = StreamClientResolveRaw(
                        torrentName = "Torrent ${resolution.orEmpty()} ${quality.orEmpty()}",
                        filename = "video ${resolution.orEmpty()} ${quality.orEmpty()} ${codec.orEmpty()}.mkv",
                        size = size,
                        folderSize = size,
                        parsed = StreamClientResolveParsed(
                            resolution = resolution,
                            quality = quality,
                            hdr = hdr,
                            codec = codec,
                            audio = audio,
                            channels = channels,
                            languages = languages,
                            group = group,
                        ),
                    ),
                ),
            ),
        )
}

private fun Long?.orEmptyHashPart(): String =
    this?.toString().orEmpty()
