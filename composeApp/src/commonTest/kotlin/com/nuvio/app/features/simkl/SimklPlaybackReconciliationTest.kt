package com.nuvio.app.features.simkl

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class SimklPlaybackReconciliationTest {
    @Test
    fun `newer watched episode discards stale playback`() {
        val snapshot = episodeSnapshot(
            watchedAt = "2024-04-30T22:14:00Z",
            pausedAt = "2024-04-30T22:13:00Z",
        )

        assertTrue(snapshot.reconcileWatchedPlayback().playback.isEmpty())
    }

    @Test
    fun `equal watched timestamp discards playback`() {
        val snapshot = episodeSnapshot(
            watchedAt = "2024-04-30T22:13:00Z",
            pausedAt = "2024-04-30T22:13:00Z",
        )

        assertTrue(snapshot.reconcileWatchedPlayback().playback.isEmpty())
    }

    @Test
    fun `newer playback remains as a rewatch`() {
        val snapshot = episodeSnapshot(
            watchedAt = "2024-04-30T22:13:00Z",
            pausedAt = "2024-04-30T22:14:00Z",
        )

        assertEquals(snapshot.playback, snapshot.reconcileWatchedPlayback().playback)
    }

    @Test
    fun `watched episode does not discard another episode`() {
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                watchedEpisodeEntry(
                    media = media(39687, imdb = "tt4574334"),
                    season = 1,
                    episode = 5,
                    watchedAt = "2024-04-30T22:14:00Z",
                ),
            ),
            playback = listOf(
                episodePlayback(
                    playbackMedia = media(39687, imdb = "tt4574334"),
                    season = 1,
                    episode = 4,
                    pausedAt = "2024-04-30T22:13:00Z",
                ),
            ),
        )

        assertEquals(snapshot.playback, snapshot.reconcileWatchedPlayback().playback)
    }

    @Test
    fun `provider identity reconciles different canonical ids`() {
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                watchedEpisodeEntry(
                    media = media(39687, imdb = "tt4574334"),
                    season = 1,
                    episode = 5,
                    watchedAt = "2024-04-30T22:14:00Z",
                ),
            ),
            playback = listOf(
                episodePlayback(
                    playbackMedia = media(39687, tvdb = "305288"),
                    season = 1,
                    episode = 5,
                    pausedAt = "2024-04-30T22:13:00Z",
                ),
            ),
        )

        assertEquals("tvdb:305288", snapshot.playback.single().toWatchProgressEntry()?.parentMetaId)
        assertTrue(snapshot.reconcileWatchedPlayback().playback.isEmpty())
    }

    @Test
    fun `mapped anime coordinates reconcile the same episode`() {
        val animeMedia = media(439744, imdb = "tt2560140")
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                SimklLibraryEntry(
                    mediaType = SimklMediaType.ANIME,
                    status = SimklListStatus.WATCHING,
                    show = animeMedia,
                    seasons = listOf(
                        SimklSeason(
                            number = 1,
                            episodes = listOf(
                                SimklEpisode(
                                    number = 4,
                                    watchedAt = "2024-04-30T22:14:00Z",
                                    tvdb = SimklEpisodeMapping(season = 2, episode = 4),
                                ),
                            ),
                        ),
                    ),
                ),
            ),
            playback = listOf(
                SimklPlaybackSession(
                    id = 12345,
                    progress = 62.5,
                    pausedAt = "2024-04-30T22:13:00Z",
                    type = "episode",
                    episode = SimklPlaybackEpisode(
                        season = 1,
                        number = 4,
                        tvdbSeason = 2,
                        tvdbNumber = 4,
                    ),
                    anime = animeMedia,
                ),
            ),
        )

        assertTrue(snapshot.reconcileWatchedPlayback().playback.isEmpty())
    }

    @Test
    fun `newer watched movie discards stale playback`() {
        val movieMedia = media(53536, imdb = "tt0181852")
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                SimklLibraryEntry(
                    mediaType = SimklMediaType.MOVIES,
                    status = SimklListStatus.COMPLETED,
                    lastWatchedAt = "2024-04-30T22:14:00Z",
                    movie = movieMedia,
                ),
            ),
            playback = listOf(
                SimklPlaybackSession(
                    id = 12345,
                    progress = 62.5,
                    pausedAt = "2024-04-30T22:13:00Z",
                    type = "movie",
                    movie = movieMedia,
                ),
            ),
        )

        assertTrue(snapshot.reconcileWatchedPlayback().playback.isEmpty())
    }

    @Test
    fun `newer movie playback remains as a rewatch`() {
        val movieMedia = media(53536, imdb = "tt0181852")
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                SimklLibraryEntry(
                    mediaType = SimklMediaType.MOVIES,
                    status = SimklListStatus.COMPLETED,
                    lastWatchedAt = "2024-04-30T22:13:00Z",
                    movie = movieMedia,
                ),
            ),
            playback = listOf(
                SimklPlaybackSession(
                    id = 12345,
                    progress = 62.5,
                    pausedAt = "2024-04-30T22:14:00Z",
                    type = "movie",
                    movie = movieMedia,
                ),
            ),
        )

        assertEquals(snapshot.playback, snapshot.reconcileWatchedPlayback().playback)
    }

    @Test
    fun `newer completed series summary discards stale episode playback`() {
        val showMedia = media(39687, imdb = "tt4574334")
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                SimklLibraryEntry(
                    mediaType = SimklMediaType.SHOWS,
                    status = SimklListStatus.COMPLETED,
                    lastWatchedAt = "2024-04-30T22:14:00Z",
                    show = showMedia,
                ),
            ),
            playback = listOf(
                episodePlayback(
                    playbackMedia = showMedia,
                    season = 1,
                    episode = 5,
                    pausedAt = "2024-04-30T22:13:00Z",
                ),
            ),
        )

        assertTrue(snapshot.reconcileWatchedPlayback().playback.isEmpty())
    }

    @Test
    fun `newer episode playback remains after completed series summary`() {
        val showMedia = media(39687, imdb = "tt4574334")
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                SimklLibraryEntry(
                    mediaType = SimklMediaType.SHOWS,
                    status = SimklListStatus.COMPLETED,
                    lastWatchedAt = "2024-04-30T22:13:00Z",
                    show = showMedia,
                ),
            ),
            playback = listOf(
                episodePlayback(
                    playbackMedia = showMedia,
                    season = 1,
                    episode = 5,
                    pausedAt = "2024-04-30T22:14:00Z",
                ),
            ),
        )

        assertEquals(snapshot.playback, snapshot.reconcileWatchedPlayback().playback)
    }

    @Test
    fun `dropped series discards playback using provider identity`() {
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                SimklLibraryEntry(
                    mediaType = SimklMediaType.SHOWS,
                    status = SimklListStatus.DROPPED,
                    show = media(39687, imdb = "tt4574334"),
                ),
            ),
            playback = listOf(
                episodePlayback(
                    playbackMedia = media(39687, tvdb = "305288"),
                    season = 1,
                    episode = 5,
                    pausedAt = "2024-04-30T22:14:00Z",
                ),
            ),
        )

        assertTrue(snapshot.reconcileWatchedPlayback().playback.isEmpty())
        assertTrue(snapshot.isHiddenFromContinueWatching("tt4574334"))
        assertEquals(
            setOf("tt4574334"),
            snapshot.hiddenFromContinueWatchingContentIds(),
        )
    }

    @Test
    fun `on hold series discards playback using provider identity`() {
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                SimklLibraryEntry(
                    mediaType = SimklMediaType.SHOWS,
                    status = SimklListStatus.ON_HOLD,
                    show = media(39687, imdb = "tt4574334"),
                ),
            ),
            playback = listOf(
                episodePlayback(
                    playbackMedia = media(39687, tvdb = "305288"),
                    season = 1,
                    episode = 5,
                    pausedAt = "2024-04-30T22:14:00Z",
                ),
            ),
        )

        assertTrue(snapshot.reconcileWatchedPlayback().playback.isEmpty())
        assertTrue(snapshot.isHiddenFromContinueWatching("tt4574334"))
        assertEquals(
            setOf("tt4574334"),
            snapshot.hiddenFromContinueWatchingContentIds(),
        )
    }

    @Test
    fun `different dropped series does not discard playback`() {
        val snapshot = SimklSyncSnapshot(
            entries = listOf(
                SimklLibraryEntry(
                    mediaType = SimklMediaType.SHOWS,
                    status = SimklListStatus.DROPPED,
                    show = media(11111, imdb = "tt1111111"),
                ),
            ),
            playback = listOf(
                episodePlayback(
                    playbackMedia = media(39687, imdb = "tt4574334"),
                    season = 1,
                    episode = 5,
                    pausedAt = "2024-04-30T22:14:00Z",
                ),
            ),
        )

        assertEquals(snapshot.playback, snapshot.reconcileWatchedPlayback().playback)
        assertFalse(snapshot.isHiddenFromContinueWatching("tt4574334"))
        assertEquals(
            setOf("tt1111111"),
            snapshot.hiddenFromContinueWatchingContentIds(),
        )
    }

    @Test
    fun `snapshot without a conflict is returned unchanged`() {
        val snapshot = SimklSyncSnapshot(playback = listOf(episodePlayback()))

        assertSame(snapshot, snapshot.reconcileWatchedPlayback())
    }

    private fun episodeSnapshot(watchedAt: String, pausedAt: String): SimklSyncSnapshot {
        val showMedia = media(39687, imdb = "tt4574334")
        return SimklSyncSnapshot(
            entries = listOf(
                watchedEpisodeEntry(
                    media = showMedia,
                    season = 1,
                    episode = 5,
                    watchedAt = watchedAt,
                ),
            ),
            playback = listOf(
                episodePlayback(
                    playbackMedia = showMedia,
                    season = 1,
                    episode = 5,
                    pausedAt = pausedAt,
                ),
            ),
        )
    }

    private fun watchedEpisodeEntry(
        media: SimklMedia,
        season: Int,
        episode: Int,
        watchedAt: String,
    ): SimklLibraryEntry = SimklLibraryEntry(
        mediaType = SimklMediaType.SHOWS,
        status = SimklListStatus.WATCHING,
        show = media,
        seasons = listOf(
            SimklSeason(
                number = season,
                episodes = listOf(SimklEpisode(number = episode, watchedAt = watchedAt)),
            ),
        ),
    )

    private fun episodePlayback(
        playbackMedia: SimklMedia = media(39687, imdb = "tt4574334"),
        season: Int = 1,
        episode: Int = 5,
        pausedAt: String = "2024-04-30T22:13:00Z",
    ): SimklPlaybackSession = SimklPlaybackSession(
        id = 12345,
        progress = 62.5,
        pausedAt = pausedAt,
        type = "episode",
        episode = SimklPlaybackEpisode(season = season, number = episode),
        show = playbackMedia,
    )

    private fun media(
        id: Long,
        imdb: String? = null,
        tvdb: String? = null,
    ): SimklMedia = SimklMedia(
        title = "Title $id",
        runtime = 50,
        ids = buildJsonObject {
            put("simkl", id)
            imdb?.let { put("imdb", it) }
            tvdb?.let { put("tvdb", it) }
        },
    )
}
