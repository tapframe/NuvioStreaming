package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamClientResolve
import kotlin.test.Test
import kotlin.test.assertEquals

class DebridFileSelectorTest {
    @Test
    fun `Torbox selector prefers exact file id`() {
        val files = listOf(
            TorboxTorrentFileDto(id = 1, name = "small.mkv", size = 1),
            TorboxTorrentFileDto(id = 8, name = "target.mkv", size = 2),
        )

        val selected = TorboxFileSelector().selectFile(
            files = files,
            resolve = resolve(fileIdx = 8),
            season = null,
            episode = null,
        )

        assertEquals(8, selected?.id)
    }

    @Test
    fun `Torbox selector prefers filename match before provider file id`() {
        val files = listOf(
            TorboxTorrentFileDto(id = 0, name = "Request High Bitrate Stuff in Here.txt", size = 1),
            TorboxTorrentFileDto(
                id = 85,
                name = "The Office US S01-S09/The.Office.US.S01E01.Pilot.1080p.BluRay.Remux.mkv",
                size = 5_303_936_915,
            ),
            TorboxTorrentFileDto(
                id = 1,
                name = "The Office US S01-S09/The.Office.US.S08E13.Jury.Duty.1080p.BluRay.Remux.mkv",
                size = 5_859_312_140,
            ),
        )

        val selected = TorboxFileSelector().selectFile(
            files = files,
            resolve = resolve(
                fileIdx = 1,
                season = 1,
                episode = 1,
                filename = "The.Office.US.S01E01.Pilot.1080p.BluRay.Remux.mkv",
            ),
            season = 1,
            episode = 1,
        )

        assertEquals(85, selected?.id)
    }

    @Test
    fun `Torbox selector treats fileIdx as source list index before provider file id`() {
        val files = listOf(
            TorboxTorrentFileDto(id = 0, name = "Request High Bitrate Stuff in Here.txt", size = 1),
            TorboxTorrentFileDto(id = 85, name = "Show.S01E01.mkv", size = 500),
            TorboxTorrentFileDto(id = 1, name = "Show.S08E13.mkv", size = 900),
        )

        val selected = TorboxFileSelector().selectFile(
            files = files,
            resolve = resolve(fileIdx = 1),
            season = null,
            episode = null,
        )

        assertEquals(85, selected?.id)
    }

    @Test
    fun `Torbox selector uses episode pattern before broad title`() {
        val files = listOf(
            TorboxTorrentFileDto(id = 1, name = "The.Office.US.S08E13.Jury.Duty.mkv", size = 900),
            TorboxTorrentFileDto(id = 85, name = "The.Office.US.S01E01.Pilot.mkv", size = 500),
        )

        val selected = TorboxFileSelector().selectFile(
            files = files,
            resolve = resolve(
                season = 1,
                episode = 1,
                title = "The Office",
            ),
            season = 1,
            episode = 1,
        )

        assertEquals(85, selected?.id)
    }

    @Test
    fun `Torbox selector falls back to largest playable video`() {
        val files = listOf(
            TorboxTorrentFileDto(id = 1, name = "sample.txt", size = 999),
            TorboxTorrentFileDto(id = 2, name = "episode.mkv", size = 200),
            TorboxTorrentFileDto(id = 3, name = "episode-1080p.mp4", size = 500),
        )

        val selected = TorboxFileSelector().selectFile(
            files = files,
            resolve = resolve(),
            season = null,
            episode = null,
        )

        assertEquals(3, selected?.id)
    }

    @Test
    fun `Real-Debrid selector matches episode pattern before largest file`() {
        val files = listOf(
            RealDebridTorrentFileDto(id = 1, path = "/Show.S01E01.mkv", bytes = 1_000),
            RealDebridTorrentFileDto(id = 2, path = "/Show.S01E02.mkv", bytes = 2_000),
        )

        val selected = RealDebridFileSelector().selectFile(
            files = files,
            resolve = resolve(season = 1, episode = 1),
            season = null,
            episode = null,
        )

        assertEquals(1, selected?.id)
    }

    private fun resolve(
        fileIdx: Int? = null,
        season: Int? = null,
        episode: Int? = null,
        filename: String? = null,
        title: String? = null,
    ): StreamClientResolve =
        StreamClientResolve(
            type = "debrid",
            service = DebridProviders.TORBOX_ID,
            isCached = true,
            infoHash = "hash",
            fileIdx = fileIdx,
            filename = filename,
            title = title,
            season = season,
            episode = episode,
        )
}
