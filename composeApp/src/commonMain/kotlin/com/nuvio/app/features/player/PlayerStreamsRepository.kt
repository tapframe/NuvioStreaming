package com.nuvio.app.features.player

import co.touchlab.kermit.Logger
import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.buildAddonResourceUrl
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.debrid.DirectDebridStreamPreparer
import com.nuvio.app.features.debrid.DirectDebridStreamSource
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.plugins.pluginContentId
import com.nuvio.app.features.plugins.PluginRuntimeResult
import com.nuvio.app.features.plugins.PluginScraper
import com.nuvio.app.features.streams.AddonStreamGroup
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.StreamParser
import com.nuvio.app.features.streams.StreamsUiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Dedicated stream fetcher for use inside the player (sources & episodes panels).
 * Uses its own state so it doesn't interfere with the main [StreamsRepository].
 */
object PlayerStreamsRepository {
    private val log = Logger.withTag("PlayerStreamsRepo")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    // source panel
    private val _sourceState = MutableStateFlow(StreamsUiState())
    val sourceState: StateFlow<StreamsUiState> = _sourceState.asStateFlow()
    private var sourceJob: Job? = null
    private var sourceRequestKey: String? = null

    // episode streams panel
    private val _episodeStreamsState = MutableStateFlow(StreamsUiState())
    val episodeStreamsState: StateFlow<StreamsUiState> = _episodeStreamsState.asStateFlow()
    private var episodeStreamsJob: Job? = null
    private var episodeStreamsRequestKey: String? = null

    fun loadSources(
        type: String,
        videoId: String,
        season: Int? = null,
        episode: Int? = null,
        forceRefresh: Boolean = false,
    ) {
        fetchStreams(
            type = type,
            videoId = videoId,
            season = season,
            episode = episode,
            forceRefresh = forceRefresh,
            stateFlow = _sourceState,
            requestKeyHolder = { sourceRequestKey },
            setRequestKey = { sourceRequestKey = it },
            jobHolder = { sourceJob },
            setJob = { sourceJob = it },
        )
    }

    fun loadEpisodeStreams(
        type: String,
        videoId: String,
        season: Int? = null,
        episode: Int? = null,
        forceRefresh: Boolean = false,
    ) {
        fetchStreams(
            type = type,
            videoId = videoId,
            season = season,
            episode = episode,
            forceRefresh = forceRefresh,
            stateFlow = _episodeStreamsState,
            requestKeyHolder = { episodeStreamsRequestKey },
            setRequestKey = { episodeStreamsRequestKey = it },
            jobHolder = { episodeStreamsJob },
            setJob = { episodeStreamsJob = it },
        )
    }

    fun selectSourceFilter(addonId: String?) {
        _sourceState.update { it.copy(selectedFilter = addonId) }
    }

    fun selectEpisodeStreamsFilter(addonId: String?) {
        _episodeStreamsState.update { it.copy(selectedFilter = addonId) }
    }

    fun clearEpisodeStreams() {
        episodeStreamsJob?.cancel()
        episodeStreamsRequestKey = null
        _episodeStreamsState.value = StreamsUiState()
    }

    fun clearAll() {
        sourceJob?.cancel()
        sourceRequestKey = null
        _sourceState.value = StreamsUiState()
        clearEpisodeStreams()
    }

