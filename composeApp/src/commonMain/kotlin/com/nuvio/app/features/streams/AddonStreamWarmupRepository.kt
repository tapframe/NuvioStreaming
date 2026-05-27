package com.nuvio.app.features.streams

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.AddonManifest
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.addons.buildAddonResourceUrl
import com.nuvio.app.features.addons.enabledAddons
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.debrid.DebridSettings
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.debrid.DebridStreamPresentation
import com.nuvio.app.features.debrid.DirectDebridStreamPreparer
import com.nuvio.app.features.debrid.LocalDebridAvailabilityService
import com.nuvio.app.features.player.PlayerSettingsRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val ADDON_STREAM_WARMUP_CACHE_TTL_MS = 5L * 60L * 1000L

object AddonStreamWarmupRepository {
    private val log = Logger.withTag("AddonStreamWarmup")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()
    private val cache = mutableMapOf<AddonStreamWarmupKey, CachedAddonStreamWarmup>()
    private val inFlight = mutableMapOf<AddonStreamWarmupKey, Deferred<List<AddonStreamGroup>>>()

    fun preload(type: String, videoId: String, season: Int? = null, episode: Int? = null) {
        val key = currentKey(type = type, videoId = videoId, season = season, episode = episode) ?: return
        scope.launch {
            runCatching { fetchWarmup(key) }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    log.d(error) { "Addon stream warmup failed" }
                }
        }
    }

    fun cachedGroups(type: String, videoId: String, season: Int? = null, episode: Int? = null): List<AddonStreamGroup>? {
        val key = currentKey(type = type, videoId = videoId, season = season, episode = episode) ?: return null
        if (!mutex.tryLock()) return null
        return try {
            cachedGroupsLocked(key)
        } finally {
            mutex.unlock()
        }
    }

    private suspend fun fetchWarmup(key: AddonStreamWarmupKey): List<AddonStreamGroup> {
        cachedGroups(key.type, key.videoId, key.season, key.episode)?.let { return it }

        var ownsFetch = false
        val newFetch = scope.async(start = CoroutineStart.LAZY) {
            fetchWarmupUncached(key)
        }
        val activeFetch = mutex.withLock {
            cachedGroupsLocked(key)?.let { cached ->
                return@withLock null to cached
            }
            val existing = inFlight[key]
            if (existing != null) {
                existing to null
            } else {
                inFlight[key] = newFetch
                ownsFetch = true
                newFetch to null
            }
        }
        activeFetch.second?.let {
            newFetch.cancel()
            return it
        }
        val deferred = activeFetch.first ?: return emptyList()
        if (!ownsFetch) newFetch.cancel()
        if (ownsFetch) deferred.start()

        return try {
            val result = deferred.await()
            val cacheableGroups = result.filter { it.streams.isNotEmpty() }
            if (ownsFetch && cacheableGroups.isNotEmpty()) {
                mutex.withLock {
                    cache[key] = CachedAddonStreamWarmup(
                        groups = cacheableGroups,
                        createdAtMs = epochMs(),
                    )
                }
            }
            result
        } finally {
            if (ownsFetch) {
                mutex.withLock {
                    if (inFlight[key] === deferred) {
                        inFlight.remove(key)
                    }
                }
            }
        }
    }

    private suspend fun fetchWarmupUncached(key: AddonStreamWarmupKey): List<AddonStreamGroup> {
        val targets = key.addonTargets
        if (targets.isEmpty()) return emptyList()

        val addonIds = targets.map { it.addonId }.toSet()
        val orderedGroups = coroutineScope {
            targets.map { target ->
                async {
                    val group = fetchAddonStreams(
                        target = target,
                        type = key.type,
                        videoId = key.videoId,
                    )
                    val eligibleGroupIds = setOf(group.addonId)
                    val checkingGroup = LocalDebridAvailabilityService.markChecking(
                        groups = listOf(group),
                        eligibleGroupIds = eligibleGroupIds,
                    ).firstOrNull() ?: group
                    val availabilityGroup = LocalDebridAvailabilityService.annotateCachedAvailability(
                        groups = listOf(checkingGroup),
                        eligibleGroupIds = eligibleGroupIds,
                    ).firstOrNull() ?: checkingGroup
                    DebridStreamPresentation.apply(
                        groups = listOf(availabilityGroup),
                        settings = key.settings,
                    ).firstOrNull() ?: availabilityGroup
                }
            }.awaitAll()
        }.let { groups ->
            StreamAutoPlaySelector.orderAddonStreams(
                groups = groups,
                installedOrder = targets.map { it.addonName },
            )
        }

        var preparedGroups = orderedGroups

        PlayerSettingsRepository.ensureLoaded()
        DirectDebridStreamPreparer.prepare(
            streams = preparedGroups.flatMap { it.streams },
            season = key.season,
            episode = key.episode,
            playerSettings = PlayerSettingsRepository.uiState.value,
            installedAddonNames = targets.map { it.addonName }.toSet(),
        ) { original, prepared ->
            preparedGroups = DirectDebridStreamPreparer.replacePreparedStream(
                groups = preparedGroups,
                original = original,
                prepared = prepared,
                eligibleGroupIds = addonIds,
            )
        }

        return preparedGroups
    }

    private suspend fun fetchAddonStreams(
        target: AddonStreamWarmupTarget,
        type: String,
        videoId: String,
    ): AddonStreamGroup {
        val url = buildAddonResourceUrl(
            manifestUrl = target.manifest.transportUrl,
            resource = "stream",
            type = type,
            id = videoId,
        )
        return runCatchingUnlessCancelled {
            val payload = httpGetText(url)
            StreamParser.parse(
                payload = payload,
                addonName = target.addonName,
                addonId = target.addonId,
            )
        }.fold(
            onSuccess = { streams ->
                AddonStreamGroup(
                    addonName = target.addonName,
                    addonId = target.addonId,
                    streams = streams,
                    isLoading = false,
                )
            },
            onFailure = { error ->
                log.d(error) { "Failed to warm addon stream target ${target.addonName}" }
                AddonStreamGroup(
                    addonName = target.addonName,
                    addonId = target.addonId,
                    streams = emptyList(),
                    isLoading = false,
                    error = error.message,
                )
            },
        )
    }

    private fun currentKey(type: String, videoId: String, season: Int?, episode: Int?): AddonStreamWarmupKey? {
        val normalizedType = type.trim().lowercase()
        val normalizedVideoId = videoId.trim()
        if (normalizedType.isBlank() || normalizedVideoId.isBlank()) return null

        DebridSettingsRepository.ensureLoaded()
        val settings = DebridSettingsRepository.snapshot()
        if (!settings.canResolvePlayableLinks || settings.torboxApiKey.isBlank()) return null

        AddonRepository.initialize()
        val addonTargets = AddonRepository.uiState.value.addons
            .enabledAddons()
            .mapNotNull { addon -> addon.toWarmupTarget(normalizedType, normalizedVideoId) }
        if (addonTargets.isEmpty()) return null

        return AddonStreamWarmupKey(
            type = normalizedType,
            videoId = normalizedVideoId,
            season = season,
            episode = episode,
            addonFingerprint = addonTargets.joinToString("|") { it.fingerprint },
            settingsFingerprint = settings.warmupFingerprint(),
            settings = settings,
            addonTargets = addonTargets,
        )
    }

    private fun cachedGroupsLocked(key: AddonStreamWarmupKey): List<AddonStreamGroup>? {
        val cached = cache[key] ?: return null
        val age = epochMs() - cached.createdAtMs
        return if (age in 0..ADDON_STREAM_WARMUP_CACHE_TTL_MS) {
            cached.groups
        } else {
            cache.remove(key)
            null
        }
    }
}

