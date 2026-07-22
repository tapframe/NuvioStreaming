package com.nuvio.app.features.simkl

import com.nuvio.app.features.addons.RawHttpResponse
import com.nuvio.app.features.addons.httpRequestRaw
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlin.math.max
import kotlin.random.Random

private const val SIMKL_MAX_RESPONSE_BODY_BYTES = 8 * 1024 * 1024

internal enum class SimklHttpMethod {
    GET,
    POST,
    DELETE,
}

internal enum class SimklRetryPolicy {
    TRANSIENT_FAILURES,
    NEVER,
}

internal data class SimklApiRequest(
    val method: SimklHttpMethod,
    val path: String,
    val query: Map<String, String> = emptyMap(),
    val body: String = "",
    val requiresAuthentication: Boolean = true,
    val retryPolicy: SimklRetryPolicy = SimklRetryPolicy.TRANSIENT_FAILURES,
    val scrobbleStopConflictIsSuccess: Boolean = false,
)

internal data class SimklApiResponse(
    val status: Int,
    val body: String,
    val headers: Map<String, String>,
    val isSoftSuccess: Boolean = false,
)

internal class SimklApiException(
    val status: Int?,
    val errorCode: String?,
    override val message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

internal fun interface SimklHttpEngine {
    suspend fun execute(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String,
    ): RawHttpResponse
}

internal class SimklApiClient(
    private val engine: SimklHttpEngine,
    private val accessToken: () -> String?,
    private val onUnauthorized: () -> Unit,
    private val nowEpochMs: () -> Long = SimklPlatformClock::nowEpochMs,
    private val sleep: suspend (Long) -> Unit = { delayMs -> delay(delayMs) },
    private val retryJitterMs: () -> Long = { Random.nextLong(RETRY_JITTER_BOUND_MS + 1L) },
) {
    private val requestMutex = Mutex()
    private val json = Json { ignoreUnknownKeys = true }
    private var nextGetAtEpochMs = 0L
    private var nextPostAtEpochMs = 0L

    suspend fun execute(request: SimklApiRequest): SimklApiResponse = requestMutex.withLock {
        val token = if (request.requiresAuthentication) {
            accessToken()?.takeIf(String::isNotBlank)
                ?: throw SimklApiException(
                    status = 401,
                    errorCode = "authentication_required",
                    message = "Simkl authentication is required",
                )
        } else {
            null
        }

        var lastTransportFailure: Throwable? = null
        val maxRetries = when (request.retryPolicy) {
            SimklRetryPolicy.TRANSIENT_FAILURES -> MAX_RETRIES
            SimklRetryPolicy.NEVER -> 0
        }
        for (attempt in 0..maxRetries) {
            awaitRateLimit(request.method)
            val response = try {
                engine.execute(
                    method = request.method.name,
                    url = buildSimklApiUrl(request.path, request.query),
                    headers = simklRequestHeaders(
                        accessToken = token,
                        contentTypeJson = request.body.isNotEmpty(),
                    ),
                    body = request.body,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                lastTransportFailure = error
                if (attempt == maxRetries) {
                    throw SimklApiException(
                        status = null,
                        errorCode = "transport_failure",
                        message = "Simkl request failed",
                        cause = error,
                    )
                }
                sleep(retryDelayMs(attempt, retryAfterHeader = null, retryJitterMs()))
                continue
            }

            when (classifySimklResponse(response.status, request.scrobbleStopConflictIsSuccess)) {
                SimklResponseAction.SUCCESS -> return@withLock response.toApiResponse()
                SimklResponseAction.SOFT_SUCCESS -> {
                    return@withLock response.toApiResponse(isSoftSuccess = true)
                }
                SimklResponseAction.REAUTHENTICATE -> {
                    if (request.requiresAuthentication) onUnauthorized()
                    throw response.toApiException(json)
                }
                SimklResponseAction.FAIL -> throw response.toApiException(json)
                SimklResponseAction.RETRY -> {
                    if (attempt == maxRetries) throw response.toApiException(json)
                    sleep(
                        retryDelayMs(
                            attempt = attempt,
                            retryAfterHeader = response.headers.headerValue("retry-after"),
                            jitterMs = retryJitterMs(),
                        ),
                    )
                }
            }
        }

        throw SimklApiException(
            status = null,
            errorCode = "transport_failure",
            message = "Simkl request failed",
            cause = lastTransportFailure,
        )
    }

    private suspend fun awaitRateLimit(method: SimklHttpMethod) {
        val now = nowEpochMs()
        val scheduledAt = when (method) {
            SimklHttpMethod.GET -> max(now, nextGetAtEpochMs)
            SimklHttpMethod.POST, SimklHttpMethod.DELETE -> max(now, nextPostAtEpochMs)
        }
        if (scheduledAt > now) sleep(scheduledAt - now)
        val requestAt = max(scheduledAt, nowEpochMs())
        when (method) {
            SimklHttpMethod.GET -> nextGetAtEpochMs = requestAt + GET_INTERVAL_MS
            SimklHttpMethod.POST, SimklHttpMethod.DELETE -> nextPostAtEpochMs = requestAt + POST_INTERVAL_MS
        }
    }

    private companion object {
        const val GET_INTERVAL_MS = 100L
        const val POST_INTERVAL_MS = 1_000L
        const val MAX_RETRIES = 5
        const val RETRY_JITTER_BOUND_MS = 1_000L
    }
}

internal object SimklApi {
    val client: SimklApiClient by lazy {
        SimklApiClient(
            engine = SimklHttpEngine { method, url, headers, body ->
                httpRequestRaw(
                    method = method,
                    url = url,
                    headers = headers,
                    body = body,
                    maxResponseBodyBytes = SIMKL_MAX_RESPONSE_BODY_BYTES,
                )
            },
            accessToken = SimklAuthRepository::authorizedAccessToken,
            onUnauthorized = SimklAuthRepository::onUnauthorizedResponse,
        )
    }
}

internal enum class SimklResponseAction {
    SUCCESS,
    SOFT_SUCCESS,
    REAUTHENTICATE,
    RETRY,
    FAIL,
}

internal fun classifySimklResponse(
    status: Int,
    scrobbleStopConflictIsSuccess: Boolean = false,
): SimklResponseAction = when {
    status in 200..299 -> SimklResponseAction.SUCCESS
    status == 409 && scrobbleStopConflictIsSuccess -> SimklResponseAction.SOFT_SUCCESS
    status == 401 -> SimklResponseAction.REAUTHENTICATE
    status == 429 || status == 500 || status == 502 || status == 503 -> SimklResponseAction.RETRY
    else -> SimklResponseAction.FAIL
}

internal fun retryDelayMs(
    attempt: Int,
    retryAfterHeader: String?,
    jitterMs: Long,
): Long {
    require(attempt in 0..4) { "Retry attempt must be between 0 and 4" }
    val exponentialDelayMs = 1_000L shl attempt
    val retryAfterMs = retryAfterHeader
        ?.substringBefore(',')
        ?.trim()
        ?.toLongOrNull()
        ?.coerceAtLeast(0L)
        ?.times(1_000L)
        ?: 0L
    return max(exponentialDelayMs, retryAfterMs) + jitterMs.coerceIn(0L, 1_000L)
}

private fun RawHttpResponse.toApiResponse(isSoftSuccess: Boolean = false): SimklApiResponse =
    SimklApiResponse(
        status = status,
        body = body,
        headers = headers,
        isSoftSuccess = isSoftSuccess,
    )

private fun RawHttpResponse.toApiException(json: Json): SimklApiException {
    val envelope = body.takeIf(String::isNotBlank)?.let { payload ->
        runCatching { json.decodeFromString<SimklErrorEnvelope>(payload) }.getOrNull()
    }
    return SimklApiException(
        status = status,
        errorCode = envelope?.error,
        message = envelope?.message?.takeIf(String::isNotBlank)
            ?: envelope?.error?.takeIf(String::isNotBlank)
            ?: "Simkl request failed with HTTP $status",
    )
}

private fun Map<String, String>.headerValue(name: String): String? =
    entries.firstOrNull { (key, _) -> key.equals(name, ignoreCase = true) }?.value

@Serializable
private data class SimklErrorEnvelope(
    val error: String? = null,
    val code: Int? = null,
    val message: String? = null,
)
