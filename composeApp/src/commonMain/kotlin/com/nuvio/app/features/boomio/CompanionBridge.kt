package com.nuvio.app.features.boomio

import co.touchlab.kermit.Logger
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
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
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.math.pow
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.TimeSource

/**
 * A TV the phone can control, from bsc's `GET /api/companion/devices`.
 */
data class CompanionDevice(
    val deviceId: String,
    val name: String,
    val platform: String,
    val online: Boolean,
    val nowPlaying: String?,
    val imdbId: String?,
    val positionMs: Long,
    val durationMs: Long,
    val isPlaying: Boolean,
)

/** Inbound TV→phone push events on the companion websocket. */
sealed interface CompanionEvent {
    /** The paired TV (re)connected and restored its state. */
    data class StateRestored(val tvDeviceId: String, val name: String) : CompanionEvent

    /** A live playback / media / audio-fork push from the paired TV. */
    data class TvPush(val tvDeviceId: String?, val type: String) : CompanionEvent

    /** bsc tore down the phone→TV handoff because the heartbeat expired. */
    data object Timeout : CompanionEvent

    /** A command was sent but no TV is paired. */
    data class NotPaired(val method: String?) : CompanionEvent

    /** A command exceeded bsc's per-second limit. */
    data class RateLimited(val method: String?) : CompanionEvent

    /** A relay error frame. */
    data class Error(val message: String?) : CompanionEvent
}

/**
 * Android [KeyEvent] key codes the TV's companion manager forwards into its UI
 * on `stealth_keyevent` — same values a physical remote delivers (see
 * BoomioCompanionManager.dispatchCompanionKey on the nuvio-tv side).
 */
object CompanionKeyCodes {
    const val BACK = 4
    const val DPAD_UP = 19
    const val DPAD_DOWN = 20
    const val DPAD_LEFT = 21
    const val DPAD_RIGHT = 22
    const val DPAD_CENTER = 23
}

/**
 * The phone's live link to the bsc companion hub: owns the `/ws/phone`
 * connection (reconnect + heartbeat), the companion REST calls, and the
 * device list / pairing state the CompanionScreen renders.
 *
 * Wire contract mirrored from `bsc/services/phone-relay.js` and
 * `bsc/routes/companion-api.js`:
 *   connect  {base}/ws/phone?session_token=…&device_id=…
 *   outbound stealth_playpause | stealth_volume {percent} | scrub_* {positionMs}
 *            | stealth_keyevent {keyCode} | stealth_search | keyboard_input {text}
 *            | keyboard_submit | companion:heartbeat (≤1/s, TTL 30s — sent every 10s)
 *   inbound  companion:state_restored | companion:now_playing_changed |
 *            media_changed | audio_fork | companion:timeout | error not_paired
 *   REST     GET  /api/companion/devices   (Bearer)
 *            POST /api/companion/pair      {deviceId}
 *            POST /api/companion/unpair
 *
 * Inert when there is no [BoomioSession]. Screen-driven: call [ensureStarted]
 * once from the CompanionScreen; the bridge follows the session flow.
 *
 * The TV's companion manager handles `stealth_playpause`, `scrub_*`,
 * `stealth_volume`, `stealth_keyevent`, `stealth_search`, `keyboard_input`
 * and `keyboard_submit` (see BoomioCompanionManager on the nuvio-tv side).
 */
object CompanionBridge {
    /** Minimum gap between `scrub_update` frames — bsc caps at 10/s. */
    private val SCRUB_UPDATE_MIN_INTERVAL: Duration = 120.milliseconds

    /** Minimum gap between `keyboard_input` frames — bsc caps at 20/s. */
    private val SEARCH_TEXT_MIN_INTERVAL: Duration = 60.milliseconds

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("CompanionBridge")
    private val json = Json { ignoreUnknownKeys = true }

    private val http = HttpClient {
        install(HttpTimeout) {
            requestTimeoutMillis = 15_000
            connectTimeoutMillis = 10_000
        }
        expectSuccess = false
    }

