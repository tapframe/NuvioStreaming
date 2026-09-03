package com.nuvio.app.core.ui

import coil3.ImageLoader
import coil3.PlatformContext
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import okio.FileSystem
import okio.Path.Companion.toPath
import platform.Foundation.NSCachesDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSUserDomainMask

internal actual fun ImageLoader.Builder.configurePlatformImageLoader(context: PlatformContext): ImageLoader.Builder {
    val cacheDirectoryPath = runCatching {
        val paths = NSFileManager.defaultManager.URLsForDirectory(NSCachesDirectory, NSUserDomainMask)
        val url = paths.firstOrNull() as? platform.Foundation.NSURL
        url?.path?.let { "$it/image_cache".toPath() }
    }.getOrNull() ?: (FileSystem.SYSTEM_TEMPORARY_DIRECTORY / "image_cache")

    return this
        .memoryCache {
            MemoryCache.Builder()
                .maxSizePercent(0.25)
                .build()
        }
        .diskCache {
            DiskCache.Builder()
                .directory(cacheDirectoryPath)
                .maxSizeBytes(200L * 1024 * 1024)
                .build()
        }
}