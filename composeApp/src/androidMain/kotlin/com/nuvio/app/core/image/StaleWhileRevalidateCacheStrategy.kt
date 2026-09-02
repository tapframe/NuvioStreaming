package com.nuvio.app.core.image

import android.util.Log
import coil3.ImageLoader
import coil3.annotation.ExperimentalCoilApi
import coil3.network.CacheStrategy
import coil3.network.NetworkRequest
import coil3.network.NetworkResponse
import coil3.network.cachecontrol.CacheControlCacheStrategy
import coil3.request.Options
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.ConcurrentHashMap

/**
 * Stale-while-revalidate [CacheStrategy]:
 * - Fresh cache -> use it.
 * - Stale cache -> serve immediately from disk, revalidate in background.
 * - No cache -> normal network fetch.
 *
 * On background 200 (new image), evicts memory cache and notifies
 * [ImageInvalidationBus] so visible composables reload in-place.
 */
@OptIn(ExperimentalCoilApi::class)
class StaleWhileRevalidateCacheStrategy(
    private val revalidationClient: () -> OkHttpClient,
    private val imageLoaderProvider: () -> ImageLoader,
) : CacheStrategy {

    companion object {
        private const val TAG = "NuvioSWR"
        private const val REVALIDATION_COOLDOWN_MS = 10L * 60 * 1000 // 10 min
        private val revalidatingUrls = ConcurrentHashMap.newKeySet<String>()
        private val revalidatedAt = ConcurrentHashMap<String, Long>()
    }

    private val revalidationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val delegate = CacheControlCacheStrategy()

    override suspend fun read(
        cacheResponse: NetworkResponse,
        networkRequest: NetworkRequest,
        options: Options,
    ): CacheStrategy.ReadResult {
        val delegateResult = delegate.read(cacheResponse, networkRequest, options)
        if (delegateResult.response != null) return delegateResult

        val url = networkRequest.url
        val lastRevalidated = revalidatedAt[url]
        val now = System.currentTimeMillis()
        if (lastRevalidated == null || (now - lastRevalidated) > REVALIDATION_COOLDOWN_MS) {
            scheduleBackgroundRevalidation(url, cacheResponse)
        }
        return CacheStrategy.ReadResult(cacheResponse)
    }

    override suspend fun write(
        cacheResponse: NetworkResponse?,
        networkRequest: NetworkRequest,
        networkResponse: NetworkResponse,
        options: Options,
    ): CacheStrategy.WriteResult {
        return delegate.write(cacheResponse, networkRequest, networkResponse, options)
    }

    private fun scheduleBackgroundRevalidation(url: String, cachedResponse: NetworkResponse) {
        if (!revalidatingUrls.add(url)) return

        revalidationScope.launch {
            try {
                val client = revalidationClient()
                val requestBuilder = Request.Builder().url(url)
                cachedResponse.headers["etag"]?.let {
                    requestBuilder.addHeader("If-None-Match", it)
                }
                cachedResponse.headers["last-modified"]?.let {
                    requestBuilder.addHeader("If-Modified-Since", it)
                }

                val response = client.newCall(requestBuilder.build()).execute()
                try {
                    when (response.code) {
                        304 -> { /* unchanged */ }
                        in 200..299 -> {
                            evictFromDiskCache(url)
                            evictFromMemoryCache(url)
                            ImageInvalidationBus.notifyInvalidated(url)
                        }
                        else -> Log.w(TAG, "Revalidation ${response.code}: ${url.take(80)}")
                    }
                } finally {
                    response.close()
                }
            } catch (e: Exception) {
                if (e !is kotlinx.coroutines.CancellationException) {
                    Log.w(TAG, "Revalidation error: ${url.take(80)} - ${e.message}")
                }
            } finally {
                revalidatingUrls.remove(url)
                revalidatedAt[url] = System.currentTimeMillis()
            }
        }
    }

    private fun evictFromMemoryCache(url: String) {
        try {
            val memoryCache = imageLoaderProvider().memoryCache ?: return
            memoryCache.keys
                .filter { it.key.contains(url) }
                .forEach { memoryCache.remove(it) }
        } catch (_: Exception) { }
    }

    private fun evictFromDiskCache(url: String) {
        try {
            val diskCache = imageLoaderProvider().diskCache ?: return
            diskCache.openSnapshot(url)?.use { diskCache.remove(url) }
        } catch (_: Exception) { }
    }
}
