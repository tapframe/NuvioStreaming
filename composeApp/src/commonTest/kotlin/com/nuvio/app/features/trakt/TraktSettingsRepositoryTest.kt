package com.nuvio.app.features.trakt

import com.nuvio.app.features.library.LibrarySourceMode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TraktSettingsRepositoryTest {

    @Test
    fun `watch progress source defaults to Trakt for unset or invalid storage`() {
        assertEquals(WatchProgressSource.TRAKT, WatchProgressSource.fromStorage(null))
        assertEquals(WatchProgressSource.TRAKT, WatchProgressSource.fromStorage(""))
        assertEquals(WatchProgressSource.TRAKT, WatchProgressSource.fromStorage("not-a-source"))
    }

    @Test
    fun `watch progress source restores valid storage values`() {
        assertEquals(WatchProgressSource.TRAKT, WatchProgressSource.fromStorage("TRAKT"))
        assertEquals(WatchProgressSource.NUVIO_SYNC, WatchProgressSource.fromStorage("NUVIO_SYNC"))
    }

    @Test
    fun `library source defaults to Trakt for unset or invalid storage`() {
        assertEquals(LibrarySourceMode.TRAKT, librarySourceModeFromStorage(null))
        assertEquals(LibrarySourceMode.TRAKT, librarySourceModeFromStorage(""))
        assertEquals(LibrarySourceMode.TRAKT, librarySourceModeFromStorage("not-a-source"))
    }

    @Test
    fun `library source restores valid storage values`() {
        assertEquals(LibrarySourceMode.TRAKT, librarySourceModeFromStorage("TRAKT"))
        assertEquals(LibrarySourceMode.LOCAL, librarySourceModeFromStorage("LOCAL"))
    }

    @Test
    fun `more like this source defaults to Trakt for unset or invalid storage`() {
        assertEquals(MoreLikeThisSourcePreference.TRAKT, MoreLikeThisSourcePreference.fromStorage(null))
        assertEquals(MoreLikeThisSourcePreference.TRAKT, MoreLikeThisSourcePreference.fromStorage(""))
        assertEquals(MoreLikeThisSourcePreference.TRAKT, MoreLikeThisSourcePreference.fromStorage("not-a-source"))
    }

    @Test
    fun `more like this source restores valid storage values`() {
        assertEquals(MoreLikeThisSourcePreference.TRAKT, MoreLikeThisSourcePreference.fromStorage("TRAKT"))
        assertEquals(MoreLikeThisSourcePreference.TMDB, MoreLikeThisSourcePreference.fromStorage("TMDB"))
    }

    @Test
    fun `continue watching cap normalizes finite windows and all history`() {
        assertEquals(TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL, normalizeTraktContinueWatchingDaysCap(0))
        assertEquals(7, normalizeTraktContinueWatchingDaysCap(1))
        assertEquals(60, normalizeTraktContinueWatchingDaysCap(60))
        assertEquals(365, normalizeTraktContinueWatchingDaysCap(999))
    }

    @Test
    fun `Trakt progress is active only when authenticated and selected`() {
        assertFalse(shouldUseTraktProgress(isAuthenticated = false, source = WatchProgressSource.TRAKT))
        assertFalse(shouldUseTraktProgress(isAuthenticated = true, source = WatchProgressSource.NUVIO_SYNC))
        assertTrue(shouldUseTraktProgress(isAuthenticated = true, source = WatchProgressSource.TRAKT))
    }

    @Test
    fun `effective library source uses Trakt only when authenticated and selected`() {
        assertEquals(
            LibrarySourceMode.LOCAL,
            effectiveLibrarySourceMode(isAuthenticated = false, source = LibrarySourceMode.TRAKT),
        )
        assertEquals(
            LibrarySourceMode.LOCAL,
            effectiveLibrarySourceMode(isAuthenticated = true, source = LibrarySourceMode.LOCAL),
        )
        assertEquals(
            LibrarySourceMode.TRAKT,
            effectiveLibrarySourceMode(isAuthenticated = true, source = LibrarySourceMode.TRAKT),
        )
    }

    @Test
    fun `Trakt more like this is active only when authenticated and selected`() {
        assertFalse(
            shouldUseTraktMoreLikeThis(
                isAuthenticated = false,
                source = MoreLikeThisSourcePreference.TRAKT,
            ),
        )
        assertFalse(
            shouldUseTraktMoreLikeThis(
                isAuthenticated = true,
                source = MoreLikeThisSourcePreference.TMDB,
            ),
        )
        assertTrue(
            shouldUseTraktMoreLikeThis(
                isAuthenticated = true,
                source = MoreLikeThisSourcePreference.TRAKT,
            ),
        )
    }
}
