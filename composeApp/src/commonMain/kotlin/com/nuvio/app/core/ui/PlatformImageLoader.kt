package com.nuvio.app.core.ui

import coil3.ImageLoader
import coil3.PlatformContext

internal expect fun ImageLoader.Builder.configurePlatformImageLoader(
    context: PlatformContext,
): ImageLoader.Builder
