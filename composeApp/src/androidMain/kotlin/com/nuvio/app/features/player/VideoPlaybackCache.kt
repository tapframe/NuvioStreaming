package com.nuvio.app.features.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.cache.CacheDataSink
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

/**
 * Singleton managing the shared [SimpleCache] instance for ExoPlayer stream caching on Android.
 * Caches played VOD/video segments to disk so rewinds, seeks, and replay don't re-download video.
 */
@UnstableApi
internal object VideoPlaybackCache {
    private var simpleCache: SimpleCache? = null
    private const val MAX_VOD_CACHE_BYTES = 250L * 1024L * 1024L // 250MB stream chunk cache

    @Synchronized
    fun getCache(context: Context): SimpleCache {
        val existing = simpleCache
        if (existing != null) return existing

        val cacheDir = File(context.cacheDir, "media_stream_cache")
        val evictor = LeastRecentlyUsedCacheEvictor(MAX_VOD_CACHE_BYTES)
        val dbProvider = StandaloneDatabaseProvider(context)

        return SimpleCache(cacheDir, evictor, dbProvider).also {
            simpleCache = it
        }
    }

    fun wrapWithCache(context: Context, upstreamFactory: DataSource.Factory): DataSource.Factory {
        return try {
            val cache = getCache(context)
            val dataSinkFactory = CacheDataSink.Factory()
                .setCache(cache)
                .setFragmentSize(2L * 1024L * 1024L) // 2MB chunk fragments

            CacheDataSource.Factory()
                .setCache(cache)
                .setCacheWriteDataSinkFactory(dataSinkFactory)
                .setUpstreamDataSourceFactory(upstreamFactory)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        } catch (_: Throwable) {
            upstreamFactory
        }
    }
}
