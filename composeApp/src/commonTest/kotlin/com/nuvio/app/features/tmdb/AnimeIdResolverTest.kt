package com.nuvio.app.features.tmdb

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AnimeIdResolverTest {
    @Test
    fun `resolves supported anime id through ARM`() = runBlocking {
        val calls = mutableListOf<Pair<String, String>>()
        val resolver = AnimeIdResolver(
            lookupTmdbId = { source, id ->
                calls += source to id
                12345
            },
            cache = FakeAnimeIdMappingCache(),
            scope = this,
        )

        assertEquals(12345, resolver.resolveTmdbId("series:mal:62322"))
        assertEquals(listOf("myanimelist" to "62322"), calls)
    }

    @Test
    fun `reuses a successful cached mapping`() = runBlocking {
        var calls = 0
        val resolver = AnimeIdResolver(
            lookupTmdbId = { _, _ ->
                calls += 1
                777
            },
            cache = FakeAnimeIdMappingCache(),
            scope = this,
        )

        assertEquals(777, resolver.resolveTmdbId("anilist:100"))
        assertEquals(777, resolver.resolveTmdbId("anilist:100"))
        assertEquals(1, calls)
    }

    @Test
    fun `concurrent requests share one ARM lookup`() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        var calls = 0
        val resolver = AnimeIdResolver(
            lookupTmdbId = { _, _ ->
                calls += 1
                started.complete(Unit)
                release.await()
                321
            },
            cache = FakeAnimeIdMappingCache(),
            scope = this,
        )

        val direct = async { resolver.resolveTmdbId("kitsu:55") }
        started.await()
        val prefetch = launch { resolver.prefetchTmdbIds(listOf("series:kitsu:55")) }
        yield()
        release.complete(Unit)

        assertEquals(321, direct.await())
        prefetch.join()
        assertEquals(1, calls)
    }

    @Test
    fun `cancelled caller does not cancel shared mapping`() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        var calls = 0
        val resolver = AnimeIdResolver(
            lookupTmdbId = { _, _ ->
                calls += 1
                started.complete(Unit)
                release.await()
                654
            },
            cache = FakeAnimeIdMappingCache(),
            scope = this,
        )

        val cancelledCaller = launch { resolver.resolveTmdbId("mal:99") }
        started.await()
        cancelledCaller.cancelAndJoin()
        val survivingCaller = async { resolver.resolveTmdbId("mal:99") }
        release.complete(Unit)

        assertEquals(654, survivingCaller.await())
        assertEquals(1, calls)
    }

    @Test
    fun `prefetch ignores ordinary non anime ids`() = runBlocking {
        var calls = 0
        val resolver = AnimeIdResolver(
            lookupTmdbId = { _, _ ->
                calls += 1
                null
            },
            cache = FakeAnimeIdMappingCache(),
            scope = this,
        )

        resolver.prefetchTmdbIds(listOf("tt1234567", "tmdb:123", "series:example-show"))

        assertEquals(0, calls)
        assertNull(resolver.resolveTmdbId("tt1234567"))
    }

    @Test
    fun `supports the same ARM sources as TV`() {
        val resolver = AnimeIdResolver(
            lookupTmdbId = { _, _ -> null },
            cache = FakeAnimeIdMappingCache(),
        )

        assertTrue(resolver.supports("mal:1"))
        assertTrue(resolver.supports("series:anilist:2"))
        assertTrue(resolver.supports("kitsu:3"))
        assertTrue(resolver.supports("anidb:4"))
        assertTrue(resolver.supports("anime-planet:some-show"))
        assertTrue(resolver.supports("ann:5"))
        assertTrue(resolver.supports("livechart:6"))
        assertFalse(resolver.supports("imdb:tt1234567"))
    }
}

private class FakeAnimeIdMappingCache : AnimeIdMappingCache {
    private val values = mutableMapOf<String, CachedAnimeTmdbMapping>()

    override suspend fun get(source: String, id: String): CachedAnimeTmdbMapping? = values["$source:$id"]

    override suspend fun putSuccess(source: String, id: String, tmdbId: Int) {
        values["$source:$id"] = CachedAnimeTmdbMapping(tmdbId, Long.MAX_VALUE, missCount = 0)
    }

    override suspend fun putMiss(source: String, id: String) {
        values["$source:$id"] = CachedAnimeTmdbMapping(null, Long.MAX_VALUE, missCount = 1)
    }

    override suspend fun putFailure(source: String, id: String) {
        values["$source:$id"] = CachedAnimeTmdbMapping(null, Long.MAX_VALUE, missCount = 0)
    }

    override suspend fun clear() {
        values.clear()
    }
}