    // Long-lived socket: only a connect timeout — a request/socket timeout would
    // kill an idle connection (inbound can be quiet while the 10s heartbeat runs).
    // The WebSockets plugin is required for webSocket() — without it every
    // connect throws and the companion link never opens.
    private val wsClient = HttpClient {
        install(HttpTimeout) { connectTimeoutMillis = 10_000 }
        install(WebSockets)
    }

    private val _connected = MutableStateFlow(false)
    /** True while the `/ws/phone` socket is open. */
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    private val _devices = MutableStateFlow<List<CompanionDevice>>(emptyList())
    /** Discovered TVs from `GET /api/companion/devices`. */
    val devices: StateFlow<List<CompanionDevice>> = _devices.asStateFlow()

    private val _pairedDeviceId = MutableStateFlow<String?>(null)
    /** The TV this phone is currently paired with, or null to pick one. */
    val pairedDeviceId: StateFlow<String?> = _pairedDeviceId.asStateFlow()

    private val _events = MutableSharedFlow<CompanionEvent>(extraBufferCapacity = 16)
    /** One-shot inbound pushes (toast/snackbar surface). */
    val events: SharedFlow<CompanionEvent> = _events.asSharedFlow()

    private val _deviceListError = MutableStateFlow<String?>(null)
    /** Last `devices` load / pair error, or null. */
    val deviceListError: StateFlow<String?> = _deviceListError.asStateFlow()

    private var sessionObserverJob: Job? = null
    private var connectJob: Job? = null
    private var reconnectJob: Job? = null
    private var heartbeatJob: Job? = null
    private var reconnectAttempts = 0

    @Volatile private var wsSession: DefaultClientWebSocketSession? = null
    @Volatile private var lastScrubUpdate: TimeSource.Monotonic.ValueTimeMark? = null
    @Volatile private var lastSearchTextSendAt: TimeSource.Monotonic.ValueTimeMark? = null
    @Volatile private var pendingSearchText: String? = null

    /**
     * Binds the bridge to [BoomioSessionRepository.session]. Idempotent — call
     * once from the CompanionScreen. Connects when a session appears and tears
     * the socket down when it is unlinked.
     */
    fun ensureStarted() {
        if (sessionObserverJob?.isActive == true) return
        sessionObserverJob = scope.launch {
            BoomioSessionRepository.session.collect { session ->
                if (session == null) {
                    stopConnection()
                } else {
                    if (_pairedDeviceId.value == null) {
                        _pairedDeviceId.value = BoomioSessionStorage.loadPairedDeviceId()
                    }
                    if (wsSession == null && connectJob?.isActive != true && reconnectJob?.isActive != true) {
                        connect(session)
                    }
                }
            }
        }
    }

