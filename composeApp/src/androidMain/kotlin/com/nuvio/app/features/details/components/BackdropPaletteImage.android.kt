package com.nuvio.app.features.details.components

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import coil3.request.SuccessResult
import coil3.toBitmap

internal actual fun loadedBackdropImageBitmap(result: SuccessResult): ImageBitmap? =
    runCatching { result.image.toBitmap().asImageBitmap() }.getOrNull()
