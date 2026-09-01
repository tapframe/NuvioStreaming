package com.nuvio.app.features.boomio

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.auth.currentDeviceClientMetadata
import com.nuvio.app.core.sync.SyncClientIdentity
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * A linked phone↔TV companion session against the bsc companion hub.
 *
 * The token is the `bs_ses_*` session returned by bsc's device-code flow; it is
 * presented as `Authorization: Bearer <token>` for the companion REST API and as
 * `?session_token=<token>` on the `/ws/phone` connection.
 */
data class BoomioSession(
    val token: String,
    val deviceId: String,
    val userId: String?,
    val displayName: String?,
)

/** Transient state for the device-code self-approve link flow. */
sealed interface BoomioLinkState {
    data object Idle : BoomioLinkState
    data object Starting : BoomioLinkState
    data object Linking : BoomioLinkState

    /** [BoomioLinkFailure.Start] is generic network/server failure. */
    data class Failed(val reason: BoomioLinkFailure) : BoomioLinkState
}

enum class BoomioLinkFailure {
    /** Not signed in to Nuvio, so there is no identity to self-approve with. */
    Unauthenticated,
    /** Device-code request or self-approve failed. */
    Start,
    /** Poll timed out or bsc reported the code expired. */
    Expired,
}

/**
 * Owns the bsc companion session for the phone: device-code self-approve
 * (the phone both requests and approves its own code, using the signed-in
 * Nuvio identity), the poll loop that converts the approved code into a
 * session token, and session teardown.
 *
 * Contract mirrored from `bsc/routes/auth-device.js`:
 *   POST /api/v1/auth/device/request {device_id, platform, name}
 *       → {device_code, user_code, expires_in, interval}
 *   POST /api/v1/auth/pair {code, user_id, username, display_name}
 *       → {status:'ok', session_token}
 *   GET  /api/v1/auth/device/poll?dc=<device_code>
 *       → {status:'pending'} | {status:'ok', session_token, id, display_name}
 *
 * Inert when [BoomioConfig.companionEnabled] is false. No DI — callers read the
 * [session] flow and drive the link flow directly, matching the app's
 * object-singleton pattern.
 */
object BoomioSessionRepository {
    private const val POLL_MAX_ATTEMPTS = 60
    private const val POLL_MAX_CONSECUTIVE_FAILURES = 3

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("BoomioSessionRepository")
    private val json = Json { ignoreUnknownKeys = true }

    private val http = HttpClient {
        install(HttpTimeout) {
            requestTimeoutMillis = 15_000
            connectTimeoutMillis = 10_000
        }
        expectSuccess = false
    }

    private val _session = MutableStateFlow<BoomioSession?>(null)
    /** Non-null once linked. Cleared by [unlink] or storage reset. */
    val session: StateFlow<BoomioSession?> = _session.asStateFlow()

    private val _linkState = MutableStateFlow<BoomioLinkState>(BoomioLinkState.Idle)
    val linkState: StateFlow<BoomioLinkState> = _linkState.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var linkJob: Job? = null

    val companionEnabled: Boolean
        get() = BoomioConfig.companionEnabled()

    /** Loads a persisted token into [session]; call once at app startup. */
    fun initialize() {
        if (_session.value != null) return
        val token = BoomioSessionStorage.loadSessionToken()?.takeIf { it.isNotBlank() }
        _session.value = token?.let {
            BoomioSession(
                token = it,
                deviceId = SyncClientIdentity.currentClientId(),
                userId = null,
                displayName = null,
            )
        }
    }

    fun bearerToken(): String? = _session.value?.token

    /**
     * Starts the device-code self-approve flow. Requires a signed-in Nuvio
     * identity (anonymous users have a Supabase userId but the plan gates the
     * companion on a real account). Safe to call repeatedly — no-op while the
     * flow is already running.
     */
    fun startLink() {
        if (!companionEnabled) {
            _error.value = "Boomio companion is not configured on this build."
            return
        }
        if (_linkState.value is BoomioLinkState.Starting ||
            _linkState.value is BoomioLinkState.Linking
        ) {
            return
        }

        linkJob?.cancel()
        linkJob = scope.launch {
            _error.value = null
            _linkState.value = BoomioLinkState.Starting
            try {
                val authUser = AuthRepository.state.value as? AuthState.Authenticated
                if (authUser == null) {
                    _linkState.value = BoomioLinkState.Failed(BoomioLinkFailure.Unauthenticated)
                    return@launch
                }
                val request = requestDeviceCode()
                selfApprove(request.user_code, authUser)
                _linkState.value = BoomioLinkState.Linking
                pollAndComplete(request, authUser)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w(error) { "Boomio link failed" }
                _linkState.value = BoomioLinkState.Failed(BoomioLinkFailure.Start)
            }
        }
    }

    /** Cancels an in-flight link flow. */
    fun cancelLink() {
        linkJob?.cancel()
        linkJob = null
        _linkState.value = BoomioLinkState.Idle
    }

