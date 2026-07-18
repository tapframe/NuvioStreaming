package com.nuvio.app.features.trakt

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetTextWithHeaders
import com.nuvio.app.features.addons.httpPostJsonWithHeaders
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.profiles.ProfileRepository
import io.ktor.http.Url
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.random.Random
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.StringResource
import kotlinx.coroutines.runBlocking

object TraktAuthRepository {
    private const val BASE_URL = "https://api.trakt.tv"
    private const val AUTHORIZE_URL = "https://trakt.tv/oauth/authorize"
    private const val ACTIVATE_URL = "https://trakt.tv/activate"
    private const val API_VERSION = "2"
    private const val DEVICE_CODE_PREFIX = "device:"
    private const val DEVICE_CODE_SEPARATOR = "|"
    private const val DEFAULT_DEVICE_POLL_INTERVAL_SECONDS = 5
    private const val DEFAULT_DEVICE_EXPIRES_IN_SECONDS = 600
    private const val AUTH_METHOD_PAYLOAD_KEY = "authentication_method"

    private val log = Logger.withTag("TraktAuth")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val refreshMutex = Mutex()

    private val _uiState = MutableStateFlow(TraktAuthUiState())
    val uiState: StateFlow<TraktAuthUiState> = _uiState.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    private var hasLoaded = false
    private var authState = TraktAuthState()
    private var authenticationMethod = TraktAuthenticationMethod.BROWSER_REDIRECT
    private var devicePollingJob: Job? = null

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        devicePollingJob?.cancel()
        devicePollingJob = null
        hasLoaded = false
        authState = TraktAuthState()
        authenticationMethod = TraktAuthenticationMethod.BROWSER_REDIRECT
        publish()
    }

    fun snapshot(): TraktAuthUiState {
        ensureLoaded()
        return _uiState.value
    }

    fun hasRequiredCredentials(): Boolean =
        TraktConfig.CLIENT_ID.isNotBlank() && TraktConfig.CLIENT_SECRET.isNotBlank()

    internal fun selectedAuthenticationMethod(): TraktAuthenticationMethod {
        ensureLoaded()
        return authenticationMethod
    }

    internal fun setAuthenticationMethod(method: TraktAuthenticationMethod) {
        ensureLoaded()
        if (authenticationMethod == method) return

        devicePollingJob?.cancel()
        devicePollingJob = null
        authenticationMethod = method
        clearPendingAuthorization()
        persist()
        publish(
            isLoading = false,
            statusMessage = null,
            errorMessage = null,
        )
    }

    fun onConnectRequested(): String? {
        ensureLoaded()
        if (!hasRequiredCredentials()) {
            publish(errorMessage = localizedString(Res.string.trakt_missing_credentials))
            return null
        }

        devicePollingJob?.cancel()
        clearPendingAuthorization()

        return when (authenticationMethod) {
            TraktAuthenticationMethod.BROWSER_REDIRECT -> {
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
                buildAuthorizationUrl(oauthState)
            }

            TraktAuthenticationMethod.DEVICE_CODE -> {
                publish(
                    isLoading = true,
                    statusMessage = localizedString(Res.string.trakt_device_request_code),
                    errorMessage = null,
                )
                scope.launch {
                    startDeviceAuthorization()
                }
                null
            }
        }
    }

    internal fun pendingAuthorizationUrl(): String? {
        ensureLoaded()
        val pendingState = authState.pendingAuthorizationState ?: return null
        if (pendingState.startsWith(DEVICE_CODE_PREFIX)) return ACTIVATE_URL
        return buildAuthorizationUrl(pendingState)
    }

    internal fun pendingDeviceUserCode(): String? {
        ensureLoaded()
        return pendingDeviceAuthorization()?.userCode
    }

    fun onCancelAuthorization() {
        ensureLoaded()
        devicePollingJob?.cancel()
        devicePollingJob = null
        clearPendingAuthorization()
        persist()
        publish(statusMessage = null, errorMessage = null, isLoading = false)
    }

    internal fun onCancelDeviceFlow() {
        onCancelAuthorization()
    }

    fun onAuthLaunchFailed(reason: String) {
        publish(errorMessage = reason)
    }

    fun onAuthCallbackReceived(callbackUrl: String) {
        ensureLoaded()
        if (!pendingDeviceCode().isNullOrBlank()) return
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

    private suspend fun startDeviceAuthorization() {
        val requestBody = json.encodeToString(
            TraktDeviceCodeRequest(
                clientId = TraktConfig.CLIENT_ID,
            ),
        )

        val response = runCatching {
            httpPostJsonWithHeaders(
                url = "$BASE_URL/oauth/device/code",
                body = requestBody,
                headers = emptyMap(),
            )
        }.onFailure { error ->
            if (error is CancellationException) throw error
            log.w { "Failed to request Trakt device code: ${error.message}" }
        }.getOrNull()

        val parsed = response?.let { payload ->
            runCatching { json.decodeFromString<TraktDeviceCodeResponse>(payload) }.getOrNull()
        }

        if (parsed == null || parsed.deviceCode.isBlank() || parsed.userCode.isBlank()) {
            clearPendingAuthorization()
            persist()
            publish(
                isLoading = false,
                statusMessage = null,
                errorMessage = localizedString(Res.string.trakt_device_start_failed),
            )
            return
        }

        authState = authState.copy(
            pendingAuthorizationState = buildPendingDeviceAuthorizationState(parsed.deviceCode, parsed.userCode),
            pendingAuthorizationStartedAtMillis = TraktPlatformClock.nowEpochMs(),
        )
        persist()
        publish(
            isLoading = false,
            statusMessage = buildDeviceAuthorizationMessage(parsed),
            errorMessage = null,
        )
        startDeviceTokenPolling(
            deviceCode = parsed.deviceCode,
            intervalSeconds = parsed.interval,
            expiresInSeconds = parsed.expiresIn,
        )
    }

    private fun startDeviceTokenPolling(
        deviceCode: String,
        intervalSeconds: Int?,
        expiresInSeconds: Int?,
    ) {
        devicePollingJob?.cancel()
        devicePollingJob = scope.launch {
            val pollIntervalSeconds = intervalSeconds
                ?.coerceAtLeast(DEFAULT_DEVICE_POLL_INTERVAL_SECONDS)
                ?: DEFAULT_DEVICE_POLL_INTERVAL_SECONDS
            val expiresInMillis = (expiresInSeconds
                ?.coerceAtLeast(pollIntervalSeconds)
                ?: DEFAULT_DEVICE_EXPIRES_IN_SECONDS) * 1_000L
            val startedAtMillis = TraktPlatformClock.nowEpochMs()

            while (pendingDeviceCode() == deviceCode &&
                TraktPlatformClock.nowEpochMs() - startedAtMillis < expiresInMillis
            ) {
                delay(pollIntervalSeconds * 1_000L)
                val completed = pollDeviceToken(deviceCode)
                if (completed) return@launch
            }

            if (pendingDeviceCode() == deviceCode) {
                clearPendingAuthorization()
                persist()
                publish(
                    isLoading = false,
                    statusMessage = null,
                    errorMessage = localizedString(Res.string.trakt_device_code_expired),
                )
            }
        }
    }

    private suspend fun pollDeviceToken(deviceCode: String): Boolean {
        val body = json.encodeToString(
            TraktDeviceTokenRequest(
                code = deviceCode,
                clientId = TraktConfig.CLIENT_ID,
                clientSecret = TraktConfig.CLIENT_SECRET,
            ),
        )

        val response = runCatching {
            httpPostJsonWithHeaders(
                url = "$BASE_URL/oauth/device/token",
                body = body,
                headers = emptyMap(),
            )
        }.onFailure { error ->
            if (error is CancellationException) throw error
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
            pendingAuthorizationState = null,
            pendingAuthorizationStartedAtMillis = null,
        )
        persist()
        refreshUserSettings()
        publish(
            isLoading = false,
            statusMessage = localizedString(Res.string.trakt_connected_status),
            errorMessage = null,
        )
        return true
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
            statusMessage = localizedString(Res.string.trakt_connected_status),
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

        TraktCredentialSync.deleteRemote()
        authState = TraktAuthState()
        persist()
        publish(
            isLoading = false,
            statusMessage = localizedString(Res.string.trakt_disconnected_status),
            errorMessage = null,
        )
    }

    private suspend fun refreshTokenIfNeeded(force: Boolean): Boolean = refreshMutex.withLock {
        if (!hasRequiredCredentials()) return@withLock false
        val profileId = ProfileRepository.activeProfileId
        val refreshToken = authState.refreshToken?.takeIf { it.isNotBlank() }
            ?: return@withLock false

        if (!force && !isTokenExpiredOrExpiring(authState)) {
            return@withLock true
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
            httpRequestRaw(
                method = "POST",
                url = "$BASE_URL/oauth/token",
                body = body,
                headers = mapOf(
                    "Accept" to "application/json",
                    "Content-Type" to "application/json",
                ),
            )
        }.onFailure { error ->
            if (error is CancellationException) throw error
            log.w { "Trakt token refresh transport failure: ${error.message}" }
        }.getOrNull() ?: return@withLock false

        if (ProfileRepository.activeProfileId != profileId || authState.refreshToken != refreshToken) {
            return@withLock false
        }

        when (traktTokenRefreshResponseAction(response.status)) {
            TraktTokenRefreshResponseAction.INVALIDATE -> {
                log.w { "Trakt rejected the refresh token with HTTP 400; clearing local credentials" }
                invalidateCredentials(profileId)
                return@withLock false
            }

            TraktTokenRefreshResponseAction.TRANSIENT_FAILURE -> {
                log.w { "Trakt token refresh failed with HTTP ${response.status}" }
                return@withLock false
            }

            TraktTokenRefreshResponseAction.ACCEPT -> Unit
        }

        val parsed = runCatching {
            json.decodeFromString<TraktTokenResponse>(response.body)
        }.getOrNull() ?: return@withLock false

        authState = authState.copy(
            accessToken = parsed.accessToken,
            refreshToken = parsed.refreshToken,
            tokenType = parsed.tokenType,
            createdAt = parsed.createdAt,
            expiresIn = parsed.expiresIn,
        )
        persist()
        publish()
        true
    }

    private suspend fun invalidateCredentials(profileId: Int) {
        authState = TraktAuthState()
        persist()
        publish(
            isLoading = false,
            statusMessage = null,
            errorMessage = localizedString(Res.string.trakt_authorization_expired_reconnect),
        )
        TraktCredentialSync.deleteRemote(profileId)
    }

    private fun loadFromDisk() {
        hasLoaded = true
        val payload = TraktAuthStorage.loadPayload().orEmpty().trim()
        authenticationMethod = readAuthenticationMethod(payload)
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
        pendingDeviceCode()?.let { deviceCode ->
            startDeviceTokenPolling(
                deviceCode = deviceCode,
                intervalSeconds = DEFAULT_DEVICE_POLL_INTERVAL_SECONDS,
                expiresInSeconds = DEFAULT_DEVICE_EXPIRES_IN_SECONDS,
            )
        }
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
        val authPayload = runCatching {
            val encodedState = json.encodeToString(authState)
            val stateObject = json.parseToJsonElement(encodedState).jsonObject
            val merged = buildJsonObject {
                stateObject.forEach { (key, value) ->
                    put(key, value)
                }
                put(AUTH_METHOD_PAYLOAD_KEY, JsonPrimitive(authenticationMethod.storageValue))
            }
            merged.toString()
        }.getOrElse {
            log.w { "Failed to persist Trakt auth method: ${it.message}" }
            json.encodeToString(authState)
        }
        TraktAuthStorage.savePayload(authPayload)
    }

    private fun readAuthenticationMethod(payload: String): TraktAuthenticationMethod {
        if (payload.isBlank()) return TraktAuthenticationMethod.BROWSER_REDIRECT
        val value = runCatching {
            json.parseToJsonElement(payload)
                .jsonObject[AUTH_METHOD_PAYLOAD_KEY]
                ?.jsonPrimitive
                ?.content
        }.getOrNull()
        return TraktAuthenticationMethod.fromStorageValue(value)
    }

    private fun pendingDeviceCode(): String? = pendingDeviceAuthorization()?.deviceCode

    private fun pendingDeviceAuthorization(): PendingDeviceAuthorization? {
        val pendingState = authState.pendingAuthorizationState
            ?.takeIf { it.startsWith(DEVICE_CODE_PREFIX) }
            ?.removePrefix(DEVICE_CODE_PREFIX)
            ?.takeIf { it.isNotBlank() }
            ?: return null

        val parts = pendingState.split(DEVICE_CODE_SEPARATOR, limit = 2)
        val deviceCode = parts.firstOrNull()?.takeIf { it.isNotBlank() } ?: return null
        val userCode = parts.getOrNull(1)?.takeIf { it.isNotBlank() }
        return PendingDeviceAuthorization(
            deviceCode = deviceCode,
            userCode = userCode,
        )
    }

    private fun buildPendingDeviceAuthorizationState(deviceCode: String, userCode: String): String =
        buildString {
            append(DEVICE_CODE_PREFIX)
            append(deviceCode)
            if (userCode.isNotBlank()) {
                append(DEVICE_CODE_SEPARATOR)
                append(userCode)
            }
        }

    private fun buildDeviceAuthorizationMessage(response: TraktDeviceCodeResponse): String {
        val verificationUrl = response.verificationUrl.takeIf { it.isNotBlank() } ?: ACTIVATE_URL
        return localizedString(
            Res.string.trakt_device_activation_instruction,
            verificationUrl,
            response.userCode,
        )
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

internal enum class TraktTokenRefreshResponseAction {
    ACCEPT,
    INVALIDATE,
    TRANSIENT_FAILURE,
}

internal fun traktTokenRefreshResponseAction(status: Int): TraktTokenRefreshResponseAction = when {
    status == 400 -> TraktTokenRefreshResponseAction.INVALIDATE
    status in 200..299 -> TraktTokenRefreshResponseAction.ACCEPT
    else -> TraktTokenRefreshResponseAction.TRANSIENT_FAILURE
}

private data class PendingDeviceAuthorization(
    val deviceCode: String,
    val userCode: String?,
)

internal enum class TraktAuthenticationMethod(
    val storageValue: String,
) {
    BROWSER_REDIRECT("browser_redirect"),
    DEVICE_CODE("device_code");

    companion object {
        fun fromStorageValue(value: String?): TraktAuthenticationMethod =
            entries.firstOrNull { it.storageValue == value } ?: BROWSER_REDIRECT
    }
}

@Serializable
private data class TraktDeviceCodeRequest(
    @SerialName("client_id") val clientId: String,
)

@Serializable
private data class TraktDeviceCodeResponse(
    @SerialName("device_code") val deviceCode: String,
    @SerialName("user_code") val userCode: String,
    @SerialName("verification_url") val verificationUrl: String,
    @SerialName("expires_in") val expiresIn: Int? = null,
    @SerialName("interval") val interval: Int? = null,
)

@Serializable
private data class TraktDeviceTokenRequest(
    @SerialName("code") val code: String,
    @SerialName("client_id") val clientId: String,
    @SerialName("client_secret") val clientSecret: String,
)

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

    private fun localizedString(resource: StringResource, vararg formatArgs: Any): String =
        runBlocking { getString(resource, *formatArgs) }
