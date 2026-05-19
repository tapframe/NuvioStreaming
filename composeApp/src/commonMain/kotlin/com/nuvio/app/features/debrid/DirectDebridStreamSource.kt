package com.nuvio.app.features.debrid

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.streams.AddonStreamGroup
import com.nuvio.app.features.streams.StreamParser
import com.nuvio.app.features.streams.epochMs
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val DIRECT_DEBRID_TAG = "DirectDebridStreams"
private const val STREAM_CACHE_TTL_MS = 5L * 60L * 1000L

data class DirectDebridStreamTarget(
    val provider: DebridProvider,
    val apiKey: String,
) {
    val addonId: String = DebridProviders.addonId(provider.id)
    val addonName: String = DebridProviders.instantName(provider.id)
}

object DirectDebridStreamSource {
    private val log = Logger.withTag(DIRECT_DEBRID_TAG)
    private val encoder = DirectDebridConfigEncoder()
    private val formatter = DebridStreamFormatter()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()
    private val streamCache = mutableMapOf<DirectDebridStreamCacheKey, CachedDirectDebridStreams>()
    private val inFlightFetches = mutableMapOf<DirectDebridStreamCacheKey, Deferred<AddonStreamGroup>>()

    fun configuredTargets(): List<DirectDebridStreamTarget> {
        DebridSettingsRepository.ensureLoaded()
        val settings = DebridSettingsRepository.snapshot()
        if (!settings.enabled || DebridConfig.DIRECT_DEBRID_API_BASE_URL.isBlank()) return emptyList()
        return DebridProviders.configuredServices(settings).map { credential ->
            DirectDebridStreamTarget(
                provider = credential.provider,
                apiKey = credential.apiKey,
            )
        }
    }

    fun sourceNames(): List<String> =
        configuredTargets().map { it.addonName }

    fun isEnabled(): Boolean =
        sourceNames().isNotEmpty()

    fun placeholders(): List<AddonStreamGroup> =
        configuredTargets().map { target ->
            AddonStreamGroup(
                addonName = target.addonName,
                addonId = target.addonId,
                streams = emptyList(),
                isLoading = true,
            )
        }

    fun preloadStreams(type: String, videoId: String) {
        if (type.isBlank() || videoId.isBlank()) return
        configuredTargets().forEach { target ->
            scope.launch {
                runCatching { fetchProviderStreams(type, videoId, target) }
            }
        }
    }

    suspend fun fetchStreams(type: String, videoId: String): DirectDebridStreamFetchResult {
        val targets = configuredTargets()
        if (targets.isEmpty()) return DirectDebridStreamFetchResult.Disabled

        val results = mutableListOf<AddonStreamGroup>()
        val errors = mutableListOf<String>()
        targets.forEach { target ->
            val group = fetchProviderStreams(type, videoId, target)
            when {
                group.streams.isNotEmpty() -> results += group
                !group.error.isNullOrBlank() -> errors += group.error
            }
        }

        return when {
            results.isNotEmpty() -> DirectDebridStreamFetchResult.Success(results)
            errors.isNotEmpty() -> DirectDebridStreamFetchResult.Error(errors.first())
            else -> DirectDebridStreamFetchResult.Empty
        }
    }