    private fun fetchStreams(
        type: String,
        videoId: String,
        season: Int?,
        episode: Int?,
        forceRefresh: Boolean,
        stateFlow: MutableStateFlow<StreamsUiState>,
        requestKeyHolder: () -> String?,
        setRequestKey: (String?) -> Unit,
        jobHolder: () -> Job?,
        setJob: (Job) -> Unit,
    ) {
        val requestKey = "$type::$videoId::$season::$episode"
        val current = stateFlow.value
        if (
            !forceRefresh &&
            requestKeyHolder() == requestKey &&
            (current.groups.isNotEmpty() || current.emptyStateReason != null || current.isAnyLoading)
        ) {
            return
        }

        setRequestKey(requestKey)
        jobHolder()?.cancel()
        stateFlow.value = StreamsUiState()

        val embeddedStreams = MetaDetailsRepository.findEmbeddedStreams(videoId)
        if (embeddedStreams.isNotEmpty()) {
            log.d { "Using ${embeddedStreams.size} embedded streams for type=$type id=$videoId" }
            val group = AddonStreamGroup(
                addonName = embeddedStreams.first().addonName,
                addonId = "embedded",
                streams = embeddedStreams,
                isLoading = false,
            )
            stateFlow.value = StreamsUiState(
                groups = listOf(group),
                activeAddonIds = setOf("embedded"),
                isAnyLoading = false,
            )
            return
        }

        val installedAddons = AddonRepository.uiState.value.addons
        val installedAddonNames = installedAddons.map { it.displayTitle }.toSet()
        PlayerSettingsRepository.ensureLoaded()
        val playerSettings = PlayerSettingsRepository.uiState.value
        val debridTargets = DirectDebridStreamSource.configuredTargets()
        val pluginScrapers = if (AppFeaturePolicy.pluginsEnabled) {
            PluginRepository.initialize()
            PluginRepository.getEnabledScrapersForType(type)
        } else {
            emptyList()
        }

        if (installedAddons.isEmpty() && pluginScrapers.isEmpty() && debridTargets.isEmpty()) {
            stateFlow.value = StreamsUiState(
                isAnyLoading = false,
                emptyStateReason = com.nuvio.app.features.streams.StreamsEmptyStateReason.NoAddonsInstalled,
            )
            return
        }

        val streamAddons = installedAddons
            .mapNotNull { addon ->
                val manifest = addon.manifest ?: return@mapNotNull null
                val supportsRequestedStream = manifest.resources.any { resource ->
                    resource.name == "stream" &&
                        resource.types.contains(type) &&
                        (resource.idPrefixes.isEmpty() ||
                            resource.idPrefixes.any { videoId.startsWith(it) })
                }
                if (!supportsRequestedStream) return@mapNotNull null

                PlayerInstalledStreamAddonTarget(
                    addonName = addon.displayTitle.ifBlank { manifest.name },
                    addonId = addon.streamAddonInstanceId(manifest.id),
                    manifest = manifest,
                )
            }

        if (streamAddons.isEmpty() && pluginScrapers.isEmpty() && debridTargets.isEmpty()) {
            stateFlow.value = StreamsUiState(
                isAnyLoading = false,
                emptyStateReason = com.nuvio.app.features.streams.StreamsEmptyStateReason.NoCompatibleAddons,
            )
            return
        }

        val initialGroups = streamAddons.map { addon ->
            AddonStreamGroup(
                addonName = addon.addonName,
                addonId = addon.addonId,
                streams = emptyList(),
                isLoading = true,
            )
        } + pluginScrapers.map { scraper ->
            AddonStreamGroup(
                addonName = scraper.name,
                addonId = "plugin:${scraper.id}",
                streams = emptyList(),
                isLoading = true,
            )
        } + debridTargets.map { target ->
            AddonStreamGroup(
                addonName = target.addonName,
                addonId = target.addonId,
                streams = emptyList(),
                isLoading = true,
            )
        }
        stateFlow.value = StreamsUiState(
            groups = initialGroups,
            activeAddonIds = initialGroups.map { it.addonId }.toSet(),
            isAnyLoading = true,
        )

        val job = scope.launch {
            val addonJobs = streamAddons.map { addon ->
                async {
                    val url = buildAddonResourceUrl(
                        manifestUrl = addon.manifest.transportUrl,
                        resource = "stream",
                        type = type,
                        id = videoId,
                    )

                    val displayName = addon.addonName
                    runCatching {
                        val payload = httpGetText(url)
                        StreamParser.parse(payload, displayName, addon.addonId)
                    }.fold(
                        onSuccess = { streams ->
                            AddonStreamGroup(displayName, addon.addonId, streams, isLoading = false)
                        },
                        onFailure = { err ->
                            log.w(err) { "Failed: ${displayName}" }
                            AddonStreamGroup(displayName, addon.addonId, emptyList(), isLoading = false, error = err.message)
                        },
                    )
                }
            }

            val pluginJobs = pluginScrapers.map { scraper ->
                async {
                    PluginRepository.executeScraper(
                        scraper = scraper,
                        tmdbId = pluginContentId(
                            videoId = videoId,
                            season = season,
                            episode = episode,
                        ),
                        mediaType = type,
                        season = season,
                        episode = episode,
                    ).fold(
                        onSuccess = { results ->
                            AddonStreamGroup(
                                addonName = scraper.name,
                                addonId = "plugin:${scraper.id}",
                                streams = results.map { it.toStreamItem(scraper) },
                                isLoading = false,
                            )
                        },
                        onFailure = { err ->
                            log.w(err) { "Plugin scraper failed: ${scraper.name}" }
                            AddonStreamGroup(
                                addonName = scraper.name,
                                addonId = "plugin:${scraper.id}",
                                streams = emptyList(),
                                isLoading = false,
                                error = err.message,
                            )
                        },
                    )
                }
            }

            val debridJobs = debridTargets.map { target ->
                async {
                    DirectDebridStreamSource.fetchProviderStreams(
                        type = type,
                        videoId = videoId,
                        target = target,
                    )
                }
            }

            val jobs = addonJobs + pluginJobs + debridJobs
            var debridPreparationLaunched = false
            jobs.forEach { deferred ->
                val result = deferred.await()
                stateFlow.update { current ->
                    val updated = current.groups.map { g -> if (g.addonId == result.addonId) result else g }
                    val anyLoading = updated.any { it.isLoading }
                    current.copy(
                        groups = updated,
                        isAnyLoading = anyLoading,
                        emptyStateReason = if (!anyLoading && updated.all { it.streams.isEmpty() }) {
                            if (updated.all { !it.error.isNullOrBlank() }) {
                                com.nuvio.app.features.streams.StreamsEmptyStateReason.StreamFetchFailed
                            } else {
                                com.nuvio.app.features.streams.StreamsEmptyStateReason.NoStreamsFound
                            }
                        } else null,
                    )
                }
                if (!debridPreparationLaunched && result.streams.any { it.isDirectDebridStream }) {
                    debridPreparationLaunched = true
                    launch {
                        DirectDebridStreamPreparer.prepare(
                            streams = stateFlow.value.groups.flatMap { it.streams },
                            season = season,
                            episode = episode,
                            playerSettings = playerSettings,
                            installedAddonNames = installedAddonNames,
                        ) { original, prepared ->
                            stateFlow.update { current ->
                                current.copy(
                                    groups = DirectDebridStreamPreparer.replacePreparedStream(
                                        groups = current.groups,
                                        original = original,
                                        prepared = prepared,
                                    ),
                                )
                            }
                        }
                    }
                }
            }
        }
        setJob(job)
    }
}