private data class AddonStreamWarmupKey(
    val type: String,
    val videoId: String,
    val season: Int?,
    val episode: Int?,
    val addonFingerprint: String,
    val settingsFingerprint: String,
    val settings: DebridSettings,
    val addonTargets: List<AddonStreamWarmupTarget>,
)

private data class AddonStreamWarmupTarget(
    val addonName: String,
    val addonId: String,
    val manifest: AddonManifest,
    val fingerprint: String,
)

private data class CachedAddonStreamWarmup(
    val groups: List<AddonStreamGroup>,
    val createdAtMs: Long,
)

private fun ManagedAddon.toWarmupTarget(type: String, videoId: String): AddonStreamWarmupTarget? {
    val manifest = manifest ?: return null
    val supportsRequestedStream = manifest.resources.any { resource ->
        resource.name == "stream" &&
            resource.types.contains(type) &&
            (resource.idPrefixes.isEmpty() || resource.idPrefixes.any { videoId.startsWith(it) })
    }
    if (!supportsRequestedStream) return null

    val addonName = displayTitle.ifBlank { manifest.name }
    return AddonStreamWarmupTarget(
        addonName = addonName,
        addonId = "addon:${manifest.id}:$manifestUrl",
        manifest = manifest,
        fingerprint = "$manifestUrl:${manifest.id}:${manifest.version}:$addonName",
    )
}

private fun DebridSettings.warmupFingerprint(): String =
    listOf(
        enabled,
        torboxApiKey,
        instantPlaybackPreparationLimit,
        streamMaxResults,
        streamSortMode,
        streamMinimumQuality,
        streamDolbyVisionFilter,
        streamHdrFilter,
        streamCodecFilter,
        streamPreferences,
        streamNameTemplate,
        streamDescriptionTemplate,
    ).joinToString("|")

private suspend fun <T> runCatchingUnlessCancelled(block: suspend () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
