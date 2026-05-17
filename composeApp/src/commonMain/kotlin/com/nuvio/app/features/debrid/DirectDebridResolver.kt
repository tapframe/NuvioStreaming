package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamBehaviorHints
import com.nuvio.app.features.streams.StreamClientResolve
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.epochMs
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.debrid_missing_api_key
import nuvio.composeapp.generated.resources.debrid_resolve_failed
import nuvio.composeapp.generated.resources.debrid_stream_stale
import org.jetbrains.compose.resources.getString

object DirectDebridPlaybackResolver {
    private val torboxResolver = TorboxDirectDebridResolver()
    private val realDebridResolver = RealDebridDirectDebridResolver()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()
    private val resolvedCache = mutableMapOf<String, CachedDirectDebridResolve>()
    private val inFlightResolves = mutableMapOf<String, Deferred<DirectDebridResolveResult>>()

    suspend fun resolve(stream: StreamItem, season: Int?, episode: Int?): DirectDebridResolveResult {
        val cacheKey = stream.directDebridResolveCacheKey(season, episode)
        if (cacheKey == null) {
            return resolveUncached(stream, season, episode)
        }
        getCachedResult(cacheKey)?.let {
            return it
        }

        var ownsResolve = false
        val newResolve = scope.async(start = CoroutineStart.LAZY) {
            resolveUncached(stream, season, episode)
        }
        val activeResolve = mutex.withLock {
            getCachedResultLocked(cacheKey)?.let { cached ->
                return@withLock null to cached
            }
            val existing = inFlightResolves[cacheKey]
            if (existing != null) {
                existing to null
            } else {
                inFlightResolves[cacheKey] = newResolve
                ownsResolve = true
                newResolve to null
            }
        }
        activeResolve.second?.let {
            newResolve.cancel()
            return it
        }
        val deferred = activeResolve.first ?: return DirectDebridResolveResult.Error
        if (!ownsResolve) newResolve.cancel()
        if (ownsResolve) deferred.start()

        return try {
            val result = deferred.await()
            if (ownsResolve && result is DirectDebridResolveResult.Success) {
                mutex.withLock {
                    resolvedCache[cacheKey] = CachedDirectDebridResolve(
                        result = result,
                        cachedAtMs = epochMs(),
                    )
                }
            }
            result
        } finally {
            if (ownsResolve) {
                mutex.withLock {
                    if (inFlightResolves[cacheKey] === deferred) {
                        inFlightResolves.remove(cacheKey)
                    }
                }
            }
        }
    }

    suspend fun cachedPlayableStream(stream: StreamItem, season: Int?, episode: Int?): StreamItem? {
        val cacheKey = stream.directDebridResolveCacheKey(season, episode) ?: return null
        return getCachedResult(cacheKey)
            ?.let { result -> stream.withResolvedDebridUrl(result) }
    }

    private suspend fun getCachedResult(cacheKey: String): DirectDebridResolveResult.Success? =
        mutex.withLock { getCachedResultLocked(cacheKey) }

    private fun getCachedResultLocked(cacheKey: String): DirectDebridResolveResult.Success? {
        val cached = resolvedCache[cacheKey] ?: return null
        val age = epochMs() - cached.cachedAtMs
        return if (age in 0..DIRECT_DEBRID_RESOLVE_CACHE_TTL_MS) {
            cached.result
        } else {
            resolvedCache.remove(cacheKey)
            null
        }
    }

    private suspend fun resolveUncached(stream: StreamItem, season: Int?, episode: Int?): DirectDebridResolveResult =
        when (DebridProviders.byId(stream.clientResolve?.service)?.id) {
            DebridProviders.TORBOX_ID -> torboxResolver.resolve(stream, season, episode)
            DebridProviders.REAL_DEBRID_ID -> realDebridResolver.resolve(stream, season, episode)
            else -> DirectDebridResolveResult.Error
        }

