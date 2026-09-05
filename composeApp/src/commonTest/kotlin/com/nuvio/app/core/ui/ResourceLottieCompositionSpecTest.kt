package com.nuvio.app.core.ui

import io.github.alexzhirkevich.compottie.LottieCompositionCache
import io.github.alexzhirkevich.compottie.prepare
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class ResourceLottieCompositionSpecTest {
    @Test
    fun `concurrent indicators read the resource once and reload after eviction`() = runBlocking {
        val cache = LottieCompositionCache(1)
        var reads = 0
        val readBytes: suspend (String) -> ByteArray = { path ->
            assertEquals("files/indicator.json", path)
            reads++
            yield()
            animation.encodeToByteArray()
        }
        val specs = List(4) { ResourceLottieCompositionSpec("files/indicator.json", readBytes) }

        assertEquals(0, reads)
        val compositions = specs.map { spec -> async { cache.prepare(spec) } }.awaitAll()

        assertEquals(1, reads)
        compositions.forEach { assertSame(compositions.first(), it) }
        assertEquals(40f, compositions.first().width)
        assertEquals(60f, compositions.first().durationFrames)

        cache.clear()
        cache.prepare(specs.first())

        assertEquals(2, reads)
    }

    @Test
    fun `resource failures can be retried without caching the failure`() = runBlocking {
        val cache = LottieCompositionCache(1)
        var reads = 0
        val spec = ResourceLottieCompositionSpec("files/indicator.json") {
            reads++
            if (reads == 1) error("Resource unavailable")
            animation.encodeToByteArray()
        }

        assertFailsWith<IllegalStateException> { cache.prepare(spec) }
        val composition = cache.prepare(spec)

        assertEquals(2, reads)
        assertEquals(40f, composition.width)
        assertSame(composition, cache.prepare(spec))
        assertEquals(2, reads)
    }

    private val animation = """{"v":"5.12.2","fr":60,"ip":0,"op":60,"w":40,"h":40,"layers":[]}"""
}
