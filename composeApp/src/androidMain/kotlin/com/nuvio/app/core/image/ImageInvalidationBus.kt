package com.nuvio.app.core.image

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Emits URLs of images that were refreshed by background revalidation.
 * Composables can observe this to reload visible posters in-place.
 */
object ImageInvalidationBus {
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 32)
    val events: SharedFlow<String> = _events.asSharedFlow()

    fun notifyInvalidated(url: String) {
        _events.tryEmit(url)
    }
}
