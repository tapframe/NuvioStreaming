package com.nuvio.app.features.simkl

import kotlinx.serialization.Serializable

enum class SimklConnectionMode {
    DISCONNECTED,
    AWAITING_APPROVAL,
    CONNECTED,
}

enum class SimklAuthError {
    MISSING_CLIENT_ID,
    INVALID_CALLBACK,
    INVALID_CALLBACK_STATE,
    AUTHORIZATION_EXPIRED,
    TOKEN_EXCHANGE_FAILED,
    INVALID_TOKEN_RESPONSE,
    AUTHORIZATION_REVOKED,
}

data class SimklAuthUiState(
    val mode: SimklConnectionMode = SimklConnectionMode.DISCONNECTED,
    val credentialsConfigured: Boolean = false,
    val isLoading: Boolean = false,
    val username: String? = null,
    val accountId: Long? = null,
    val tokenExpiresAtEpochMs: Long? = null,
    val pendingAuthorizationStartedAtEpochMs: Long? = null,
    val error: SimklAuthError? = null,
)

@Serializable
internal data class SimklStoredAuthState(
    val username: String? = null,
    val accountId: Long? = null,
    val tokenExpiresAtEpochMs: Long? = null,
    val pendingAuthorizationState: String? = null,
    val pendingAuthorizationStartedAtEpochMs: Long? = null,
) {
    val hasPendingAuthorization: Boolean
        get() = !pendingAuthorizationState.isNullOrBlank()
}

internal sealed interface SimklAuthCallback {
    data class AuthorizationCode(
        val code: String,
        val state: String,
    ) : SimklAuthCallback

    data object Invalid : SimklAuthCallback
    data object NotSimkl : SimklAuthCallback
}