    suspend fun resolveToPlayableStream(
        stream: StreamItem,
        season: Int?,
        episode: Int?,
    ): DirectDebridPlayableResult {
        if (!stream.isDirectDebridStream || stream.directPlaybackUrl != null) {
            return DirectDebridPlayableResult.Success(stream)
        }
        return when (val result = resolve(stream, season, episode)) {
            is DirectDebridResolveResult.Success -> DirectDebridPlayableResult.Success(stream.withResolvedDebridUrl(result))
            DirectDebridResolveResult.MissingApiKey -> DirectDebridPlayableResult.MissingApiKey
            DirectDebridResolveResult.Stale -> DirectDebridPlayableResult.Stale
            DirectDebridResolveResult.Error -> DirectDebridPlayableResult.Error
        }
    }
}

private const val DIRECT_DEBRID_RESOLVE_CACHE_TTL_MS = 15L * 60L * 1000L

private data class CachedDirectDebridResolve(
    val result: DirectDebridResolveResult.Success,
    val cachedAtMs: Long,
)

sealed class DirectDebridPlayableResult {
    data class Success(val stream: StreamItem) : DirectDebridPlayableResult()
    data object MissingApiKey : DirectDebridPlayableResult()
    data object Stale : DirectDebridPlayableResult()
    data object Error : DirectDebridPlayableResult()
}

sealed class DirectDebridResolveResult {
    data class Success(
        val url: String,
        val filename: String?,
        val videoSize: Long?,
    ) : DirectDebridResolveResult()

    data object MissingApiKey : DirectDebridResolveResult()
    data object Stale : DirectDebridResolveResult()
    data object Error : DirectDebridResolveResult()
}

fun DirectDebridPlayableResult.toastMessage(): String? =
    when (this) {
        is DirectDebridPlayableResult.Success -> null
        DirectDebridPlayableResult.MissingApiKey -> runBlocking { getString(Res.string.debrid_missing_api_key) }
        DirectDebridPlayableResult.Stale -> runBlocking { getString(Res.string.debrid_stream_stale) }
        DirectDebridPlayableResult.Error -> runBlocking { getString(Res.string.debrid_resolve_failed) }
    }

