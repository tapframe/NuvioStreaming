package com.nuvio.app.core.ui

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.disk.DiskCache
import coil3.gif.AnimatedImageDecoder
import coil3.gif.GifDecoder
import coil3.memory.MemoryCache
import com.nuvio.app.core.network.IPv4FirstDns
import okhttp3.OkHttpClient
import okio.Path.Companion.toOkioPath
import java.util.concurrent.TimeUnit

internal val imageOkHttpClient by lazy {
    val imageDispatcher = okhttp3.Dispatcher().apply {
        maxRequests = 32
        maxRequestsPerHost = 16
    }
    OkHttpClient.Builder()
        .dispatcher(imageDispatcher)
        .dns(IPv4FirstDns())
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .callTimeout(12, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            try {
                chain.proceed(chain.request())
            } catch (e: java.net.SocketTimeoutException) {
                chain.withConnectTimeout(3, TimeUnit.SECONDS)
                    .withReadTimeout(4, TimeUnit.SECONDS)
                    .proceed(chain.request())
            }
        }
        .followRedirects(true)
        .followSslRedirects(true)
        .build()
}

internal actual fun ImageLoader.Builder.configurePlatformImageLoader(context: PlatformContext): ImageLoader.Builder {
    val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val memoryInfo = ActivityManager.MemoryInfo()
    activityManager?.getMemoryInfo(memoryInfo)
    val totalRamMb = if (activityManager != null && memoryInfo.totalMem > 0) {
        memoryInfo.totalMem / (1024 * 1024)
    } else {
        4096L
    }

    val cachePercent = when {
        totalRamMb <= 2048 -> 0.15
        totalRamMb <= 3072 -> 0.20
        else -> 0.25
    }

    return this
        .memoryCache {
            MemoryCache.Builder()
                .maxSizePercent(context, cachePercent)
                .build()
        }
        .diskCache {
            DiskCache.Builder()
                .directory(context.cacheDir.resolve("image_cache").toOkioPath())
                .maxSizeBytes(200L * 1024 * 1024)
                .build()
        }
        .components {
            if (Build.VERSION.SDK_INT >= 28) {
                add(AnimatedImageDecoder.Factory())
            } else {
                add(GifDecoder.Factory())
            }
        }
}