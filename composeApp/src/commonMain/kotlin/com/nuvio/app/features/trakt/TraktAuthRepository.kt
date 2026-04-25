package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetTextWithHeaders
import com.nuvio.app.features.addons.httpPostJsonWithHeaders
import io.ktor.http.Url
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.random.Random
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.StringResource
import kotlinx.coroutines.runBlocking

object TraktAuthRepository {
    private const val BASE_URL = "https://api.trakt.tv"
    private const val AUTHORIZE_URL = "https://trakt.tv/oauth/authorize"
    private const val API_VERSION = "2"

    private val log = Logger.withTag("TraktAuth")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _uiState = MutableStateFlow(TraktAuthUiState())
    val uiState: StateFlow<TraktAuthUiState> = _uiState.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    private var hasLoaded = false
    private var authState = TraktAuthState()

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        authState = TraktAuthState()
        publish()
    }

    fun snapshot(): TraktAuthUiState {
        ensureLoaded()
        return _uiState.value
    }

    fun hasRequiredCredentials(): Boolean =
        TraktConfig.CLIENT_ID.isNotBlank() && TraktConfig.CLIENT_SECRET.isNotBlank()

    fun onConnectRequested(): String? {
        ensureLoaded()
        if (!hasRequiredCredentials()) {
            publish(errorMessage = localizedString(Res.string.trakt_missing_credentials))
            return null
        }

        val oauthState = generateOauthState()
        authState = authState.copy(
            pendingAuthorizationState = oauthState,
            pendingAuthorizationStartedAtMillis = TraktPlatformClock.nowEpochMs(),
        )
        persist()
        publish(
            statusMessage = localizedString(Res.string.trakt_complete_sign_in_browser),
            errorMessage = null,
        )

        return buildAuthorizationUrl(oauthState)
    }

    fun pendingAuthorizationUrl(): String? {
        ensureLoaded()
        val oauthState = authState.pendingAuthorizationState ?: return null
        return buildAuthorizationUrl(oauthState)
    }

    fun onCancelAuthorization() {
        ensureLoaded()
        clearPendingAuthorization()
        persist()
        publish(statusMessage = null, errorMessage = null)
    }

    fun onCancelDeviceFlow() {
        onCancelAuthorization()
    }

    fun onAuthLaunchFailed(reason: String) {
        publish(errorMessage = reason)
    }

    fun onAuthCallbackReceived(callbackUrl: String) {
        ensureLoaded()
        if (!callbackUrl.startsWith("${TraktConfig.REDIRECT_URI}?", ignoreCase = true) &&
            !callbackUrl.equals(TraktConfig.REDIRECT_URI, ignoreCase = true)
        ) {
            return
        }

        scope.launch {
            completeAuthorizationFromCallback(callbackUrl)
        }
    }

    suspend fun authorizedHeaders(): Map<String, String>? {
        ensureLoaded()
        if (!authState.isAuthenticated) return null

        val hasValidToken = refreshTokenIfNeeded(force = false)
        if (!hasValidToken) return null

        val accessToken = authState.accessToken?.trim().orEmpty()
        if (accessToken.isBlank()) return null

        return mapOf(
            "trakt-api-version" to API_VERSION,
            "trakt-api-key" to TraktConfig.CLIENT_ID,
            "Authorization" to "Bearer $accessToken",
        )
    }

    suspend fun refreshUserSettings(): String? {
        ensureLoaded()
        val headers = authorizedHeaders() ?: return null
        val response = runCatching {
            httpGetTextWithHeaders(
                url = "$BASE_URL/users/settings",
                headers = headers,
            )
        }.onFailure { error ->
            if (error is CancellationException) throw error
            log.w { "Failed to fetch Trakt user settings: ${error.message}" }
        }.getOrNull() ?: return null

        val parsed = runCatching {
            json.decodeFromString<TraktUserSettingsResponse>(response)
        }.getOrNull() ?: return null

        authState = authState.copy(
            username = parsed.user?.username,
            userSlug = parsed.user?.ids?.slug,
        )
        persist()
        publish()
        return authState.username
    }

    fun onDisconnectRequested() {
        ensureLoaded()
        scope.launch {
            disconnect()
        }
    }

    private suspend fun completeAuthorizationFromCallback(callbackUrl: String) {
        publish(isLoading = true, errorMessage = null)

        val parsedUrl = runCatching { Url(callbackUrl) }
            .onFailure {
                log.w { "Invalid Trakt callback URL: ${it.message}" }
            }
            .getOrNull()

        if (parsedUrl == null) {
            clearPendingAuthorization()
            persist()
            publish(
                isLoading = false,
                errorMessage = localizedString(Res.string.trakt_invalid_callback),
            )
            return
        }

        val errorCode = parsedUrl.parameters["error"]
        if (!errorCode.isNullOrBlank()) {
            val errorDescription = parsedUrl.parameters["error_description"]
                ?: localizedString(Res.string.trakt_authorization_denied)
            clearPendingAuthorization()
            persist()
            publish(
                isLoading = false,
                errorMessage = errorDescription,
            )
            return
        }

        val code = parsedUrl.parameters["code"].orEmpty().trim()
        if (code.isBlank()) {
            clearPendingAuthorization()
            persist()
            publish(
                isLoading = false,
                errorMessage = localizedString(Res.string.trakt_missing_auth_code),
            )
            return
        }

        val expectedState = authState.pendingAuthorizationState
        val callbackState = parsedUrl.parameters["state"].orEmpty().trim()
        if (!expectedState.isNullOrBlank() && callbackState != expectedState) {
            clearPendingAuthorization()
            persist()
            publish(
                isLoading = false,
                errorMessage = localizedString(Res.string.trakt_invalid_callback_state),
            )
            return
        }

        exchangeAuthorizationCode(code)
    }

    private suspend fun exchangeAuthorizationCode(code: String) {
        val body = json.encodeToString(
            TraktAuthorizationCodeRequest(
                code = code,
                clientId = TraktConfig.CLIENT_ID,
                clientSecret = TraktConfig.CLIENT_SECRET,
                redirectUri = TraktConfig.REDIRECT_URI,
            ),
        )

        val response = runCatching {
            httpPostJsonWithHeaders(
                url = "$BASE_URL/oauth/token",
                body = body,
                headers = emptyMap(),
            )
        }.onFailure { error ->
            if (error is CancellationException) throw error
            log.w { "Failed to exchange Trakt auth code: ${error.message}" }
        }.getOrNull()

        if (response == null) {
            clearPendingAuthorization()
            persist()
            publish(isLoading = false, errorMessage = localizedString(Res.string.trakt_sign_in_complete_failed))
            return
        }

        val parsed = runCatching {
            json.decodeFromString<TraktTokenResponse>(response)
        }.getOrNull()

        if (parsed == null) {
            clearPendingAuthorization()
            persist()
            publish(isLoading = false, errorMessage = localizedString(Res.string.trakt_invalid_token_response))
            return
        }

        authState = authState.copy(
            accessToken = parsed.accessToken,
            refreshToken = parsed.refreshToken,
            tokenType = parsed.tokenType,
            createdAt = parsed.createdAt,
            expiresIn = parsed.expiresIn,
            pendingAuthorizationState = null,
            pendingAuthorizationStartedAtMillis = null,
        )
        persist()
        refreshUserSettings()
        publish(
            isLoading = false,
            statusMessage = "Connected to Trakt",
            errorMessage = null,
        )
    }

    private suspend fun disconnect() {
        publish(isLoading = true, errorMessage = null)

        val token = authState.accessToken?.takeIf { it.isNotBlank() }
        if (!token.isNullOrBlank() && hasRequiredCredentials()) {
            val body = json.encodeToString(
                TraktRevokeRequest(
                    token = token,
                    clientId = TraktConfig.CLIENT_ID,
                    clientSecret = TraktConfig.CLIENT_SECRET,
                ),
            )
            runCatching {
                httpPostJsonWithHeaders(
                    url = "$BASE_URL/oauth/revoke",
                    body = body,
                    headers = emptyMap(),
                )
            }.onFailure { error ->
                if (error is CancellationException) throw error
                log.w { "Failed to revoke Trakt token: ${error.message}" }
            }
        }

        authState = TraktAuthState()
        persist()
        publish(
            isLoading = false,
            statusMessage = "Disconnected from Trakt",
            errorMessage = null,
        )
    }

    private suspend fun refreshTokenIfNeeded(force: Boolean): Boolean {
        if (!hasRequiredCredentials()) return false
        val refreshToken = authState.refreshToken?.takeIf { it.isNotBlank() } ?: return false

        if (!force && !isTokenExpiredOrExpiring(authState)) {
            return true
        }

        val body = json.encodeToString(
            TraktRefreshTokenRequest(
                refreshToken = refreshToken,
                clientId = TraktConfig.CLIENT_ID,
                clientSecret = TraktConfig.CLIENT_SECRET,
                redirectUri = TraktConfig.REDIRECT_URI,
            ),
        )

        val response = runCatching {
            httpPostJsonWithHeaders(
                url = "$BASE_URL/oauth/token",
                body = body,
                headers = emptyMap(),
            )
        }.onFailure { error ->
            if (error is CancellationException) throw error
            log.w { "Trakt token refresh failed: ${error.message}" }
        }.getOrNull() ?: return false

        val parsed = runCatching {
            json.decodeFromString<TraktTokenResponse>(response)
        }.getOrNull() ?: return false

        authState = authState.copy(
            accessToken = parsed.accessToken,
            refreshToken = parsed.refreshToken,
            tokenType = parsed.tokenType,
            createdAt = parsed.createdAt,
            expiresIn = parsed.expiresIn,
        )
        persist()
        publish()
        return true
    }

    private fun loadFromDisk() {
        hasLoaded = true
        val payload = TraktAuthStorage.loadPayload().orEmpty().trim()
        authState = if (payload.isBlank()) {
            TraktAuthState()
        } else {
            runCatching { json.decodeFromString<TraktAuthState>(payload) }
                .getOrElse {
                    log.w { "Failed to parse Trakt auth payload: ${it.message}" }
                    TraktAuthState()
                }
        }
        publish(statusMessage = null, errorMessage = null)
    }

    private fun clearPendingAuthorization() {
        authState = authState.copy(
            pendingAuthorizationState = null,
            pendingAuthorizationStartedAtMillis = null,
        )
    }

    private fun publish(
        isLoading: Boolean = _uiState.value.isLoading,
        statusMessage: String? = _uiState.value.statusMessage,
        errorMessage: String? = _uiState.value.errorMessage,
    ) {
        val tokenExpiresAtMillis = authState.createdAt
            ?.let { createdAtSeconds ->
                authState.expiresIn?.let { expiresInSeconds ->
                    (createdAtSeconds + expiresInSeconds) * 1_000L
                }
            }

        val mode = when {
            authState.isAuthenticated -> TraktConnectionMode.CONNECTED
            !authState.pendingAuthorizationState.isNullOrBlank() -> TraktConnectionMode.AWAITING_APPROVAL
            else -> TraktConnectionMode.DISCONNECTED
        }

        _isAuthenticated.value = authState.isAuthenticated
        _uiState.value = TraktAuthUiState(
            mode = mode,
            credentialsConfigured = hasRequiredCredentials(),
            isLoading = isLoading,
            username = authState.username,
            tokenExpiresAtMillis = tokenExpiresAtMillis,
            pendingAuthorizationStartedAtMillis = authState.pendingAuthorizationStartedAtMillis,
            statusMessage = statusMessage,
            errorMessage = errorMessage,
        )
    }

    private fun persist() {
        TraktAuthStorage.savePayload(json.encodeToString(authState))
    }

    private fun buildAuthorizationUrl(state: String): String {
        val responseType = "code"
        val encodedClientId = TraktConfig.CLIENT_ID.encodeURLParameter()
        val encodedRedirectUri = TraktConfig.REDIRECT_URI.encodeURLParameter()
        val encodedState = state.encodeURLParameter()
        return "$AUTHORIZE_URL?response_type=$responseType&client_id=$encodedClientId&redirect_uri=$encodedRedirectUri&state=$encodedState"
    }

    private fun generateOauthState(): String {
        val nowPart = TraktPlatformClock.nowEpochMs().toString(16)
        val randomPart = Random.nextLong().toULong().toString(16)
        return "$nowPart$randomPart"
    }

    private fun isTokenExpiredOrExpiring(state: TraktAuthState): Boolean {
        val createdAt = state.createdAt ?: return true
        val expiresIn = state.expiresIn ?: return true
        val expiresAtSeconds = createdAt + expiresIn
        val nowSeconds = TraktPlatformClock.nowEpochMs() / 1_000L
        return nowSeconds >= (expiresAtSeconds - 60)
    }
}

