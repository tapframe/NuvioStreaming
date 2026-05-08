package com.nuvio.app.features.trakt

import com.nuvio.app.features.collection.TraktListSort
import com.nuvio.app.features.collection.TraktSortHow
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TraktPublicListSourceResolverTest {
    @Test
    fun parsesNumericTraktListIdsFromInputs() {
        assertEquals(123456L, TraktPublicListSourceResolver.parseTraktListId("123456"))
        assertEquals(123456L, TraktPublicListSourceResolver.parseTraktListId("https://trakt.tv/lists/123456"))
        assertEquals(123456L, TraktPublicListSourceResolver.parseTraktListId("https://trakt.tv/users/nuvio/lists/123456"))
        assertEquals(123456L, TraktPublicListSourceResolver.parseTraktListId("https://example.com/import?id=123456"))
        assertNull(TraktPublicListSourceResolver.parseTraktListId(""))
    }

    @Test
    fun normalizesTraktSortValues() {
        assertEquals("rank", TraktListSort.normalize(null))
        assertEquals("added", TraktListSort.normalize(" ADDED "))
        assertEquals("rank", TraktListSort.normalize("unknown"))

        assertEquals("asc", TraktSortHow.normalize(null))
        assertEquals("desc", TraktSortHow.normalize(" DESC "))
        assertEquals("asc", TraktSortHow.normalize("sideways"))
    }

    @Test
    fun normalizesTraktImageUrls() {
        assertEquals(
            "https://media.trakt.tv/images/poster.jpg",
            "media.trakt.tv/images/poster.jpg".toTraktImageUrl(),
        )
        assertEquals(
            "https://media.trakt.tv/images/poster.jpg",
            "http://media.trakt.tv/images/poster.jpg".toTraktImageUrl(),
        )
        assertEquals(
            "https://cdn.example.com/poster.jpg",
            "https://cdn.example.com/poster.jpg".toTraktImageUrl(),
        )
        assertEquals(
            "https://media.trakt.tv/images/poster.jpg",
            listOf("", "media.trakt.tv/images/poster.jpg").firstTraktImageUrl(),
        )
    }
}