    suspend fun fetchProviderStreams(
        type: String,
        videoId: String,
        target: DirectDebridStreamTarget,
    ): AddonStreamGroup {
        val settings = DebridSettingsRepository.snapshot()
        val baseUrl = DebridConfig.DIRECT_DEBRID_API_BASE_URL.trim().trimEnd('/')
        if (!settings.enabled || baseUrl.isBlank()) {
            return target.emptyGroup()
        }

        val cacheKey = DirectDebridStreamCacheKey(
            providerId = target.provider.id,
            type = type.trim().lowercase(),
            videoId = videoId.trim(),
            baseUrl = baseUrl,
            settingsFingerprint = settings.toString(),
        )
        cachedGroup(cacheKey)?.let { return it }

        var ownsFetch = false
        val newFetch = scope.async(start = CoroutineStart.LAZY) {
            fetchProviderStreamsUncached(
                baseUrl = baseUrl,
                type = type,
                videoId = videoId,
                target = target,
                settings = settings,
            )
        }
        val activeFetch = mutex.withLock {
            cachedGroupLocked(cacheKey)?.let { cached ->
                return@withLock null to cached
            }
            val existing = inFlightFetches[cacheKey]
            if (existing != null) {
                existing to null
            } else {
                inFlightFetches[cacheKey] = newFetch
                ownsFetch = true
                newFetch to null
            }
        }
        activeFetch.second?.let {
            newFetch.cancel()
            return it
        }
        val deferred = activeFetch.first ?: return target.errorGroup("Could not start Direct Debrid fetch")
        if (!ownsFetch) newFetch.cancel()
        if (ownsFetch) deferred.start()

        return try {
            val result = deferred.await()
            if (ownsFetch && result.streams.isNotEmpty() && result.error == null) {
                mutex.withLock {
                    streamCache[cacheKey] = CachedDirectDebridStreams(
                        group = result,
                        createdAtMs = epochMs(),
                    )
                }
            }
            result
        } finally {
            if (ownsFetch) {
                mutex.withLock {
                    if (inFlightFetches[cacheKey] === deferred) {
                        inFlightFetches.remove(cacheKey)
                    }
                }
            }
        }
    }

    private suspend fun cachedGroup(cacheKey: DirectDebridStreamCacheKey): AddonStreamGroup? =
        mutex.withLock { cachedGroupLocked(cacheKey) }

    private fun cachedGroupLocked(cacheKey: DirectDebridStreamCacheKey): AddonStreamGroup? {
        val cached = streamCache[cacheKey] ?: return null
        val age = epochMs() - cached.createdAtMs
        return if (age in 0..STREAM_CACHE_TTL_MS) {
            cached.group
        } else {
            streamCache.remove(cacheKey)
            null
        }
    }

    private suspend fun fetchProviderStreamsUncached(
        baseUrl: String,
        type: String,
        videoId: String,
        target: DirectDebridStreamTarget,
        settings: DebridSettings,
    ): AddonStreamGroup {
        val credential = DebridServiceCredential(target.provider, target.apiKey)
        val url = "$baseUrl/${encoder.encode(credential)}/client-stream/${encodePathSegment(type)}/${encodePathSegment(videoId)}.json"
        return try {
            val payload = httpGetText(url)
            val streams = StreamParser.parse(
                payload = payload,
                addonName = DirectDebridStreamFilter.FALLBACK_SOURCE_NAME,
                addonId = target.addonId,
            )
                .let { DirectDebridStreamFilter.filterInstant(it, settings) }
                .filter { stream -> stream.clientResolve?.service.equals(target.provider.id, ignoreCase = true) }
                .map { stream -> formatter.format(stream.copy(addonId = target.addonId), settings) }

            AddonStreamGroup(
                addonName = target.addonName,
                addonId = target.addonId,
                streams = streams,
                isLoading = false,
            )
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            log.w(error) { "Direct debrid ${target.provider.id} stream fetch failed" }
            target.errorGroup(error.message)
        }
    }

    private fun DirectDebridStreamTarget.emptyGroup(): AddonStreamGroup =
        AddonStreamGroup(
            addonName = addonName,
            addonId = addonId,
            streams = emptyList(),
            isLoading = false,
        )

    private fun DirectDebridStreamTarget.errorGroup(message: String?): AddonStreamGroup =
        AddonStreamGroup(
            addonName = addonName,
            addonId = addonId,
            streams = emptyList(),
            isLoading = false,
            error = message,
        )
}

private data class DirectDebridStreamCacheKey(
    val providerId: String,
    val type: String,
    val videoId: String,
    val baseUrl: String,
    val settingsFingerprint: String,
)

private data class CachedDirectDebridStreams(
    val group: AddonStreamGroup,
    val createdAtMs: Long,
)

sealed class DirectDebridStreamFetchResult {
    data object Disabled : DirectDebridStreamFetchResult()
    data object Empty : DirectDebridStreamFetchResult()
    data class Success(val streams: List<AddonStreamGroup>) : DirectDebridStreamFetchResult()
    data class Error(val message: String) : DirectDebridStreamFetchResult()
}
