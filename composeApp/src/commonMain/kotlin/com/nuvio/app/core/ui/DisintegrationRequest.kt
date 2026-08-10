package com.nuvio.app.core.ui

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

data class DisintegrationRequest<K>(
    val id: Long,
    val key: K,
    val isActive: Boolean = true,
)

@Stable
internal class DisintegrationRequestController<K> {
    var current by mutableStateOf<DisintegrationRequest<K>?>(null)
        private set

    private var nextId = 0L

    fun arm(key: K): DisintegrationRequest<K> = DisintegrationRequest(
        id = ++nextId,
        key = key,
    ).also { request ->
        current = request
    }

    fun cancel(request: DisintegrationRequest<K>) {
        if (current?.id == request.id) {
            current = request.copy(isActive = false)
        }
    }
}