private class TorboxDirectDebridResolver(
    private val fileSelector: TorboxFileSelector = TorboxFileSelector(),
) {
    suspend fun resolve(stream: StreamItem, season: Int?, episode: Int?): DirectDebridResolveResult {
        val resolve = stream.clientResolve ?: return DirectDebridResolveResult.Error
        val apiKey = DebridSettingsRepository.snapshot().torboxApiKey.trim()
        if (apiKey.isBlank()) {
            return DirectDebridResolveResult.MissingApiKey
        }
        val magnet = resolve.magnetUri?.takeIf { it.isNotBlank() }
            ?: buildMagnetUri(resolve)
            ?: run {
                return DirectDebridResolveResult.Stale
            }

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
                ?: run {
                    return DirectDebridResolveResult.Stale
                }
            val fileId = file.id
                ?: run {
                    return DirectDebridResolveResult.Stale
                }

            val link = TorboxApiClient.requestDownloadLink(
                apiKey = apiKey,
                torrentId = torrentId,
                fileId = fileId,
            )
            if (!link.isSuccessful) {
                return DirectDebridResolveResult.Stale
            }
            val url = link.body?.data?.takeIf { it.isNotBlank() }
                ?: run {
                    return DirectDebridResolveResult.Stale
                }

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

    private fun DebridApiResponse<TorboxEnvelopeDto<TorboxCreateTorrentDataDto>>.toFailureForCreate(): DirectDebridResolveResult =
        when (status) {
            401, 403 -> DirectDebridResolveResult.Error
            else -> DirectDebridResolveResult.Stale
        }
}

private class RealDebridDirectDebridResolver(
    private val fileSelector: RealDebridFileSelector = RealDebridFileSelector(),
) {
    suspend fun resolve(stream: StreamItem, season: Int?, episode: Int?): DirectDebridResolveResult {
        val resolve = stream.clientResolve ?: return DirectDebridResolveResult.Error
        val apiKey = DebridSettingsRepository.snapshot().realDebridApiKey.trim()
        if (apiKey.isBlank()) {
            return DirectDebridResolveResult.MissingApiKey
        }
        val magnet = resolve.magnetUri?.takeIf { it.isNotBlank() }
            ?: buildMagnetUri(resolve)
            ?: run {
                return DirectDebridResolveResult.Stale
            }

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
                )
                    ?: run {
                        return DirectDebridResolveResult.Stale
                    }
                val fileId = file.id
                    ?: run {
                        return DirectDebridResolveResult.Stale
                    }
                val select = RealDebridApiClient.selectFiles(apiKey, torrentId, fileId.toString())
                if (!select.isSuccessful && select.status != 202) {
                    return DirectDebridResolveResult.Stale
                }

                val infoAfter = RealDebridApiClient.getTorrentInfo(apiKey, torrentId)
                if (!infoAfter.isSuccessful) {
                    return DirectDebridResolveResult.Stale
                }
                val link = infoAfter.body?.firstDownloadLink()
                    ?: run {
                        return DirectDebridResolveResult.Stale
                    }
                val unrestrict = RealDebridApiClient.unrestrictLink(apiKey, link)
                if (!unrestrict.isSuccessful) {
                    return DirectDebridResolveResult.Stale
                }
                val url = unrestrict.body?.download?.takeIf { it.isNotBlank() }
                    ?: run {
                        return DirectDebridResolveResult.Stale
                    }
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

    private fun DebridApiResponse<RealDebridAddTorrentDto>.toFailureForAdd(): DirectDebridResolveResult =
        when (status) {
            401, 403 -> DirectDebridResolveResult.Error
            else -> DirectDebridResolveResult.Stale
        }

    private fun RealDebridTorrentInfoDto.firstDownloadLink(): String? {
        if (!status.equals("downloaded", ignoreCase = true)) return null
        return links.orEmpty().firstOrNull { it.isNotBlank() }
    }
}

private fun buildMagnetUri(resolve: StreamClientResolve): String? {
    val hash = resolve.infoHash?.takeIf { it.isNotBlank() } ?: return null
    return buildString {
        append("magnet:?xt=urn:btih:")
        append(hash)
        resolve.sources
            .filter { it.isNotBlank() }
            .forEach { source ->
                append("&tr=")
                append(encodePathSegment(source))
            }
    }
}

private fun StreamItem.directDebridResolveCacheKey(season: Int?, episode: Int?): String? {
    val resolve = clientResolve ?: return null
    val providerId = DebridProviders.byId(resolve.service)?.id ?: return null
    val apiKey = when (providerId) {
        DebridProviders.TORBOX_ID -> DebridSettingsRepository.snapshot().torboxApiKey
        DebridProviders.REAL_DEBRID_ID -> DebridSettingsRepository.snapshot().realDebridApiKey
        else -> ""
    }.trim().takeIf { it.isNotBlank() } ?: return null
    val identity = resolve.infoHash
        ?: resolve.magnetUri
        ?: resolve.torrentName
        ?: resolve.filename
        ?: return null

    return listOf(
        providerId,
        apiKey.stableFingerprint(),
        identity.trim().lowercase(),
        resolve.fileIdx?.toString().orEmpty(),
        (resolve.filename ?: behaviorHints.filename).orEmpty().trim().lowercase(),
        (season ?: resolve.season)?.toString().orEmpty(),
        (episode ?: resolve.episode)?.toString().orEmpty(),
    ).joinToString("|")
}

private fun String.stableFingerprint(): String {
    val hash = fold(1125899906842597L) { acc, char -> (acc * 31L) + char.code }
    return hash.toULong().toString(16)
}

private fun StreamItem.withResolvedDebridUrl(result: DirectDebridResolveResult.Success): StreamItem =
    copy(
        url = result.url,
        externalUrl = null,
        behaviorHints = behaviorHints.mergeResolvedDebridHints(result),
    )

private fun StreamBehaviorHints.mergeResolvedDebridHints(result: DirectDebridResolveResult.Success): StreamBehaviorHints =
    copy(
        filename = result.filename ?: filename,
        videoSize = result.videoSize ?: videoSize,
    )
