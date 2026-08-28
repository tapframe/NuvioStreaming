package com.nuvio.app.features.streams

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StreamLaunchStoreTest {
    @AfterTest
    fun tearDown() {
        StreamLaunchStore.clear()
    }

    @Test
    fun repeatedUpdatesKeepLatestEpisodeAndStreamsSnapshot() {
        val launchId = StreamLaunchStore.put(
            StreamLaunch(
                profileId = 1,
                type = "series",
                videoId = "episode-1",
                parentMetaId = "series-id",
                parentMetaType = "series",
                title = "Series",
                seasonNumber = 1,
                episodeNumber = 1,
                episodeTitle = "Episode 1",
                pauseDescription = "First episode",
                resumePositionMs = 120_000L,
                resumeProgressFraction = 0.5f,
                startFromBeginning = true,
            ),
        )

        for (episodeNumber in 2..20) {
            val streamsSnapshot = StreamsUiState(
                groups = listOf(
                    AddonStreamGroup(
                        addonName = "Addon $episodeNumber",
                        addonId = "addon-$episodeNumber",
                        streams = emptyList(),
                    ),
                ),
            )
            StreamLaunchStore.updateEpisode(
                launchId = launchId,
                videoId = "episode-$episodeNumber",
                seasonNumber = 1,
                episodeNumber = episodeNumber,
                episodeTitle = "Episode $episodeNumber",
                episodeThumbnail = "thumbnail-$episodeNumber",
                pauseDescription = "Description $episodeNumber",
                streamsSnapshot = streamsSnapshot,
            )
        }

        val updated = StreamLaunchStore.get(launchId)!!
        assertEquals("episode-20", updated.videoId)
        assertEquals(1, updated.seasonNumber)
        assertEquals(20, updated.episodeNumber)
        assertEquals("Episode 20", updated.episodeTitle)
        assertEquals("thumbnail-20", updated.episodeThumbnail)
        assertEquals("Description 20", updated.pauseDescription)
        assertEquals("addon-20", updated.streamsSnapshot?.groups?.single()?.addonId)
        assertNull(updated.resumePositionMs)
        assertNull(updated.resumeProgressFraction)
        assertTrue(updated.manualSelection)
        assertFalse(updated.startFromBeginning)
    }
}
