package com.nuvio.app.features.tmdb

import com.nuvio.app.features.details.MetaCompany
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaPerson
import com.nuvio.app.features.details.MetaVideo
import kotlin.test.Test
import kotlin.test.assertEquals

class TmdbMetadataServiceTest {
    @Test
    fun `buildStandaloneMeta maps tmdb enrichment without addon meta`() {
        val enrichment = TmdbEnrichment(
            localizedTitle = "TMDB Movie",
            description = "TMDB description",
            genres = listOf("Adventure"),
            backdrop = "backdrop",
            logo = "logo",
            poster = "poster",
            people = listOf(MetaPerson(name = "Cast Member", role = "Hero")),
            director = listOf("Director"),
            writer = listOf("Writer"),
            releaseInfo = "2026-01-01",
            rating = 8.4,
            runtimeMinutes = 105,
            ageRating = "PG-13",
            status = "Released",
            countries = listOf("US", "GB"),
            language = "en",
            productionCompanies = listOf(MetaCompany(name = "Studio")),
            networks = emptyList(),
        )

        val result = TmdbMetadataService.buildStandaloneMeta(
            type = "movie",
            id = "tmdb:123",
            tmdbId = 123,
            enrichment = enrichment,
        )

        assertEquals("tmdb:123", result.id)
        assertEquals("movie", result.type)
        assertEquals("TMDB Movie", result.name)
        assertEquals("TMDB description", result.description)
        assertEquals("8.4", result.imdbRating)
        assertEquals("105m", result.runtime)
        assertEquals("US, GB", result.country)
        assertEquals(listOf("Cast Member"), result.cast.map { it.name })
        assertEquals(listOf("Studio"), result.productionCompanies.map { it.name })
    }

    @Test
    fun `applyEnrichment replaces enabled metadata groups`() {
        val base = MetaDetails(
            id = "tt1234567",
            type = "series",
            name = "Original",
            description = "Addon description",
            videos = listOf(
                MetaVideo(
                    id = "ep1",
                    title = "Episode 1",
                    released = "2023-12-31T19:00:00Z",
                    season = 1,
                    episode = 1,
                ),
            ),
        )
        val enrichment = TmdbEnrichment(
            localizedTitle = "Localized",
            description = "TMDB description",
            genres = listOf("Drama", "Mystery"),
            backdrop = "https://example.com/backdrop.jpg",
            logo = "https://example.com/logo.png",
            poster = "https://example.com/poster.jpg",
            people = listOf(MetaPerson(name = "Person", role = "Creator")),
            director = listOf("Director Name"),
            writer = emptyList(),
            releaseInfo = "2024-01-01",
            rating = 8.4,
            runtimeMinutes = 52,
            ageRating = "TV-MA",
            status = "Returning Series",
            countries = listOf("US"),
            language = "en",
            productionCompanies = listOf(MetaCompany(name = "A24")),
            networks = listOf(MetaCompany(name = "HBO")),
        )
        val episodes = mapOf(
            (1 to 1) to TmdbEpisodeEnrichment(
                title = "Pilot",
                overview = "Episode overview",
                thumbnail = "https://example.com/thumb.jpg",
                airDate = "2024-01-01",
                runtimeMinutes = 58,
            ),
        )

        val result = TmdbMetadataService.applyEnrichment(
            meta = base,
            enrichment = enrichment,
            episodeMap = episodes,
            settings = TmdbSettings(enabled = true),
        )

        assertEquals("Localized", result.name)
        assertEquals("TMDB description", result.description)
        assertEquals(listOf("Drama", "Mystery"), result.genres)
        assertEquals("8.4", result.imdbRating)
        assertEquals("TV-MA", result.ageRating)
        assertEquals("52m", result.runtime)
        assertEquals(listOf("Director Name"), result.director)
        assertEquals(listOf("A24"), result.productionCompanies.map { it.name })
        assertEquals(listOf("HBO"), result.networks.map { it.name })
        assertEquals("Pilot", result.videos.first().title)
        assertEquals(58, result.videos.first().runtime)
        assertEquals("2023-12-31T19:00:00Z", result.videos.first().released)
    }

