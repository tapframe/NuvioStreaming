package com.nuvio.app.features.boomio

import co.touchlab.kermit.Logger
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** A TV (or phone) participating in a watch party. */
data class WatchPartyMember(
    val deviceId: String,
    val role: String,
    val status: String,
    val lanIp: String?,
)

/** Per-target delivery result from `POST /api/watch-party`. */
data class WatchPartyDelivered(
    val deviceId: String,
    val delivered: Boolean,
    val reason: String?,
)

/** Successful result of starting a watch party. */
data class WatchPartyStart(
    val status: String,
    val partyId: String,
    val members: List<WatchPartyMember>,
    val delivered: List<WatchPartyDelivered>,
    val streamUrl: String?,
)

/** A member TV's aggregated playback position from `GET …/positions`. */
data class WatchPartyPosition(
    val deviceId: String,
    val positionMs: Long,
    val durationMs: Long,
    val isPlaying: Boolean,
    val title: String?,
)

/** Aggregated party playback positions. */
data class WatchPartyPositions(
    val partyId: String,
    val isPlaying: Boolean,
    val positions: List<WatchPartyPosition>,
)

/** Thrown when a watch-party REST call fails; message is user-presentable. */
class WatchPartyException(message: String) : Exception(message)

/**
 * The phone's watch-party client against the bsc companion hub.
 *
 * Contract mirrored from `bsc/routes/watch-party.js` (shipped):
 *   POST   /api/watch-party                       {imdbId, season?, episode?, targetDeviceIds[], initiatorPhoneId?, resumeFromMs?, title?}
 *          → 201 {status, partyId ('wp:<hex>'), members[], delivered[], streamUrl}
 *   POST   /api/watch-party/:partyId/command      {type: pause|resume|seek|title_change|invite|kick|end, actorDeviceId?, positionMs?, targetDeviceId?}
 *          → pause/resume {status, isPlaying}; seek {status, positionMs}; end {status}
 *   GET    /api/watch-party/:partyId/positions    → {partyId, isPlaying, positions:[{deviceId, position|null}]}
 *   DELETE /api/watch-party/:partyId              (host) → {status:'ok'}
 *
 * The phone is the party host: `initiatorPhoneId` / `actorDeviceId` are sent
 * explicitly (the `bs_ses_*` Bearer token also resolves to `req.session.device_id`,
 * so these are belt-and-suspenders). Inert when there is no [BoomioSession].
 *
 * No DI — the app's object-singleton pattern, mirroring [CompanionBridge] and
 * [BoomioSessionRepository]. Suspend functions throw [WatchPartyException] with a
 * presentable message; screens drive them from a coroutine scope.
 */
object WatchPartyRepository {
    private val log = Logger.withTag("WatchPartyRepository")
    private val json = Json { ignoreUnknownKeys = true }

    private val http = HttpClient {
        install(HttpTimeout) {
            requestTimeoutMillis = 15_000
            connectTimeoutMillis = 10_000
        }
        expectSuccess = false
    }

    private fun requireSession(): BoomioSession {
        val session = BoomioSessionRepository.session.value
            ?: throw WatchPartyException("Link the companion hub first.")
        return session
    }

    /** Attaches the bearer token to a bsc REST request. */
    private fun io.ktor.client.request.HttpRequestBuilder.authorize(token: String) {
        header(HttpHeaders.Authorization, "Bearer $token")
    }

