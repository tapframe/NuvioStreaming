package com.nuvio.app.features.debrid

import com.nuvio.app.features.player.PlayerSettingsUiState
import com.nuvio.app.features.streams.StreamAutoPlayMode
import com.nuvio.app.features.streams.StreamClientResolve
import com.nuvio.app.features.streams.StreamItem
import kotlin.test.Test
import kotlin.test.assertEquals

class DirectDebridStreamPreparerTest {

    @Test
    fun `prioritizes autoplay direct debrid match before display order`() {
        val first = directDebridStream(name = "1080p", infoHash = "hash-1")
        val autoPlayMatch = directDebridStream(name = "2160p WEB", infoHash = "hash-2")
        val remaining = directDebridStream(name = "720p", infoHash = "hash-3")

        val selected = DirectDebridStreamPreparer.prioritizeCandidates(
            streams = listOf(first, autoPlayMatch, remaining),
            limit = 2,
            playerSettings = PlayerSettingsUiState(
                streamAutoPlayMode = StreamAutoPlayMode.REGEX_MATCH,
                streamAutoPlayRegex = "2160p",
            ),
            installedAddonNames = emptySet(),
        )

        assertEquals(listOf(autoPlayMatch, first), selected)
    }

    @Test
    fun `skips already resolved and duplicate direct debrid candidates`() {
        val unresolved = directDebridStream(name = "1080p", infoHash = "hash-1")
        val duplicate = directDebridStream(name = "1080p Duplicate", infoHash = "HASH-1")
        val alreadyResolved = directDebridStream(
            name = "2160p",
            infoHash = "hash-2",
            url = "https://example.com/ready.mp4",
        )

        val selected = DirectDebridStreamPreparer.prioritizeCandidates(
            streams = listOf(unresolved, duplicate, alreadyResolved),
            limit = 5,
            playerSettings = PlayerSettingsUiState(),
            installedAddonNames = emptySet(),
        )

        assertEquals(listOf(unresolved), selected)
    }

    private fun directDebridStream(
        name: String,
        infoHash: String,
        url: String? = null,
    ): StreamItem =
        StreamItem(
            name = name,
            url = url,
            addonName = "Torbox Instant",
            addonId = "debrid:torbox",
            clientResolve = StreamClientResolve(
                type = "debrid",
                service = DebridProviders.TORBOX_ID,
                isCached = true,
                infoHash = infoHash,
                fileIdx = 1,
                filename = "video.mkv",
            ),
        )
}
