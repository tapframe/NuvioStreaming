package com.nuvio.app.features.p2p

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

actual object P2pStreamingEngine {
    private val _state = MutableStateFlow<P2pStreamingState>(P2pStreamingState.Idle)
    actual val state: StateFlow<P2pStreamingState> = _state.asStateFlow()

    actual suspend fun startStream(request: P2pStreamRequest): String {
        val message = "P2P streaming is not available on this platform"
        _state.value = P2pStreamingState.Error(message)
        throw P2pStreamingException(message)
    }

    actual fun stopStream() {
        _state.value = P2pStreamingState.Idle
    }

    actual fun shutdown() {
        _state.value = P2pStreamingState.Idle
    }
}
