package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamClientResolve
import com.nuvio.app.features.streams.StreamItem
import kotlinx.coroutines.CancellationException

internal interface DebridProviderApi {
    val provider: DebridProvider

    suspend fun validateApiKey(apiKey: String): Boolean

    suspend fun startDeviceAuthorization(appName: String): DebridDeviceAuthorization? = null

    suspend fun redeemDeviceAuthorization(deviceCode: String): DebridDeviceAuthorizationTokenResult =
        DebridDeviceAuthorizationTokenResult.Unsupported

    suspend fun resolveClientStream(
        stream: StreamItem,
        apiKey: String,
        season: Int?,
        episode: Int?,
    ): DirectDebridResolveResult
}

internal object DebridProviderApis {
    private val registered = listOf(
        TorboxDebridProviderApi(),
        PremiumizeDebridProviderApi(),
        RealDebridProviderApi(),
    )

    fun apiFor(providerId: String?): DebridProviderApi? {
        val normalized = DebridProviders.byId(providerId)?.id ?: return null
        return registered.firstOrNull { it.provider.id == normalized }
    }
}

internal data class DebridDeviceAuthorization(
    val providerId: String,
    val deviceCode: String,
    val userCode: String,
    val verificationUrl: String,
    val friendlyVerificationUrl: String,
    val intervalSeconds: Int,
    val expiresAt: String?,
)

internal sealed interface DebridDeviceAuthorizationTokenResult {
    data class Authorized(val accessToken: String) : DebridDeviceAuthorizationTokenResult
    data object Pending : DebridDeviceAuthorizationTokenResult
    data object Expired : DebridDeviceAuthorizationTokenResult
    data object Unsupported : DebridDeviceAuthorizationTokenResult
    data class Failed(val message: String?) : DebridDeviceAuthorizationTokenResult
}

private class TorboxDebridProviderApi(
    private val fileSelector: TorboxFileSelector = TorboxFileSelector(),
) : DebridProviderApi {
    override val provider: DebridProvider = DebridProviders.Torbox

    override suspend fun validateApiKey(apiKey: String): Boolean =
        TorboxApiClient.validateApiKey(apiKey)

    override suspend fun startDeviceAuthorization(appName: String): DebridDeviceAuthorization? {
        val response = TorboxApiClient.startDeviceAuthorization(appName = appName)
        val data = response.body?.takeIf { response.isSuccessful && it.success != false }?.data
            ?: return null
        val deviceCode = data.deviceCode?.takeIf { it.isNotBlank() } ?: return null
        val userCode = data.code?.takeIf { it.isNotBlank() } ?: return null
        val verificationUrl = data.verificationUrl?.takeIf { it.isNotBlank() } ?: return null
        return DebridDeviceAuthorization(
            providerId = provider.id,
            deviceCode = deviceCode,
            userCode = userCode,
            verificationUrl = verificationUrl,
            friendlyVerificationUrl = data.friendlyVerificationUrl?.takeIf { it.isNotBlank() }
                ?: verificationUrl,
            intervalSeconds = data.interval?.coerceAtLeast(1) ?: 5,
            expiresAt = data.expiresAt?.takeIf { it.isNotBlank() },
        )
    }

    override suspend fun redeemDeviceAuthorization(deviceCode: String): DebridDeviceAuthorizationTokenResult {
        val normalized = deviceCode.trim()
        if (normalized.isBlank()) return DebridDeviceAuthorizationTokenResult.Failed(null)
        val response = TorboxApiClient.redeemDeviceAuthorization(deviceCode = normalized)
        return torboxDeviceAuthorizationTokenResult(response)
    }

    override suspend fun resolveClientStream(
        stream: StreamItem,
        apiKey: String,
        season: Int?,
        episode: Int?,
    ): DirectDebridResolveResult {
        val resolve = stream.clientResolve ?: return DirectDebridResolveResult.Error
        val magnet = resolve.magnetUri?.takeIf { it.isNotBlank() }
            ?: buildMagnetUri(resolve)
            ?: return DirectDebridResolveResult.Stale

        return try {
            val create = TorboxApiClient.createTorrent(apiKey = apiKey, magnet = magnet)
            val torrentId = create.body?.takeIf { it.success != false }?.data?.resolvedTorrentId()
                ?: return create.toFailureForCreate()

            val torrent = TorboxApiClient.getTorrent(apiKey = apiKey, id = torrentId)
            if (!torrent.isSuccessful) {
                return DirectDebridResolveResult.Stale
            }
            val files = torrent.body?.data?.files.orEmpty()
            val file = fileSelector.selectFile(files, resolve, season, episode)
                ?: return DirectDebridResolveResult.Stale
            val fileId = file.id ?: return DirectDebridResolveResult.Stale

            val link = TorboxApiClient.requestDownloadLink(
                apiKey = apiKey,
                torrentId = torrentId,
                fileId = fileId,
            )
            if (!link.isSuccessful) {
                return DirectDebridResolveResult.Stale
            }
            val url = link.body?.data?.takeIf { it.isNotBlank() }
                ?: return DirectDebridResolveResult.Stale

            DirectDebridResolveResult.Success(
                url = url,
                filename = file.displayName().takeIf { it.isNotBlank() },
                videoSize = file.size,
            )
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            DirectDebridResolveResult.Error
        }
    }
}