    /**
     * Tears down the pairing: best-effort POST /api/companion/unpair (so the TV
     * learns the phone disconnected) then clears the local session.
     */
    fun unlink() {
        scope.launch {
            try {
                bearerToken()?.let { token ->
                    http.post("${BoomioConfig.companionRestBaseUrl}/api/companion/unpair") {
                        header(HttpHeaders.Authorization, "Bearer $token")
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w(error) { "Boomio unpair failed (non-fatal)" }
            }
            BoomioSessionStorage.clearSessionToken()
            BoomioSessionStorage.clearPairedDeviceId()
            _session.value = null
        }
    }

    private suspend fun requestDeviceCode(): DeviceRequestResponse {
        val metadata = currentDeviceClientMetadata()
        val response = http.post("${BoomioConfig.companionRestBaseUrl}/api/v1/auth/device/request") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    DeviceRequestPayload(
                        device_id = SyncClientIdentity.currentClientId(),
                        platform = metadata.platform,
                        name = metadata.deviceName,
                    ),
                ),
            )
        }
        val body = response.bodyAsText()
        if (response.status.isSuccess()) {
            val parsed = runCatching { json.decodeFromString<DeviceRequestResponse>(body) }.getOrNull()
            if (parsed != null && parsed.device_code.isNotBlank() && parsed.user_code.isNotBlank()) {
                return parsed
            }
        }
        throw BoomioSessionException("device request failed: HTTP ${response.status.value}")
    }

    private suspend fun selfApprove(userCode: String, authUser: AuthState.Authenticated) {
        val metadata = currentDeviceClientMetadata()
        val response = http.post("${BoomioConfig.companionRestBaseUrl}/api/v1/auth/pair") {
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    PairPayload(
                        code = userCode,
                        user_id = authUser.userId,
                        username = authUser.email?.substringBefore("@"),
                        display_name = metadata.deviceName,
                    ),
                ),
            )
        }
        if (!response.status.isSuccess()) {
            throw BoomioSessionException("self-approve failed: HTTP ${response.status.value}")
        }
    }

    private suspend fun pollAndComplete(
        request: DeviceRequestResponse,
        authUser: AuthState.Authenticated,
    ) {
        var attempts = 0
        var consecutiveFailures = 0
        val intervalMillis = request.interval.coerceIn(2, 10) * 1_000L

        while (currentCoroutineContext().isActive && attempts < POLL_MAX_ATTEMPTS) {
            delay(intervalMillis)
            attempts += 1

            val parsed = try {
                val response = http.get("${BoomioConfig.companionRestBaseUrl}/api/v1/auth/device/poll") {
                    parameter("dc", request.device_code)
                }
                if (!response.status.isSuccess()) continue
                json.decodeFromString<PollResponse>(response.bodyAsText())
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                consecutiveFailures += 1
                if (consecutiveFailures >= POLL_MAX_CONSECUTIVE_FAILURES) throw error
                continue
            }
            consecutiveFailures = 0

            when (parsed.status.lowercase()) {
                "ok" -> {
                    val token = parsed.session_token ?: parsed.token
                    if (token.isNullOrBlank()) {
                        throw BoomioSessionException("poll approved but no token")
                    }
                    BoomioSessionStorage.saveSessionToken(token)
                    _session.value = BoomioSession(
                        token = token,
                        deviceId = SyncClientIdentity.currentClientId(),
                        userId = parsed.id ?: authUser.userId,
                        displayName = parsed.display_name ?: parsed.username,
                    )
                    _linkState.value = BoomioLinkState.Idle
                    return
                }
                "pending" -> Unit
                else -> {
                    // 'expired' (or anything unexpected) — the code is no longer usable.
                    _linkState.value = BoomioLinkState.Failed(BoomioLinkFailure.Expired)
                    return
                }
            }
        }

        _linkState.value = BoomioLinkState.Failed(BoomioLinkFailure.Expired)
    }
}

@Serializable
private data class DeviceRequestPayload(
    @SerialName("device_id") val device_id: String,
    @SerialName("platform") val platform: String,
    @SerialName("name") val name: String,
)

@Serializable
private data class PairPayload(
    @SerialName("code") val code: String,
    @SerialName("user_id") val user_id: String,
    @SerialName("username") val username: String? = null,
    @SerialName("display_name") val display_name: String? = null,
)

@Serializable
private data class DeviceRequestResponse(
    @SerialName("device_code") val device_code: String = "",
    @SerialName("user_code") val user_code: String = "",
    @SerialName("expires_in") val expires_in: Int = 300,
    @SerialName("interval") val interval: Int = 5,
)

@Serializable
private data class PollResponse(
    @SerialName("status") val status: String = "",
    @SerialName("token") val token: String? = null,
    @SerialName("session_token") val session_token: String? = null,
    @SerialName("id") val id: String? = null,
    @SerialName("username") val username: String? = null,
    @SerialName("display_name") val display_name: String? = null,
)

private class BoomioSessionException(message: String) : Exception(message)
