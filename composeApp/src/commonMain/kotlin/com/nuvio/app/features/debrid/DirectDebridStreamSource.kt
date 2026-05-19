package com.nuvio.app.features.debrid

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.streams.AddonStreamGroup
import com.nuvio.app.features.streams.StreamClientResolve
import com.nuvio.app.features.streams.StreamClientResolveParsed
import com.nuvio.app.features.streams.StreamClientResolveRaw
import com.nuvio.app.features.streams.StreamClientResolveStream
import com.nuvio.app.features.streams.StreamItem
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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

private const val DIRECT_DEBRID_TAG = "DirectDebridStreams"
private const val STREAM_CACHE_TTL_MS = 30L * 60L * 1000L
private const val TORBOX_STREMIO_BASE_URL = "https://stremio.torbox.app"

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
        if (!settings.enabled) return emptyList()
        val directDebridConfigured = DebridConfig.DIRECT_DEBRID_API_BASE_URL.isNotBlank()
        return DebridProviders.configuredServices(settings).map { credential ->
            DirectDebridStreamTarget(
                provider = credential.provider,
                apiKey = credential.apiKey,
            )
        }.filter { target ->
            directDebridConfigured || target.provider.id == DebridProviders.TORBOX_ID
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

    suspend fun fetchStreams(
        type: String,
        videoId: String,
        season: Int? = null,
        episode: Int? = null,
        searchQuery: String? = null,
    ): DirectDebridStreamFetchResult {
        val targets = configuredTargets()
        if (targets.isEmpty()) return DirectDebridStreamFetchResult.Disabled

        val results = mutableListOf<AddonStreamGroup>()
        val errors = mutableListOf<String>()
        targets.forEach { target ->
            val group = fetchProviderStreams(type, videoId, target, season, episode, searchQuery)
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
        season: Int? = null,
        episode: Int? = null,
        searchQuery: String? = null,
    ): AddonStreamGroup {
        val settings = DebridSettingsRepository.snapshot()
        val baseUrl = DebridConfig.DIRECT_DEBRID_API_BASE_URL.trim().trimEnd('/')
        val canUseTorboxSearch = baseUrl.isBlank() && target.provider.id == DebridProviders.TORBOX_ID
        if (!settings.enabled || (baseUrl.isBlank() && !canUseTorboxSearch)) {
            return target.emptyGroup()
        }
        val torboxSearchRequest = if (canUseTorboxSearch) {
            TorboxSearchRequest.from(videoId, season, episode)
        } else {
            null
        }

        val cacheKey = DirectDebridStreamCacheKey(
            providerId = target.provider.id,
            type = type.trim().lowercase(),
            videoId = torboxSearchRequest?.imdbId ?: videoId.trim(),
            season = torboxSearchRequest?.season ?: season,
            episode = torboxSearchRequest?.episode ?: episode,
            source = if (canUseTorboxSearch) "torbox-search" else baseUrl,
            searchQuery = searchQuery.orEmpty().trim(),
            settingsFingerprint = settings.toString(),
        )
        cachedGroup(cacheKey)?.let { return it }

        var ownsFetch = false
        val newFetch = scope.async(start = CoroutineStart.LAZY) {
            fetchProviderStreamsUncached(
                baseUrl = baseUrl,
                type = type,
                videoId = torboxSearchRequest?.imdbId ?: videoId,
                target = target,
                settings = settings,
                season = torboxSearchRequest?.season ?: season,
                episode = torboxSearchRequest?.episode ?: episode,
                searchQuery = searchQuery,
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
        season: Int?,
        episode: Int?,
        searchQuery: String?,
    ): AddonStreamGroup {
        if (baseUrl.isBlank() && target.provider.id == DebridProviders.TORBOX_ID) {
            return fetchTorboxSearchStreams(
                type = type,
                videoId = videoId,
                target = target,
                settings = settings,
                season = season,
                episode = episode,
                searchQuery = searchQuery,
            )
        }

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

    private suspend fun fetchTorboxSearchStreams(
        type: String,
        videoId: String,
        target: DirectDebridStreamTarget,
        settings: DebridSettings,
        season: Int?,
        episode: Int?,
        searchQuery: String?,
    ): AddonStreamGroup {
        val request = TorboxSearchRequest.from(videoId, season, episode)
        val imdbId = request.imdbId.takeIf { it.startsWith("tt", ignoreCase = true) }
            ?: return target.errorGroup("TorBox Search requires an IMDb id")
        val requestSeason = request.season
        val requestEpisode = request.episode
        return try {
            val stremioStreams = fetchTorboxStremioStreams(
                type = type,
                videoId = videoId,
                target = target,
            )
            if (stremioStreams.isNotEmpty()) {
                return AddonStreamGroup(
                    addonName = target.addonName,
                    addonId = target.addonId,
                    streams = stremioStreams,
                    isLoading = false,
                )
            }
            val fastResult = fetchTorboxSearchAttempt(
                source = TorboxSearchSource.Imdb,
                type = type,
                videoId = imdbId,
                imdbId = imdbId,
                query = null,
                target = target,
                settings = settings,
                season = requestSeason,
                episode = requestEpisode,
                searchUserEngines = false,
            )
            val streams = when {
                fastResult.streams.isNotEmpty() -> fastResult.streams
                fastResult.error != null -> {
                    val fallbackResult = fetchTorboxSearchAttempt(
                        source = TorboxSearchSource.Imdb,
                        type = type,
                        videoId = imdbId,
                        imdbId = imdbId,
                        query = null,
                        target = target,
                        settings = settings,
                        season = requestSeason,
                        episode = requestEpisode,
                        searchUserEngines = true,
                    )
                    if (fallbackResult.streams.isNotEmpty()) fallbackResult.streams else return target.errorGroup(fallbackResult.error ?: fastResult.error)
                }
                else -> {
                    val fallbackResult = fetchTorboxSearchAttempt(
                        source = TorboxSearchSource.Imdb,
                        type = type,
                        videoId = imdbId,
                        imdbId = imdbId,
                        query = null,
                        target = target,
                        settings = settings,
                        season = requestSeason,
                        episode = requestEpisode,
                        searchUserEngines = true,
                    )
                    if (fallbackResult.error != null) return target.errorGroup(fallbackResult.error)
                    fallbackResult.streams.ifEmpty {
                        fetchTorboxSearchQueryFallback(
                            type = type,
                            videoId = imdbId,
                            query = searchQuery,
                            target = target,
                            settings = settings,
                            season = requestSeason,
                            episode = requestEpisode,
                        )
                    }
                }
            }
            if (streams.isEmpty()) {
                log.d {
                    "TorBox Search returned no cached streams for type=$type id=$imdbId season=$requestSeason episode=$requestEpisode"
                }
            }
            AddonStreamGroup(
                addonName = target.addonName,
                addonId = target.addonId,
                streams = streams,
                isLoading = false,
            )
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            log.w(error) { "TorBox Search stream fetch failed" }
            target.errorGroup(error.message)
        }
    }

    private suspend fun fetchTorboxStremioStreams(
        type: String,
        videoId: String,
        target: DirectDebridStreamTarget,
    ): List<StreamItem> {
        val startedAt = epochMs()
        val stremioType = if (type.equals("series", ignoreCase = true)) "series" else type
        val url = "$TORBOX_STREMIO_BASE_URL/${encodePathSegment(target.apiKey)}/stream/${encodePathSegment(stremioType)}/${encodePathSegment(videoId)}.json"
        return try {
            val payload = httpGetText(url)
            val streams = StreamParser.parse(
                payload = payload,
                addonName = target.addonName,
                addonId = target.addonId,
            ).map { stream ->
                stream.copy(
                    name = stream.name ?: target.addonName,
                    addonName = target.addonName,
                    addonId = target.addonId,
                    sourceName = stream.sourceName ?: target.addonName,
                )
            }
            log.d {
                "TorBox Stremio elapsed=${epochMs() - startedAt}ms streams=${streams.size}"
            }
            streams
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            log.w { "TorBox Stremio failed elapsed=${epochMs() - startedAt}ms message=${error.message}" }
            emptyList()
        }
    }

    private suspend fun fetchTorboxSearchQueryFallback(
        type: String,
        videoId: String,
        query: String?,
        target: DirectDebridStreamTarget,
        settings: DebridSettings,
        season: Int?,
        episode: Int?,
    ): List<StreamItem> {
        val normalizedQuery = buildTorboxSearchQuery(query, season, episode) ?: return emptyList()
        val fastResult = fetchTorboxSearchAttempt(
            source = TorboxSearchSource.Query,
            type = type,
            videoId = videoId,
            imdbId = null,
            query = normalizedQuery,
            target = target,
            settings = settings,
            season = season,
            episode = episode,
            searchUserEngines = false,
        )
        if (fastResult.streams.isNotEmpty()) return fastResult.streams
        val fallbackResult = fetchTorboxSearchAttempt(
            source = TorboxSearchSource.Query,
            type = type,
            videoId = videoId,
            imdbId = null,
            query = normalizedQuery,
            target = target,
            settings = settings,
            season = season,
            episode = episode,
            searchUserEngines = true,
        )
        return fallbackResult.streams
    }

    private suspend fun fetchTorboxSearchAttempt(
        source: TorboxSearchSource,
        type: String,
        videoId: String,
        imdbId: String?,
        query: String?,
        target: DirectDebridStreamTarget,
        settings: DebridSettings,
        season: Int?,
        episode: Int?,
        searchUserEngines: Boolean,
    ): TorboxSearchAttemptResult {
        val startedAt = epochMs()
        val response = when (source) {
            TorboxSearchSource.Imdb -> TorboxApiClient.searchTorrents(
                apiKey = target.apiKey,
                imdbId = imdbId.orEmpty(),
                season = season,
                episode = episode,
                searchUserEngines = searchUserEngines,
            )
            TorboxSearchSource.Query -> TorboxApiClient.searchTorrentsByQuery(
                apiKey = target.apiKey,
                query = query.orEmpty(),
                season = season,
                episode = episode,
                searchUserEngines = searchUserEngines,
            )
        }
        val elapsedMs = epochMs() - startedAt
        if (!response.isSuccessful) {
            val message = response.body?.error ?: response.body?.detail ?: "HTTP ${response.status}"
            log.w { "TorBox Search ${source.logName} failed userEngines=$searchUserEngines elapsed=${elapsedMs}ms message=$message" }
            return TorboxSearchAttemptResult(error = message)
        }
        val data = response.body?.data
        val rawTorrents = data?.torrents.orEmpty()
        val mappedStreams = rawTorrents
            .mapNotNull { torrent ->
                torrent.toStreamItem(
                    addonName = target.addonName,
                    addonId = target.addonId,
                    mediaType = type,
                    mediaId = videoId,
                    season = season,
                    episode = episode,
                    fallbackCached = data?.cached,
                )
            }
        val instantStreams = mappedStreams.filter(DirectDebridStreamFilter::isInstantCandidate)
        val streams = DirectDebridStreamFilter.filterInstant(mappedStreams, settings)
            .map { stream -> formatter.format(stream, settings) }
        log.d {
            "TorBox Search ${source.logName} userEngines=$searchUserEngines elapsed=${elapsedMs}ms raw=${rawTorrents.size} mapped=${mappedStreams.size} instant=${instantStreams.size} streams=${streams.size}"
        }
        return TorboxSearchAttemptResult(streams = streams)
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
    val season: Int?,
    val episode: Int?,
    val source: String,
    val searchQuery: String,
    val settingsFingerprint: String,
)

private data class CachedDirectDebridStreams(
    val group: AddonStreamGroup,
    val createdAtMs: Long,
)

private data class TorboxSearchAttemptResult(
    val streams: List<StreamItem> = emptyList(),
    val error: String? = null,
)

private enum class TorboxSearchSource(val logName: String) {
    Imdb("imdb"),
    Query("query"),
}

private data class TorboxSearchRequest(
    val imdbId: String,
    val season: Int?,
    val episode: Int?,
) {
    companion object {
        fun from(videoId: String, season: Int?, episode: Int?): TorboxSearchRequest {
            val parts = videoId.trim().split(':')
            return TorboxSearchRequest(
                imdbId = parts.firstOrNull().orEmpty(),
                season = season ?: parts.getOrNull(1)?.toIntOrNull(),
                episode = episode ?: parts.getOrNull(2)?.toIntOrNull(),
            )
        }
    }
}

private fun buildTorboxSearchQuery(query: String?, season: Int?, episode: Int?): String? {
    val base = query?.trim()?.takeIf { it.isNotBlank() } ?: return null
    val episodeSuffix = if (season != null && episode != null) {
        " S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}"
    } else {
        ""
    }
    return "$base$episodeSuffix"
}

internal fun TorboxSearchTorrentDto.toStreamItem(
    addonName: String,
    addonId: String,
    mediaType: String,
    mediaId: String,
    season: Int?,
    episode: Int?,
    fallbackCached: Boolean?,
): StreamItem? {
    val normalizedHash = hash?.trim()?.takeIf { it.isNotBlank() }
    val normalizedMagnet = magnet?.trim()?.takeIf { it.isNotBlank() }
    if (normalizedHash == null && normalizedMagnet == null) return null
    val displayTitle = rawTitle?.takeIf { it.isNotBlank() }
        ?: title?.takeIf { it.isNotBlank() }
        ?: parsed?.title?.takeIf { it.isNotBlank() }
        ?: normalizedHash
    val parsedSeason = season ?: parsed?.season ?: parsed?.seasons?.singleOrNull()
    val parsedEpisode = episode ?: parsed?.episode ?: parsed?.episodes?.singleOrNull()
    return StreamItem(
        name = displayTitle,
        title = displayTitle,
        description = displayTitle,
        addonName = addonName,
        addonId = addonId,
        sourceName = "TorBox Search",
        clientResolve = StreamClientResolve(
            type = "debrid",
            infoHash = normalizedHash,
            magnetUri = normalizedMagnet,
            torrentName = displayTitle,
            filename = displayTitle,
            mediaType = mediaType,
            mediaId = mediaId,
            mediaOnlyId = mediaId.substringBefore(':'),
            title = parsed?.title ?: title,
            season = parsedSeason,
            episode = parsedEpisode,
            service = DebridProviders.TORBOX_ID,
            serviceExtension = DebridProviders.Torbox.shortName,
            isCached = cached ?: fallbackCached ?: true,
            stream = StreamClientResolveStream(
                raw = StreamClientResolveRaw(
                    torrentName = displayTitle,
                    filename = displayTitle,
                    size = size,
                    folderSize = size,
                    tracker = tracker,
                    parsed = StreamClientResolveParsed(
                        rawTitle = rawTitle,
                        parsedTitle = parsed?.title,
                        year = parsed?.year,
                        resolution = parsed?.resolution,
                        seasons = parsed?.seasons.ifEmptyOr(parsedSeason),
                        episodes = parsed?.episodes.ifEmptyOr(parsedEpisode),
                        quality = parsed?.quality,
                        hdr = parsed?.hdr.stringListValue(),
                        codec = parsed?.codec,
                        audio = parsed?.audio.stringListValue(),
                        channels = parsed?.channels.stringListValue(),
                        languages = parsed?.languages.stringListValue(),
                        group = parsed?.group,
                        bitDepth = parsed?.bitDepth?.toString(),
                    ),
                ),
            ),
        ),
    )
}

private fun List<Int>?.ifEmptyOr(value: Int?): List<Int> =
    this?.takeIf { it.isNotEmpty() } ?: listOfNotNull(value)

private fun JsonElement?.stringListValue(): List<String> =
    when (this) {
        is JsonArray -> mapNotNull { element ->
            element.jsonPrimitive.contentOrNull?.trim()?.takeIf { it.isNotBlank() }
        }
        is JsonPrimitive -> contentOrNull
            ?.split(',', '|')
            ?.map { it.trim() }
            ?.filter { it.isNotBlank() }
            .orEmpty()
        else -> emptyList()
    }

sealed class DirectDebridStreamFetchResult {
    data object Disabled : DirectDebridStreamFetchResult()
    data object Empty : DirectDebridStreamFetchResult()
    data class Success(val streams: List<AddonStreamGroup>) : DirectDebridStreamFetchResult()
    data class Error(val message: String) : DirectDebridStreamFetchResult()
}