    /** Refetches [devices] from the hub. Safe to call while connected. */
    fun refreshDevices() {
        val token = BoomioSessionRepository.bearerToken() ?: return
        scope.launch {
            try {
                val response = http.get("${BoomioConfig.companionRestBaseUrl}/api/companion/devices") {
                    header(HttpHeaders.Authorization, "Bearer $token")
                }
                if (response.status.isSuccess()) {
                    val list = json.decodeFromString<List<CompanionDeviceDto>>(response.bodyAsText())
                    _devices.value = list.map { it.toModel() }
                    _deviceListError.value = null
                } else {
                    _deviceListError.value = "Failed to load TVs (HTTP ${response.status.value})"
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w(error) { "refreshDevices failed" }
                _deviceListError.value = "Could not reach the companion hub."
            }
        }
    }

    /** Pairs this phone with the given TV (persists server-side for 30 days). */
    fun pairTo(deviceId: String) {
        val token = BoomioSessionRepository.bearerToken() ?: return
        scope.launch {
            try {
                val response = http.post("${BoomioConfig.companionRestBaseUrl}/api/companion/pair") {
                    header(HttpHeaders.Authorization, "Bearer $token")
                    contentType(ContentType.Application.Json)
                    setBody(json.encodeToString(PairRequest(deviceId = deviceId)))
                }
                if (response.status.isSuccess()) {
                    _pairedDeviceId.value = deviceId
                    BoomioSessionStorage.savePairedDeviceId(deviceId)
                    _deviceListError.value = null
                } else {
                    _deviceListError.value = "TV is offline or unreachable (HTTP ${response.status.value})"
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w(error) { "pairTo failed" }
                _deviceListError.value = "Could not reach the companion hub."
            }
        }
    }

    /** Unpairs from the current TV (keeps the companion session). */
    fun unpair() {
        val token = BoomioSessionRepository.bearerToken() ?: return
        scope.launch {
            try {
                http.post("${BoomioConfig.companionRestBaseUrl}/api/companion/unpair") {
                    header(HttpHeaders.Authorization, "Bearer $token")
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w(error) { "unpair failed (non-fatal)" }
            }
            _pairedDeviceId.value = null
            BoomioSessionStorage.clearPairedDeviceId()
        }
    }

    // ── Remote commands ───────────────────────────────────────────────────────

    /** Play / pause the paired TV. */
    fun togglePlayPause() = sendFrame { put("type", "stealth_playpause") }

    /** Absolute seek to [positionMs] on the paired TV. */
    fun seekTo(positionMs: Long) =
        sendFrame { put("type", "scrub_commit"); put("positionMs", positionMs) }

    /** Set the paired TV's volume, 0–100. */
    fun setVolume(percent: Int) =
        sendFrame { put("type", "stealth_volume"); put("percent", percent.coerceIn(0, 100)) }

    /** Coalesced live scrub while dragging — kept under bsc's 10/s limit. */
    fun sendScrubUpdate(positionMs: Long) {
        val now = TimeSource.Monotonic.markNow()
        val last = lastScrubUpdate
        if (last == null || now - last >= SCRUB_UPDATE_MIN_INTERVAL) {
            lastScrubUpdate = now
            sendFrame { put("type", "scrub_update"); put("positionMs", positionMs) }
        }
    }

    /** Send a D-pad / OK / back key press to the paired TV's focused screen. */
    fun pressKey(keyCode: Int) {
        if (keyCode <= 0) return
        sendFrame { put("type", "stealth_keyevent"); put("keyCode", keyCode) }
    }

    /**
     * Open the TV's search screen and focus its field, ready for text/voice
     * from this remote — for TVs whose own search bar has no keyboard or mic.
     */
    fun openSearch() =
        sendFrame { put("type", "stealth_search") }

    /**
     * Send the TV search field's full current [text] as a replacement on
     * `keyboard_input {text}`. Whole-text semantics keep backspace and mid-edit
     * unambiguous — the TV replaces its whole query, so a dropped frame only
     * means the next keystroke (or [submitSearch]) carries the newest text.
     * Frames are coalesced under bsc's 20/s cap.
     */
    fun sendSearchText(text: String) {
        val now = TimeSource.Monotonic.markNow()
        val last = lastSearchTextSendAt
        if (last == null || now - last >= SEARCH_TEXT_MIN_INTERVAL) {
            lastSearchTextSendAt = now
            pendingSearchText = null
            sendFrame { put("type", "keyboard_input"); put("text", text) }
        } else {
            // Inside the rate window — remember the newest text so nothing is
            // lost; it goes out on the next keystroke or the submit flush.
            pendingSearchText = text
        }
    }

    /** Ask the TV to run its search (Enter). Flushes any pending text first. */
    fun submitSearch() {
        pendingSearchText?.let { pending ->
            pendingSearchText = null
            lastSearchTextSendAt = TimeSource.Monotonic.markNow()
            sendFrame { put("type", "keyboard_input"); put("text", pending) }
        }
        sendFrame { put("type", "keyboard_submit") }
    }

    private inline fun sendFrame(build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) {
        val session = wsSession ?: return
        val payload = buildJsonObject(build)
        session.outgoing.trySend(Frame.Text(payload.toString()))
    }

    // ── Connection lifecycle ──────────────────────────────────────────────────

    private fun connect(session: BoomioSession) {
        connectJob?.cancel()
        connectJob = scope.launch {
            _connected.value = false
            try {
                wsClient.webSocket(
                    urlString = BoomioConfig.companionPhoneWsUrl,
                    request = {
                        parameter("session_token", session.token)
                        parameter("device_id", session.deviceId)
                    },
                ) {
                    wsSession = this
                    reconnectAttempts = 0
                    _connected.value = true
                    startHeartbeat()
                    try {
                        for (frame in incoming) {
                            when (frame) {
                                is Frame.Text -> handleInbound(frame.readText())
                                is Frame.Close -> break
                                else -> Unit
                            }
                        }
                    } finally {
                        wsSession = null
                        heartbeatJob?.cancel()
                        heartbeatJob = null
                        _connected.value = false
                    }
                }
                scheduleReconnect()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w(error) { "Companion WS connect failed" }
                _connected.value = false
                scheduleReconnect()
            }
        }
    }

    private fun scheduleReconnect() {
        if (BoomioSessionRepository.session.value == null) return
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            val backoffMs = (1_000L * 2.0.pow(reconnectAttempts.coerceAtMost(5))).toLong()
                .coerceAtMost(30_000L)
            delay(backoffMs)
            if (!isActive) return@launch
            reconnectAttempts++
            val session = BoomioSessionRepository.session.value ?: return@launch
            connect(session)
        }
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(10_000L)
                sendFrame { put("type", "companion:heartbeat") }
            }
        }
    }

