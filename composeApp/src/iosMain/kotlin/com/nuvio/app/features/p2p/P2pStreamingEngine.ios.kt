package com.nuvio.app.features.p2p

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.p2p_error_not_available_platform
import org.jetbrains.compose.resources.getString

actual object P2pStreamingEngine {
    private val _state = MutableStateFlow<P2pStreamingState>(P2pStreamingState.Idle)
    actual val state: StateFlow<P2pStreamingState> = _state.asStateFlow()

    actual suspend fun startStream(request: P2pStreamRequest): String {
        val message = getString(Res.string.p2p_error_not_available_platform)
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