@Serializable
private data class TraktAuthorizationCodeRequest(
    @SerialName("code") val code: String,
    @SerialName("client_id") val clientId: String,
    @SerialName("client_secret") val clientSecret: String,
    @SerialName("redirect_uri") val redirectUri: String,
    @SerialName("grant_type") val grantType: String = "authorization_code",
)

@Serializable
private data class TraktRefreshTokenRequest(
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("client_id") val clientId: String,
    @SerialName("client_secret") val clientSecret: String,
    @SerialName("redirect_uri") val redirectUri: String,
    @SerialName("grant_type") val grantType: String = "refresh_token",
)

@Serializable
private data class TraktRevokeRequest(
    @SerialName("token") val token: String,
    @SerialName("client_id") val clientId: String,
    @SerialName("client_secret") val clientSecret: String,
)

@Serializable
private data class TraktTokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("token_type") val tokenType: String,
    @SerialName("expires_in") val expiresIn: Int,
    @SerialName("created_at") val createdAt: Long,
)

@Serializable
private data class TraktUserSettingsResponse(
    val user: TraktUserDto? = null,
)

@Serializable
private data class TraktUserDto(
    val username: String? = null,
    val ids: TraktUserIdsDto? = null,
)

@Serializable
private data class TraktUserIdsDto(
    val slug: String? = null,
)
    private fun localizedString(resource: StringResource): String = runBlocking { getString(resource) }