    private suspend fun stopConnection() {
        reconnectJob?.cancel()
        reconnectJob = null
        connectJob?.cancel()
        connectJob = null
        heartbeatJob?.cancel()
        heartbeatJob = null
        wsSession?.close()
        wsSession = null
        _connected.value = false
        _devices.value = emptyList()
        _pairedDeviceId.value = null
        _deviceListError.value = null
    }

    private fun handleInbound(text: String) {
        val msg = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
        val type = msg["type"]?.jsonPrimitive?.contentOrNull ?: return
        when (type) {
            "companion:state_restored" -> {
                val tvDeviceId = msg["tvDeviceId"]?.jsonPrimitive?.contentOrNull
                if (tvDeviceId != null) {
                    _pairedDeviceId.value = tvDeviceId
                    BoomioSessionStorage.savePairedDeviceId(tvDeviceId)
                    _events.tryEmit(
                        CompanionEvent.StateRestored(
                            tvDeviceId = tvDeviceId,
                            name = msg["name"]?.jsonPrimitive?.contentOrNull ?: "TV",
                        ),
                    )
                }
            }
            "companion:now_playing_changed", "media_changed", "audio_fork" -> {
                _events.tryEmit(
                    CompanionEvent.TvPush(
                        tvDeviceId = msg["tvDeviceId"]?.jsonPrimitive?.contentOrNull,
                        type = type,
                    ),
                )
                // Best-effort: keep the now-playing line current.
                refreshDevices()
            }
            "companion:timeout" -> _events.tryEmit(CompanionEvent.Timeout)
            "error" -> {
                if (msg["code"]?.jsonPrimitive?.contentOrNull == "not_paired") {
                    _events.tryEmit(CompanionEvent.NotPaired(null))
                } else {
                    _events.tryEmit(CompanionEvent.Error(msg["code"]?.jsonPrimitive?.contentOrNull))
                }
            }
            "companion:rate_limited" ->
                _events.tryEmit(CompanionEvent.RateLimited(msg["method"]?.jsonPrimitive?.contentOrNull))
            else -> Unit
        }
    }
}

@Serializable
private data class CompanionDeviceDto(
    @SerialName("deviceId") val deviceId: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("platform") val platform: String = "androidtv",
    @SerialName("online") val online: Boolean = true,
    @SerialName("nowPlaying") val nowPlaying: String? = null,
    @SerialName("imdbId") val imdbId: String? = null,
    @SerialName("positionMs") val positionMs: Long = 0,
    @SerialName("durationMs") val durationMs: Long = 0,
    @SerialName("isPlaying") val isPlaying: Boolean = false,
)

@Serializable
private data class PairRequest(
    @SerialName("deviceId") val deviceId: String,
)

private fun CompanionDeviceDto.toModel() = CompanionDevice(
    deviceId = deviceId,
    name = name,
    platform = platform,
    online = online,
    nowPlaying = nowPlaying,
    imdbId = imdbId,
    positionMs = positionMs,
    durationMs = durationMs,
    isPlaying = isPlaying,
)
