package com.nuvio.app.features.watchprogress

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.tracking.WatchProgressSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class WatchProgressMetadataProjectionTest {
    @Test
    fun `provider metadata enriches display fields without replacing progress ownership`() {
        val raw = entry(source = WatchProgressSourceSimklPlayback)
        val overlay = ProviderProgressMetadataOverlay()
        overlay.put(
            source = WatchProgressSource.SIMKL,
            key = raw.metadataKey(),
            metadata = metadata(),
        )

        val enriched = overlay.project(
            source = WatchProgressSource.SIMKL,
            entries = listOf(raw),
        ).single()

        assertEquals("Addon title", enriched.title)
        assertEquals("addon-poster", enriched.poster)
        assertEquals("addon-background", enriched.background)
        assertEquals("addon-logo", enriched.logo)
        assertEquals("Episode title", enriched.episodeTitle)
        assertEquals("episode-thumbnail", enriched.episodeThumbnail)
        assertEquals("Episode overview", enriched.pauseDescription)
        assertEquals(raw.progressKey, enriched.progressKey)
        assertEquals(raw.progressPercent, enriched.progressPercent)
        assertEquals(raw.lastPositionMs, enriched.lastPositionMs)
        assertEquals(raw.source, enriched.source)
    }

    @Test
    fun `provider metadata never crosses source boundaries`() {
        val raw = entry(source = WatchProgressSourceSimklPlayback)
        val overlay = ProviderProgressMetadataOverlay()
        overlay.put(
            source = WatchProgressSource.SIMKL,
            key = raw.metadataKey(),
            metadata = metadata(),
        )

        val projected = overlay.project(
            source = WatchProgressSource.TRAKT,
            entries = listOf(raw),
        ).single()

        assertEquals(raw, projected)
        assertNull(projected.background)
        assertNull(projected.episodeThumbnail)
    }

    private fun entry(source: String): WatchProgressEntry = WatchProgressEntry(
        contentType = "series",
        parentMetaId = "tt1234567",
        parentMetaType = "series",
        videoId = "tt1234567:1:2",
        title = "Simkl title",
        poster = "simkl-poster",
        seasonNumber = 1,
        episodeNumber = 2,
        lastPositionMs = 40_000L,
        durationMs = 100_000L,
        lastUpdatedEpochMs = 500L,
        progressPercent = 40f,
        source = source,
        progressKey = "simkl-playback:10",
    )

    private fun metadata(): MetaDetails = MetaDetails(
        id = "tt1234567",
        type = "series",
        name = "Addon title",
        poster = "addon-poster",
        background = "addon-background",
        logo = "addon-logo",
        description = "Show overview",
        videos = listOf(
            MetaVideo(
                id = "tt1234567:1:2",
                title = "Episode title",
                thumbnail = "episode-thumbnail",
                season = 1,
                episode = 2,
                overview = "Episode overview",
            ),
        ),
    )
}
