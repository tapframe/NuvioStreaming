package com.nuvio.app.features.player

import androidx.media3.common.MimeTypes
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlaybackSubtitleMimeTest {
    @Test
    fun slowProbeSuspendsCallerAndPreservesAuthenticatedFormatDetection(): Unit = runBlocking {
        MockWebServer().use { server ->
            val requested = CountDownLatch(1)
            val respond = CountDownLatch(1)
            server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    requested.countDown()
                    respond.await(5, TimeUnit.SECONDS)
                    return MockResponse().setHeader("Content-Type", "text/x-ssa; charset=utf-8")
                }
            }
            val result = async(start = CoroutineStart.UNDISPATCHED) {
                resolveSubtitleMimeType(server.url("/subtitle").toString(), mapOf("Authorization" to "test-token"))
            }
            try {
                assertTrue(requested.await(5, TimeUnit.SECONDS))
                assertFalse(result.isCompleted)
                assertEquals("test-token", server.takeRequest().getHeader("Authorization"))
            } finally {
                respond.countDown()
            }
            assertEquals(MimeTypes.TEXT_SSA, result.await())
        }
    }

    @Test
    fun cancelledProbeDoesNotPublishAStaleResult(): Unit = runBlocking {
        MockWebServer().use { server ->
            val requested = CountDownLatch(1)
            val respond = CountDownLatch(1)
            server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    requested.countDown()
                    respond.await(5, TimeUnit.SECONDS)
                    return MockResponse().setHeader("Content-Type", "text/x-ssa")
                }
            }
            var published = false
            val result = async(start = CoroutineStart.UNDISPATCHED) {
                resolveSubtitleMimeType(server.url("/subtitle").toString())
                published = true
            }
            try {
                assertTrue(requested.await(5, TimeUnit.SECONDS))
                result.cancel()
            } finally {
                respond.countDown()
            }
            result.join()
            assertFalse(published)
        }
    }

    @Test
    fun filenameAndUrlFallbacksKeepExistingSubtitleFormats(): Unit = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setHeader("Content-Disposition", "attachment; filename=\"captions.srt\""))
            server.enqueue(MockResponse())

            assertEquals(MimeTypes.APPLICATION_SUBRIP, resolveSubtitleMimeType(server.url("/subtitle").toString()))
            assertEquals(MimeTypes.TEXT_VTT, resolveSubtitleMimeType(server.url("/captions.vtt").toString()))
        }
    }
}
