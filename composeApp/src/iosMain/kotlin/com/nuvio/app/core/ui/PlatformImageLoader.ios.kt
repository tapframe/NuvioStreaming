package com.nuvio.app.core.ui

import coil3.ImageLoader
import coil3.PlatformContext
import coil3.memory.MemoryCache

internal actual fun ImageLoader.Builder.configurePlatformImageLoader(
    context: PlatformContext,
): ImageLoader.Builder =
    memoryCache {
        MemoryCache.Builder()
            .maxSizePercent(context, 0.25)
            .build()
    }