    /**
     * Creates a watch party: resolves the best stream via BSF, sends the play
     * command to every target TV, and returns the party id + delivery report.
     */
    suspend fun startWatchParty(
        imdbId: String,
        season: Int? = null,
        episode: Int? = null,
        targetDeviceIds: List<String>,
        initiatorPhoneId: String? = null,
        resumeFromMs: Long? = null,
        title: String? = null,
    ): WatchPartyStart {
        val session = requireSession()
        if (targetDeviceIds.isEmpty()) {
            throw WatchPartyException("Pick at least one TV.")
        }
        val response = http.post("${BoomioConfig.companionRestBaseUrl}/api/watch-party") {
            authorize(session.token)
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    WatchPartyStartRequest(
                        imdbId = imdbId,
                        season = season,
                        episode = episode,
                        targetDeviceIds = targetDeviceIds,
                        initiatorPhoneId = initiatorPhoneId ?: session.deviceId,
                        resumeFromMs = resumeFromMs,
                        title = title,
                    ),
                ),
            )
        }
        val body = response.bodyAsText()
        if (response.status.isSuccess()) {
            val parsed = runCatching { json.decodeFromString<WatchPartyStartDto>(body) }.getOrNull()
            if (parsed != null && parsed.partyId.isNotBlank()) {
                return WatchPartyStart(
                    status = parsed.status,
                    partyId = parsed.partyId,
                    members = parsed.members.map { it.toModel() },
                    delivered = parsed.delivered.map { it.toModel() },
                    streamUrl = parsed.streamUrl,
                )
            }
        }
        throw WatchPartyException(describeError("start the party", body, response.status.value))
    }

    /** Sends a host/member command to an existing party. */
    suspend fun sendPartyCommand(
        partyId: String,
        type: String,
        positionMs: Long? = null,
        targetDeviceId: String? = null,
    ) {
        val session = requireSession()
        val response = http.post("${BoomioConfig.companionRestBaseUrl}/api/watch-party/$partyId/command") {
            authorize(session.token)
            contentType(ContentType.Application.Json)
            setBody(
                json.encodeToString(
                    WatchPartyCommandRequest(
                        type = type,
                        actorDeviceId = session.deviceId,
                        positionMs = positionMs,
                        targetDeviceId = targetDeviceId,
                    ),
                ),
            )
        }
        if (!response.status.isSuccess()) {
            throw WatchPartyException(describeError("send $type", response.bodyAsText(), response.status.value))
        }
    }

    /** Pauses every member TV (host or any controller). */
    suspend fun pauseParty(partyId: String) = sendPartyCommand(partyId, "pause")

    /** Resumes every member TV (host or any controller). */
    suspend fun resumeParty(partyId: String) = sendPartyCommand(partyId, "resume")

    /** Seeks every member TV (host only). */
    suspend fun seekParty(partyId: String, positionMs: Long) =
        sendPartyCommand(partyId, "seek", positionMs = positionMs)

    /** Ends the party for everyone (host only). */
    suspend fun endParty(partyId: String) = sendPartyCommand(partyId, "end")

    /** Fetches each member TV's playback position (missing/null positions included). */
    suspend fun getPartyPositions(partyId: String): WatchPartyPositions {
        val session = requireSession()
        val response = http.get("${BoomioConfig.companionRestBaseUrl}/api/watch-party/$partyId/positions") {
            authorize(session.token)
        }
        val body = response.bodyAsText()
        if (response.status.isSuccess()) {
            val parsed = runCatching { json.decodeFromString<WatchPartyPositionsDto>(body) }.getOrNull()
            if (parsed != null) {
                return WatchPartyPositions(
                    partyId = parsed.partyId,
                    isPlaying = parsed.isPlaying,
                    positions = parsed.positions.map { dto ->
                        val pos = dto.position
                        WatchPartyPosition(
                            deviceId = dto.deviceId,
                            positionMs = pos?.positionMs ?: 0L,
                            durationMs = pos?.durationMs ?: 0L,
                            isPlaying = pos?.isPlaying ?: false,
                            title = pos?.title,
                        )
                    },
                )
            }
        }
        throw WatchPartyException(describeError("load party positions", body, response.status.value))
    }

    private fun describeError(action: String, body: String, status: Int): String {
        // Prefer the backend's {error} / {message} payload when present.
        val error = runCatching { json.parseToJsonElement(body).jsonObject["error"]?.jsonPrimitive?.content }
            .getOrNull()
        val message = runCatching { json.parseToJsonElement(body).jsonObject["message"]?.jsonPrimitive?.content }
            .getOrNull()
        val detail = message ?: error
        return if (detail.isNullOrBlank()) {
            "Could not $action (HTTP $status)."
        } else {
            "Could not $action: $detail"
        }
    }
}

// ── Wire DTOs ────────────────────────────────────────────────────────────────

@Serializable
private data class WatchPartyStartRequest(
    @SerialName("imdbId") val imdbId: String,
    @SerialName("season") val season: Int? = null,
    @SerialName("episode") val episode: Int? = null,
    @SerialName("targetDeviceIds") val targetDeviceIds: List<String>,
    @SerialName("initiatorPhoneId") val initiatorPhoneId: String,
    @SerialName("resumeFromMs") val resumeFromMs: Long? = null,
    @SerialName("title") val title: String? = null,
)

@Serializable
private data class WatchPartyCommandRequest(
    @SerialName("type") val type: String,
    @SerialName("actorDeviceId") val actorDeviceId: String? = null,
    @SerialName("positionMs") val positionMs: Long? = null,
    @SerialName("targetDeviceId") val targetDeviceId: String? = null,
)

@Serializable
private data class WatchPartyMemberDto(
    @SerialName("deviceId") val deviceId: String = "",
    @SerialName("role") val role: String = "participant",
    @SerialName("status") val status: String = "offline",
    @SerialName("lanIp") val lanIp: String? = null,
)

@Serializable
private data class WatchPartyDeliveredDto(
    @SerialName("deviceId") val deviceId: String = "",
    @SerialName("delivered") val delivered: Boolean = false,
    @SerialName("reason") val reason: String? = null,
)

@Serializable
private data class WatchPartyStartDto(
    @SerialName("status") val status: String = "",
    @SerialName("partyId") val partyId: String = "",
    @SerialName("members") val members: List<WatchPartyMemberDto> = emptyList(),
    @SerialName("delivered") val delivered: List<WatchPartyDeliveredDto> = emptyList(),
    @SerialName("streamUrl") val streamUrl: String? = null,
)

@Serializable
private data class WatchPartyMemberPositionDto(
    @SerialName("positionMs") val positionMs: Long = 0,
    @SerialName("durationMs") val durationMs: Long = 0,
    @SerialName("isPlaying") val isPlaying: Boolean = false,
    @SerialName("title") val title: String? = null,
)

@Serializable
private data class WatchPartyPositionDto(
    @SerialName("deviceId") val deviceId: String = "",
    @SerialName("position") val position: WatchPartyMemberPositionDto? = null,
)

@Serializable
private data class WatchPartyPositionsDto(
    @SerialName("partyId") val partyId: String = "",
    @SerialName("isPlaying") val isPlaying: Boolean = false,
    @SerialName("positions") val positions: List<WatchPartyPositionDto> = emptyList(),
)

private fun WatchPartyMemberDto.toModel() = WatchPartyMember(
    deviceId = deviceId,
    role = role,
    status = status,
    lanIp = lanIp,
)

private fun WatchPartyDeliveredDto.toModel() = WatchPartyDelivered(
    deviceId = deviceId,
    delivered = delivered,
    reason = reason,
)
