package com.nuvio.app.features.library

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.home.PosterShape
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.trakt.TraktListTab
import com.nuvio.app.features.trakt.TraktListType
import kotlin.test.Test
import kotlin.test.assertEquals

class LibraryRepositoryTest {

    @Test
    fun `display title uses exact type formatting`() {
        assertEquals("Movie", "movie".toLibraryDisplayTitle())
        assertEquals("Anime Series", "anime-series".toLibraryDisplayTitle())
        assertEquals("Tv", "tv".toLibraryDisplayTitle())
        assertEquals("Other", "".toLibraryDisplayTitle())
    }

    @Test
    fun `meta preview mapping preserves exact type and poster shape`() {
        val item = LibraryItem(
            id = "tt1",
            type = "anime-series",
            name = "Title",
            poster = "poster",
            banner = "banner",
            logo = "logo",
            description = "desc",
            releaseInfo = "2024",
            imdbRating = "8.4",
            genres = listOf("Drama"),
            posterShape = PosterShape.Poster,
            savedAtEpochMs = 1L,
        )

        val preview = item.toMetaPreview()

        assertEquals("anime-series", preview.type)
        assertEquals(PosterShape.Poster, preview.posterShape)
        assertEquals("banner", preview.banner)
    }

    @Test
    fun `metadata mappings keep imdb ids for Trakt-compatible sync`() {
        val previewItem = MetaPreview(
            id = "tt1234567",
            type = "movie",
            name = "Movie",
        ).toLibraryItem(savedAtEpochMs = 1L)
        val detailsItem = MetaDetails(
            id = "tt7654321",
            type = "series",
            name = "Show",
        ).toLibraryItem(savedAtEpochMs = 2L)
        val tmdbOnlyItem = MetaPreview(
            id = "tmdb:42",
            type = "movie",
            name = "TMDB",
        ).toLibraryItem(savedAtEpochMs = 3L)

        assertEquals("tt1234567", previewItem.imdbId)
        assertEquals("tt7654321", detailsItem.imdbId)
        assertEquals(null, tmdbOnlyItem.imdbId)
    }

    @Test
    fun `library tabs include local Nuvio library before Trakt tabs`() {
        val traktTab = TraktListTab(
            key = "trakt:watchlist",
            title = "Watchlist",
            type = TraktListType.WATCHLIST,
        )

        val tabs = libraryTabsWithLocal(listOf(traktTab))

        assertEquals(listOf("local", "trakt:watchlist"), tabs.map { it.key })
        assertEquals("Nuvio Library", tabs.first().title)
    }

    @Test
    fun `library membership always includes local state before Trakt membership`() {
        val membership = libraryMembershipWithLocal(
            inLocal = true,
            traktMembership = mapOf("trakt:watchlist" to false),
        )

        assertEquals(
            mapOf(
                "local" to true,
                "trakt:watchlist" to false,
            ),
            membership,
        )
    }
}
