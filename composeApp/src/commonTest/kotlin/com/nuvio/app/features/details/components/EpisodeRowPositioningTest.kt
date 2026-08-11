package com.nuvio.app.features.details.components

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EpisodeRowPositioningTest {
    @Test
    fun `preferred episode is only applied to its own season`() {
        assertEquals(
            4,
            preferredEpisodeNumberForSeason(
                currentSeason = 2,
                preferredSeasonNumber = 2,
                preferredEpisodeNumber = 4,
            ),
        )
        assertNull(
            preferredEpisodeNumberForSeason(
                currentSeason = 1,
                preferredSeasonNumber = 2,
                preferredEpisodeNumber = 4,
            ),
        )
    }

    @Test
    fun `preferred episode without season remains supported`() {
        assertEquals(
            3,
            preferredEpisodeNumberForSeason(
                currentSeason = 1,
                preferredSeasonNumber = null,
                preferredEpisodeNumber = 3,
            ),
        )
    }

    @Test
    fun `initial row position waits for hydration and is consumed once`() {
        assertFalse(
            shouldInitializeEpisodeRowPosition(
                isReady = false,
                hasPositioned = false,
            ),
        )
        assertTrue(
            shouldInitializeEpisodeRowPosition(
                isReady = true,
                hasPositioned = false,
            ),
        )
        assertFalse(
            shouldInitializeEpisodeRowPosition(
                isReady = true,
                hasPositioned = true,
            ),
        )
    }

    @Test
    fun `initial season stays stable when watched state advances the preferred episode`() {
        val seasons = listOf(1, 2, 3)
        var snapshot = captureInitialSeasonSnapshot(
            isReady = false,
            capturedSeason = null,
            defaultSeason = 1,
            availableSeasons = seasons,
        )
        assertNull(snapshot)

        snapshot = captureInitialSeasonSnapshot(
            isReady = true,
            capturedSeason = snapshot,
            defaultSeason = 2,
            availableSeasons = seasons,
        )
        assertEquals(2, snapshot)

        snapshot = captureInitialSeasonSnapshot(
            isReady = true,
            capturedSeason = snapshot,
            defaultSeason = 1,
            availableSeasons = seasons,
        )
        assertEquals(2, snapshot)
        assertEquals(
            2,
            resolveCurrentSeason(
                selectedSeasonOverride = null,
                initialSeasonSnapshot = snapshot,
                defaultSeason = 1,
                availableSeasons = seasons,
            ),
        )
        assertEquals(
            3,
            resolveCurrentSeason(
                selectedSeasonOverride = 3,
                initialSeasonSnapshot = snapshot,
                defaultSeason = 1,
                availableSeasons = seasons,
            ),
        )
    }
}