internal class PremiumizeDebridProviderApi(
    private val fileSelector: PremiumizeDirectDownloadFileSelector = PremiumizeDirectDownloadFileSelector(),
    private val clientIdProvider: () -> String = { PremiumizeConfig.CLIENT_ID },
) : DebridProviderApi {
    override val provider: DebridProvider = DebridProviders.Premiumize

    override suspend fun validateApiKey(apiKey: String): Boolean =
        PremiumizeApiClient.validateApiKey(apiKey)

    override suspend fun startDeviceAuthorization(appName: String): DebridDeviceAuthorization? {
        val clientId = premiumizeClientIdOrThrow()
        val response = PremiumizeApiClient.startDeviceAuthorization(clientId = clientId)
        return premiumizeDeviceAuthorizationFromResponse(response, provider.id)
    }

    override suspend fun redeemDeviceAuthorization(deviceCode: String): DebridDeviceAuthorizationTokenResult {
        val clientId = premiumizeClientIdOrThrow()
        val normalized = deviceCode.trim()
        if (normalized.isBlank()) return DebridDeviceAuthorizationTokenResult.Failed(null)
        val response = PremiumizeApiClient.redeemDeviceAuthorization(
            clientId = clientId,
            deviceCode = normalized,
        )
        return premiumizeDeviceAuthorizationTokenResult(response)
    }

    override suspend fun resolveClientStream(
        stream: StreamItem,
        apiKey: String,
        season: Int?,
        episode: Int?,
    ): DirectDebridResolveResult {
        val resolve = stream.clientResolve ?: return DirectDebridResolveResult.Error
        val source = resolve.magnetUri?.takeIf { it.isNotBlank() }
            ?: buildMagnetUri(resolve)
            ?: stream.playableDirectUrl?.takeIf { it.isNotBlank() }
            ?: return DirectDebridResolveResult.Stale
        return resolvePremiumizeDirectDownload(
            apiKey = apiKey,
            source = source,
            resolve = resolve,
            season = season,
            episode = episode,
            fallbackFilename = stream.behaviorHints.filename,
            fallbackSize = stream.behaviorHints.videoSize,
            fileSelector = fileSelector,
        )
    }

    private fun premiumizeClientIdOrThrow(): String =
        clientIdProvider().trim().takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Premiumize sign-in is missing PREMIUMIZE_CLIENT_ID.")
}