private data class PlayerInstalledStreamAddonTarget(
    val addonName: String,
    val addonId: String,
    val manifest: com.nuvio.app.features.addons.AddonManifest,
)

private fun com.nuvio.app.features.addons.ManagedAddon.streamAddonInstanceId(manifestId: String): String =
    "addon:$manifestId:$manifestUrl"

private fun PluginRuntimeResult.toStreamItem(scraper: PluginScraper): StreamItem {
    val subtitleParts = listOfNotNull(
        quality?.takeIf { it.isNotBlank() },
        size?.takeIf { it.isNotBlank() },
        language?.takeIf { it.isNotBlank() },
    )
    val requestHeaders = headers
        .orEmpty()
        .mapNotNull { (key, value) ->
            val headerName = key.trim()
            val headerValue = value.trim()
            if (headerName.isBlank() || headerValue.isBlank() || headerName.equals("Range", ignoreCase = true)) {
                null
            } else {
                headerName to headerValue
            }
        }
        .toMap()

    return StreamItem(
        name = name ?: title,
        description = subtitleParts.joinToString(" • ").ifBlank { null },
        url = url,
        infoHash = infoHash,
        addonName = scraper.name,
        addonId = "plugin:${scraper.id}",
        behaviorHints = if (requestHeaders.isEmpty()) {
            com.nuvio.app.features.streams.StreamBehaviorHints()
        } else {
            com.nuvio.app.features.streams.StreamBehaviorHints(
                notWebReady = true,
                proxyHeaders = com.nuvio.app.features.streams.StreamProxyHeaders(request = requestHeaders),
            )
        },
    )
}