    @Test
    fun `applyEnrichment replaces episode release only when enabled`() {
        val addonRelease = "2023-12-31T19:00:00Z"
        val base = MetaDetails(
            id = "tt1234567",
            type = "series",
            name = "Original",
            videos = listOf(
                MetaVideo(
                    id = "ep1",
                    title = "Episode 1",
                    released = addonRelease,
                    season = 1,
                    episode = 1,
                ),
            ),
        )
        val episodes = mapOf(
            (1 to 1) to TmdbEpisodeEnrichment(
                title = null,
                overview = null,
                thumbnail = null,
                airDate = "2024-01-01",
                runtimeMinutes = null,
            ),
        )

        val disabled = TmdbMetadataService.applyEnrichment(
            meta = base,
            enrichment = null,
            episodeMap = episodes,
            settings = TmdbSettings(enabled = true),
        )
        val enabled = TmdbMetadataService.applyEnrichment(
            meta = base,
            enrichment = null,
            episodeMap = episodes,
            settings = TmdbSettings(enabled = true, useReleaseDates = true),
        )

        assertEquals(addonRelease, disabled.videos.first().released)
        assertEquals("2024-01-01", enabled.videos.first().released)
    }

    @Test
    fun `applyEnrichment replaces top level release dates only when enabled`() {
        val base = MetaDetails(
            id = "tt1234567",
            type = "series",
            name = "Original",
            releaseInfo = "2023-12-31T19:00:00Z",
            lastAirDate = "2023-12-31T20:00:00Z",
        )
        val enrichment = TmdbEnrichment(
            localizedTitle = null,
            description = null,
            genres = emptyList(),
            backdrop = null,
            logo = null,
            poster = null,
            people = emptyList(),
            director = emptyList(),
            writer = emptyList(),
            releaseInfo = "2024-01-01",
            lastAirDate = "2024-12-31",
            rating = null,
            runtimeMinutes = null,
            ageRating = null,
            status = null,
            countries = emptyList(),
            language = null,
            productionCompanies = emptyList(),
            networks = emptyList(),
        )

        val disabled = TmdbMetadataService.applyEnrichment(
            meta = base,
            enrichment = enrichment,
            episodeMap = emptyMap(),
            settings = TmdbSettings(enabled = true),
        )
        val enabled = TmdbMetadataService.applyEnrichment(
            meta = base,
            enrichment = enrichment,
            episodeMap = emptyMap(),
            settings = TmdbSettings(enabled = true, useReleaseDates = true),
        )

        assertEquals(base.releaseInfo, disabled.releaseInfo)
        assertEquals(base.lastAirDate, disabled.lastAirDate)
        assertEquals("2024-01-01", enabled.releaseInfo)
        assertEquals("2024-12-31", enabled.lastAirDate)
    }

    @Test
    fun `applyEnrichment preserves disabled groups`() {
        val base = MetaDetails(
            id = "tt7654321",
            type = "movie",
            name = "Original",
            description = "Original description",
            videos = listOf(
                MetaVideo(
                    id = "movie",
                    title = "Original title",
                ),
            ),
        )
        val enrichment = TmdbEnrichment(
            localizedTitle = "Localized",
            description = "TMDB description",
            genres = listOf("Sci-Fi"),
            backdrop = "backdrop",
            logo = "logo",
            poster = "poster",
            people = listOf(MetaPerson(name = "Cast Member")),
            director = listOf("Director"),
            writer = listOf("Writer"),
            releaseInfo = "2025-05-05",
            rating = 7.2,
            runtimeMinutes = 124,
            ageRating = "PG-13",
            status = "Released",
            countries = listOf("US"),
            language = "en",
            productionCompanies = listOf(MetaCompany(name = "Studio")),
            networks = emptyList(),
        )

        val result = TmdbMetadataService.applyEnrichment(
            meta = base,
            enrichment = enrichment,
            episodeMap = emptyMap(),
            settings = TmdbSettings(
                enabled = true,
                useArtwork = false,
                useBasicInfo = false,
                useDetails = false,
                useCredits = false,
                useProductions = false,
                useNetworks = false,
                useEpisodes = false,
            ),
        )

        assertEquals(base.name, result.name)
        assertEquals(base.description, result.description)
        assertEquals(base.genres, result.genres)
        assertEquals(base.director, result.director)
        assertEquals(base.cast, result.cast)
        assertEquals(base.productionCompanies, result.productionCompanies)
    }
}
