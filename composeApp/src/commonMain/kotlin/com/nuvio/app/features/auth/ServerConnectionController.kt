package com.nuvio.app.features.auth

import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.network.NetworkStatusRepository
import com.nuvio.app.core.network.ServerConfiguration
import com.nuvio.app.core.network.ServerConfigurationRepository
import com.nuvio.app.core.network.ServerDiscoveryException
import com.nuvio.app.core.network.ServerDiscoveryFailure
import com.nuvio.app.core.network.ServerDiscoveryService
import com.nuvio.app.core.network.SupabaseProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ServerSwitchFailure {
    SessionClear,
    Save,
    Restart,
}

data class ServerConnectionUiState(
    val activeServer: ServerConfiguration = ServerConfigurationRepository.active.value,
    val isDiscovering: Boolean = false,
    val isSwitching: Boolean = false,
    val discoveredServer: ServerConfiguration? = null,
    val failure: ServerDiscoveryFailure? = null,
    val statusCode: Int? = null,
    val switchFailure: ServerSwitchFailure? = null,
)

object ServerConnectionController {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _state = MutableStateFlow(ServerConnectionUiState())
    val state: StateFlow<ServerConnectionUiState> = _state.asStateFlow()
    private var discoveryJob: Job? = null

    fun discover(url: String) {
        if (_state.value.isDiscovering || _state.value.isSwitching) return
        discoveryJob?.cancel()
        discoveryJob = scope.launch {
            _state.update {
                it.copy(
                    isDiscovering = true,
                    discoveredServer = null,
                    failure = null,
                    statusCode = null,
                    switchFailure = null,
                )
            }
            ServerDiscoveryService.discover(url).fold(
                onSuccess = { server ->
                    _state.update { it.copy(isDiscovering = false, discoveredServer = server) }
                },
                onFailure = { error ->
                    val discoveryError = error as? ServerDiscoveryException
                    _state.update {
                        it.copy(
                            isDiscovering = false,
                            failure = discoveryError?.failure ?: ServerDiscoveryFailure.ConnectionFailed,
                            statusCode = discoveryError?.statusCode,
                        )
                    }
                },
            )
        }
    }

    fun connectDiscovered() {
        val server = _state.value.discoveredServer ?: return
        switchServer { ServerConfigurationRepository.saveCustom(server) }
    }

    fun useOfficial() {
        if (!_state.value.activeServer.isCustom) return
        switchServer(ServerConfigurationRepository::useOfficial)
    }

    fun resetDiscovery() {
        if (_state.value.isSwitching) return
        discoveryJob?.cancel()
        discoveryJob = null
        _state.update {
            it.copy(
                isDiscovering = false,
                discoveredServer = null,
                failure = null,
                statusCode = null,
                switchFailure = null,
            )
        }
    }

    private fun switchServer(save: () -> Boolean) {
        if (_state.value.isSwitching) return
        scope.launch {
            _state.update { it.copy(isSwitching = true, failure = null, switchFailure = null) }
            try {
                if (AuthRepository.prepareForServerSwitch().isFailure) {
                    _state.update {
                        it.copy(isSwitching = false, switchFailure = ServerSwitchFailure.SessionClear)
                    }
                    return@launch
                }
                if (!save()) {
                    _state.update { it.copy(isSwitching = false, switchFailure = ServerSwitchFailure.Save) }
                    return@launch
                }
                SupabaseProvider.reset()
                AuthRepository.reinitialize()
                NetworkStatusRepository.requestRefresh(force = true)
                _state.value = ServerConnectionUiState(
                    activeServer = ServerConfigurationRepository.active.value,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                _state.update { it.copy(isSwitching = false, switchFailure = ServerSwitchFailure.Restart) }
            }
        }
    }
}
