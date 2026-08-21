package com.nuvio.app.features.player

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PlayerLibmpvAddonSubtitlesTest {

    @Test
    fun stagesExactSignedUrlOnceAndReusesTheLocalFile() = runBlocking {
        val cacheDirectory = temporaryCacheDirectory()
        val signedUrl = "https://subs.example/file/42.srt?token=a%2Bb&expires=4102444800"
        var openedUrl: String? = null
        val createCount = AtomicInteger()
        val loader = LibmpvAddonSubtitleLoader(
            cacheDirectory = cacheDirectory,
            dataSourceFactory = {
                DataSource.Factory {
                    createCount.incrementAndGet()
                    byteArrayDataSource("subtitle".encodeToByteArray()) { dataSpec ->
                        openedUrl = dataSpec.uri.toString()
                    }
                }
            },
        )
        val request = LibmpvAddonSubtitleRequest("addon:english", signedUrl)

        val first = loader.load(request)
        val second = loader.load(request)

        assertEquals(signedUrl, openedUrl)
        assertEquals(1, createCount.get())
        assertEquals(first, second)
        assertEquals("subtitle", first.readText())
        assertEquals("srt", first.extension)
        loader.clearSource()
        assertFalse(first.exists())
        assertFalse(cacheDirectory.exists())
    }

    @Test
    fun supersededLoadClosesItsReadBeforeTheNextLoadStarts() = runBlocking {
        val firstOpened = CountDownLatch(1)
        val firstClosed = CountDownLatch(1)
        val createdCount = AtomicInteger()
        val activeCount = AtomicInteger()
        val maxActiveCount = AtomicInteger()
        val loader = LibmpvAddonSubtitleLoader(
            cacheDirectory = temporaryCacheDirectory(),
            dataSourceFactory = {
                DataSource.Factory {
                    val ordinal = createdCount.getAndIncrement()
                    object : DataSource {
                        private val closed = AtomicBoolean()

                        override fun addTransferListener(transferListener: TransferListener) = Unit

                        override fun open(dataSpec: DataSpec): Long {
                            val active = activeCount.incrementAndGet()
                            maxActiveCount.updateAndGet { current -> maxOf(current, active) }
                            if (ordinal == 0) {
                                firstOpened.countDown()
                                firstClosed.await(5, TimeUnit.SECONDS)
                            }
                            return 0L
                        }

                        override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
                            C.RESULT_END_OF_INPUT

                        override fun getUri(): Uri? = null

                        override fun close() {
                            if (closed.compareAndSet(false, true)) {
                                activeCount.decrementAndGet()
                                if (ordinal == 0) firstClosed.countDown()
                            }
                        }
                    }
                }
            },
        )
        val first = async(Dispatchers.Default) {
            loader.load(LibmpvAddonSubtitleRequest("addon:a", "https://subs.example/a.srt"))
        }
        assertTrue(firstOpened.await(5, TimeUnit.SECONDS))

        first.cancel()
        loader.cancelActive()
        val second = async(Dispatchers.Default) {
            loader.load(LibmpvAddonSubtitleRequest("addon:b", "https://subs.example/b.srt"))
        }

        second.await()
        try {
            first.await()
        } catch (_: CancellationException) {
            // Expected: closing the active source releases the superseded read.
        }
        assertEquals(1, maxActiveCount.get())
        assertEquals(0, activeCount.get())
    }

    @Test
    fun oversizedSubtitleLeavesNoCachedOrPartialFile() = runBlocking {
        val cacheDirectory = temporaryCacheDirectory()
        val loader = LibmpvAddonSubtitleLoader(
            cacheDirectory = cacheDirectory,
            dataSourceFactory = {
                DataSource.Factory { byteArrayDataSource(ByteArray(17) { 1 }) }
            },
            maxFileBytes = 16L,
        )

        val result = runCatching {
            loader.load(LibmpvAddonSubtitleRequest("addon:large", "https://subs.example/large.srt"))
        }

        assertTrue(result.isFailure)
        assertTrue(cacheDirectory.listFiles().orEmpty().isEmpty())
    }

    private fun temporaryCacheDirectory(): File =
        kotlin.io.path.createTempDirectory("libmpv-addon-test").toFile()

    private fun byteArrayDataSource(
        bytes: ByteArray,
        onOpen: (DataSpec) -> Unit = {},
    ): DataSource = object : DataSource {
        private var position = 0

        override fun addTransferListener(transferListener: TransferListener) = Unit

        override fun open(dataSpec: DataSpec): Long {
            onOpen(dataSpec)
            position = 0
            return bytes.size.toLong()
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            if (position == bytes.size) return C.RESULT_END_OF_INPUT
            val count = minOf(length, bytes.size - position)
            bytes.copyInto(buffer, offset, position, position + count)
            position += count
            return count
        }

        override fun getUri(): Uri? = null

        override fun close() = Unit
    }
}