private class RealDebridProviderApi(
    private val fileSelector: RealDebridFileSelector = RealDebridFileSelector(),
) : DebridProviderApi {
    override val provider: DebridProvider = DebridProviders.RealDebrid

    override suspend fun validateApiKey(apiKey: String): Boolean =
        RealDebridApiClient.validateApiKey(apiKey)

    override suspend fun resolveClientStream(
        stream: StreamItem,
        apiKey: String,
        season: Int?,
        episode: Int?,
    ): DirectDebridResolveResult {
        val resolve = stream.clientResolve ?: return DirectDebridResolveResult.Error
        val magnet = resolve.magnetUri?.takeIf { it.isNotBlank() }
            ?: buildMagnetUri(resolve)
            ?: return DirectDebridResolveResult.Stale

        return try {
            val add = RealDebridApiClient.addMagnet(apiKey, magnet)
            val torrentId = add.body?.id?.takeIf { add.isSuccessful && it.isNotBlank() }
                ?: return add.toFailureForAdd()
            var resolved = false
            try {
                val infoBefore = RealDebridApiClient.getTorrentInfo(apiKey, torrentId)
                if (!infoBefore.isSuccessful) {
                    return DirectDebridResolveResult.Stale
                }
                val filesBefore = infoBefore.body?.files.orEmpty()
                val file = fileSelector.selectFile(
                    files = filesBefore,
                    resolve = resolve,
                    season = season,
                    episode = episode,
                ) ?: return DirectDebridResolveResult.Stale
                val fileId = file.id ?: return DirectDebridResolveResult.Stale
                val select = RealDebridApiClient.selectFiles(apiKey, torrentId, fileId.toString())
                if (!select.isSuccessful && select.status != 202) {
                    return DirectDebridResolveResult.Stale
                }

                val infoAfter = RealDebridApiClient.getTorrentInfo(apiKey, torrentId)
                if (!infoAfter.isSuccessful) {
                    return DirectDebridResolveResult.Stale
                }
                val link = infoAfter.body?.firstDownloadLink()
                    ?: return DirectDebridResolveResult.Stale
                val unrestrict = RealDebridApiClient.unrestrictLink(apiKey, link)
                if (!unrestrict.isSuccessful) {
                    return DirectDebridResolveResult.Stale
                }
                val url = unrestrict.body?.download?.takeIf { it.isNotBlank() }
                    ?: return DirectDebridResolveResult.Stale
                resolved = true
                DirectDebridResolveResult.Success(
                    url = url,
                    filename = unrestrict.body.filename?.takeIf { it.isNotBlank() }
                        ?: file.displayName().takeIf { it.isNotBlank() },
                    videoSize = unrestrict.body.filesize ?: file.bytes,
                )
            } finally {
                if (!resolved) {
                    runCatching { RealDebridApiClient.deleteTorrent(apiKey, torrentId) }
                }
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            DirectDebridResolveResult.Error
        }
    }
}

private fun buildMagnetUri(resolve: StreamClientResolve): String? {
    val hash = resolve.infoHash?.takeIf { it.isNotBlank() } ?: return null
    return buildString {
        append("magnet:?xt=urn:btih:")
        append(hash)
        resolve.sources
            .mapNotNull { it.toTrackerUrlOrNull() }
            .distinct()
            .forEach { source ->
                append("&tr=")
                append(encodePathSegment(source))
            }
    }
}

internal fun premiumizeDeviceAuthorizationFromResponse(
    response: DebridApiResponse<PremiumizeDeviceAuthorizationDto>,
    providerId: String,
): DebridDeviceAuthorization? {
    val data = response.body?.takeIf { response.isSuccessful } ?: return null
    val deviceCode = data.deviceCode?.takeIf { it.isNotBlank() } ?: return null
    val userCode = data.userCode?.takeIf { it.isNotBlank() } ?: return null
    val verificationUrl = data.verificationUri?.takeIf { it.isNotBlank() } ?: return null
    return DebridDeviceAuthorization(
        providerId = providerId,
        deviceCode = deviceCode,
        userCode = userCode,
        verificationUrl = verificationUrl,
        friendlyVerificationUrl = data.verificationUriComplete?.takeIf { it.isNotBlank() }
            ?: verificationUrl,
        intervalSeconds = data.interval?.coerceAtLeast(1) ?: 5,
        expiresAt = data.expiresIn?.takeIf { it > 0 }?.let { "${it}s" },
    )
}

internal fun torboxDeviceAuthorizationTokenResult(
    response: DebridApiResponse<TorboxEnvelopeDto<TorboxDeviceTokenDto>>,
): DebridDeviceAuthorizationTokenResult {
    val envelope = response.body
    val accessToken = envelope
        ?.takeIf { response.isSuccessful && it.success != false }
        ?.data
        ?.accessToken
        ?.takeIf { it.isNotBlank() }
    if (accessToken != null) {
        return DebridDeviceAuthorizationTokenResult.Authorized(accessToken)
    }
    val message = listOfNotNull(envelope?.error, envelope?.detail, response.rawBody)
        .joinToString(" ")
        .lowercase()
    return when {
        message.contains("pending") ||
            message.contains("not authorized") ||
            message.contains("not been used") ||
            message.contains("not used yet") ||
            message.contains("scan the code") ->
            DebridDeviceAuthorizationTokenResult.Pending
        message.contains("expired") ->
            DebridDeviceAuthorizationTokenResult.Expired
        response.status == 404 || response.status == 409 || response.status == 425 ->
            DebridDeviceAuthorizationTokenResult.Pending
        response.status == 410 ->
            DebridDeviceAuthorizationTokenResult.Expired
        else ->
            DebridDeviceAuthorizationTokenResult.Failed(envelope?.detail ?: envelope?.error)
    }
}

internal fun premiumizeDeviceAuthorizationTokenResult(
    response: DebridApiResponse<PremiumizeDeviceTokenDto>,
): DebridDeviceAuthorizationTokenResult {
    val body = response.body
    body?.accessToken?.takeIf { response.isSuccessful && it.isNotBlank() }?.let { accessToken ->
        return DebridDeviceAuthorizationTokenResult.Authorized(accessToken)
    }
    return when (body?.error?.lowercase()) {
        "authorization_pending", "slow_down" -> DebridDeviceAuthorizationTokenResult.Pending
        "invalid_grant", "expired_token" -> DebridDeviceAuthorizationTokenResult.Expired
        "access_denied" -> DebridDeviceAuthorizationTokenResult.Failed(body.errorDescription)
        else -> {
            if (response.status == 400 && body?.error.isNullOrBlank()) {
                DebridDeviceAuthorizationTokenResult.Pending
            } else {
                DebridDeviceAuthorizationTokenResult.Failed(body?.errorDescription ?: body?.error ?: response.rawBody)
            }
        }
    }
}

internal suspend fun resolvePremiumizeDirectDownload(
    apiKey: String,
    source: String,
    resolve: StreamClientResolve,
    season: Int?,
    episode: Int?,
    fallbackFilename: String? = null,
    fallbackSize: Long? = null,
    fileSelector: PremiumizeDirectDownloadFileSelector = PremiumizeDirectDownloadFileSelector(),
): DirectDebridResolveResult {
    val normalizedSource = source.trim().takeIf { it.isNotBlank() } ?: return DirectDebridResolveResult.Stale
    return try {
        val response = PremiumizeApiClient.directDownload(apiKey = apiKey, source = normalizedSource)
        if (!response.isSuccessful) {
            return when (response.status) {
                401, 403 -> DirectDebridResolveResult.Error
                else -> DirectDebridResolveResult.Stale
            }
        }
        val body = response.body ?: return DirectDebridResolveResult.Stale
        if (body.status.equals("error", ignoreCase = true)) {
            val message = listOfNotNull(body.message, body.code).joinToString(" ").lowercase()
            return if (message.contains("cache") || message.contains("not found")) {
                DirectDebridResolveResult.NotCached
            } else {
                DirectDebridResolveResult.Stale
            }
        }
        val file = fileSelector.selectFile(
            files = body.content.orEmpty(),
            resolve = resolve,
            season = season,
            episode = episode,
        ) ?: return DirectDebridResolveResult.Stale
        val url = file.link?.takeIf { it.isNotBlank() } ?: return DirectDebridResolveResult.Stale
        DirectDebridResolveResult.Success(
            url = url,
            filename = file.displayName().takeIf { it.isNotBlank() } ?: fallbackFilename,
            videoSize = file.size ?: fallbackSize,
        )
    } catch (error: Exception) {
        if (error is CancellationException) throw error
        DirectDebridResolveResult.Error
    }
}

private fun String.toTrackerUrlOrNull(): String? {
    val value = trim()
    if (value.isBlank() || value.startsWith("dht:", ignoreCase = true)) return null
    return value.removePrefix("tracker:").trim().takeIf { it.isNotBlank() }
}

private fun DebridApiResponse<TorboxEnvelopeDto<TorboxCreateTorrentDataDto>>.toFailureForCreate(): DirectDebridResolveResult =
    when (status) {
        401, 403 -> DirectDebridResolveResult.Error
        409 -> DirectDebridResolveResult.NotCached
        else -> DirectDebridResolveResult.Stale
    }

private fun DebridApiResponse<RealDebridAddTorrentDto>.toFailureForAdd(): DirectDebridResolveResult =
    when (status) {
        401, 403 -> DirectDebridResolveResult.Error
        else -> DirectDebridResolveResult.Stale
    }

private fun RealDebridTorrentInfoDto.firstDownloadLink(): String? {
    if (!status.equals("downloaded", ignoreCase = true)) return null
    return links.orEmpty().firstOrNull { it.isNotBlank() }
}
