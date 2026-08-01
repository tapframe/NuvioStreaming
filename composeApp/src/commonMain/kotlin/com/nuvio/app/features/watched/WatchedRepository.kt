package com.nuvio.app.features.watched

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.tracking.ensureTrackingProvidersRegistered
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingProviderRegistry
import com.nuvio.app.features.tracking.TrackingSettingsRepository
import com.nuvio.app.features.tracking.WatchProgressSource
import com.nuvio.app.features.tracking.effectiveWatchProgressSource
import com.nuvio.app.features.tracking.providerId
import com.nuvio.app.features.watching.sync.SupabaseWatchedSyncAdapter
import com.nuvio.app.features.watching.sync.WatchedDeltaEvent
import com.nuvio.app.features.watching.sync.WatchedSyncAdapter
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
private data class StoredWatchedPayload(
    val items: List<WatchedItem> = emptyList(),
    val fullyWatchedSeriesKeys: Set<String> = emptySet(),
    val expandedSiblingKeys: Set<String> = emptySet(),
    val lastSuccessfulPushEpochMs: Long = 0L,
    val deltaCursorEventId: Long = 0L,
    val deltaInitialized: Boolean = false,
    val dirtyWatchedKeys: Set<String> = emptySet(),
)

internal enum class WatchedTrackerHistorySync {
    Mirror,
    Skip,
}

internal data class WatchedPushOutcome(
    val nuvioSyncSucceeded: Boolean = false,
    val succeededTrackerProviderIds: Set<TrackingProviderId> = emptySet(),
)

internal fun shouldMirrorWatchedMarkToTrackers(
    sync: WatchedTrackerHistorySync,
    hasConnectedTracker: Boolean,
): Boolean = sync == WatchedTrackerHistorySync.Mirror && hasConnectedTracker

internal data class WatchedSourceOperation(
    val source: WatchProgressSource,
    val generation: Long,
)

internal fun isWatchedSourceOperationCurrent(
    operation: WatchedSourceOperation,
    activeSource: WatchProgressSource,
    activeGeneration: Long,
): Boolean = operation.source == activeSource && operation.generation == activeGeneration

internal fun watchedItemsForSource(
    source: WatchProgressSource,
    nuvioItems: Collection<WatchedItem>,
    providerItems: Map<TrackingProviderId, Collection<WatchedItem>>,
): Collection<WatchedItem> = source.providerId
    ?.let { providerId -> providerItems[providerId].orEmpty() }
    ?: nuvioItems

internal fun shouldPersistWatchedSource(source: WatchProgressSource): Boolean =
    source.providerId == null

internal fun shouldAcknowledgeNuvioWatchedPush(
    source: WatchProgressSource,
    outcome: WatchedPushOutcome,
): Boolean = shouldPersistWatchedSource(source) && outcome.nuvioSyncSucceeded

internal fun replaceWatchedItemsForSource(
    source: WatchProgressSource,
    nuvioItems: MutableMap<String, WatchedItem>,
    providerItems: MutableMap<TrackingProviderId, MutableMap<String, WatchedItem>>,
    replacement: Map<String, WatchedItem>,
) {
    val target = source.providerId
        ?.let { providerId -> providerItems.getOrPut(providerId, ::mutableMapOf) }
        ?: nuvioItems
    target.clear()
    target.putAll(replacement)
}

object WatchedRepository {
    private data class WatchedRefreshOperation(
        val profileId: Int,
        val profileGeneration: Long,
        val sourceOperation: WatchedSourceOperation,
    )

    private const val watchedItemsPageSize = 900
    private const val watchedItemsDeltaPageSize = 900
    private const val watchedDeltaOperationUpsert = "upsert"
    private const val watchedDeltaOperationDelete = "delete"
    private const val watchedDiagnosticSampleLimit = 10

    private val accountScopeLock = SynchronizedObject()
    private var accountScopeJob: Job = SupervisorJob()
    private var accountScope = CoroutineScope(accountScopeJob + Dispatchers.Default)
    private val log = Logger.withTag("WatchedRepository")
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(WatchedUiState())
    val uiState: StateFlow<WatchedUiState> = _uiState.asStateFlow()
    private val _fullyWatchedSeriesKeys = MutableStateFlow<Set<String>>(emptySet())
    val fullyWatchedSeriesKeys: StateFlow<Set<String>> = _fullyWatchedSeriesKeys.asStateFlow()

    private var hasLoaded = false
    private var currentProfileId: Int = 1
    private var profileGeneration: Long = 0L
    private var activeSource: WatchProgressSource = WatchProgressSource.NUVIO_SYNC
    private var sourceGeneration: Long = 0L
    private var nuvioItemsByKey: MutableMap<String, WatchedItem> = mutableMapOf()
    private var providerItemsByKey: MutableMap<TrackingProviderId, MutableMap<String, WatchedItem>> = mutableMapOf()
    private var nuvioFullyWatchedSeriesKeys: Set<String> = emptySet()
    private var providerFullyWatchedSeriesKeys: MutableMap<TrackingProviderId, Set<String>> = mutableMapOf()
    private var expandedSiblingKeys: Set<String> = emptySet()
    private var providerExtraWatchedKeys: MutableMap<TrackingProviderId, Set<String>> = mutableMapOf()
    private var nuvioHasLoaded: Boolean = false
    private var loadedProviders: MutableSet<TrackingProviderId> = mutableSetOf()
    private var nuvioHasLoadedRemote: Boolean = false
    private var providersLoadedFromRemote: MutableSet<TrackingProviderId> = mutableSetOf()
    private var nuvioDirtyWatchedKeys: MutableSet<String> = mutableSetOf()
    private var lastSuccessfulPushEpochMs: Long = 0L
    private var deltaCursorEventId: Long = 0L
    private var deltaInitialized: Boolean = false
    internal var syncAdapter: WatchedSyncAdapter = SupabaseWatchedSyncAdapter
    private var extraKeysObserverJob: Job? = null

    fun ensureLoaded() {
        ensureTrackingProvidersRegistered()
        TrackingProviderRegistry.ensureLoaded()
        TrackingSettingsRepository.ensureLoaded()
        if (!hasLoaded) {
            loadFromDisk(ProfileRepository.activeProfileId)
            activateEffectiveSource(
                effectiveWatchedSource(
                    requestedSource = TrackingSettingsRepository.uiState.value.watchProgressSource,
                    connectedProviderIds = connectedWatchedProviderIds(),
                ),
            )
        }
        startExtraKeysObserverIfNeeded()
    }

    fun onProfileChanged(profileId: Int) {
        if (profileId == currentProfileId && hasLoaded) return
        loadFromDisk(profileId)
    }

    fun clearLocalState() {
        val previousAccountJob = synchronized(accountScopeLock) {
            accountScopeJob.also {
                accountScopeJob = SupervisorJob()
                accountScope = CoroutineScope(accountScopeJob + Dispatchers.Default)
            }
        }
        previousAccountJob.cancel()
        extraKeysObserverJob = null
        hasLoaded = false
        currentProfileId = 1
        profileGeneration += 1L
        activeSource = WatchProgressSource.NUVIO_SYNC
        sourceGeneration += 1L
        nuvioItemsByKey.clear()
        providerItemsByKey.clear()
        nuvioFullyWatchedSeriesKeys = emptySet()
        providerFullyWatchedSeriesKeys.clear()
        expandedSiblingKeys = emptySet()
        providerExtraWatchedKeys.clear()
        nuvioHasLoaded = false
        loadedProviders.clear()
        nuvioHasLoadedRemote = false
        providersLoadedFromRemote.clear()
        nuvioDirtyWatchedKeys.clear()
        lastSuccessfulPushEpochMs = 0L
        deltaCursorEventId = 0L
        deltaInitialized = false
        _fullyWatchedSeriesKeys.value = emptySet()
        _uiState.value = WatchedUiState()
    }

    private fun loadFromDisk(profileId: Int) {
        currentProfileId = profileId
        profileGeneration += 1L
        activeSource = WatchProgressSource.NUVIO_SYNC
        sourceGeneration += 1L
        hasLoaded = true
        nuvioItemsByKey.clear()
        providerItemsByKey.clear()
        nuvioFullyWatchedSeriesKeys = emptySet()
        providerFullyWatchedSeriesKeys.clear()
        expandedSiblingKeys = emptySet()
        providerExtraWatchedKeys.clear()
        nuvioHasLoaded = true
        loadedProviders.clear()
        nuvioHasLoadedRemote = false
        providersLoadedFromRemote.clear()
        nuvioDirtyWatchedKeys.clear()

        val payload = WatchedStorage.loadPayload(profileId).orEmpty().trim()
        if (payload.isNotEmpty()) {
            val storedPayload = runCatching {
                json.decodeFromString<StoredWatchedPayload>(payload)
            }.getOrDefault(StoredWatchedPayload())
            lastSuccessfulPushEpochMs = storedPayload.lastSuccessfulPushEpochMs
            deltaCursorEventId = storedPayload.deltaCursorEventId
            deltaInitialized = storedPayload.deltaInitialized
            nuvioItemsByKey = storedPayload.items
                .map(WatchedItem::normalizedMarkedAt)
                .associateBy { watchedItemKey(it.type, it.id, it.season, it.episode) }
                .toMutableMap()
            nuvioDirtyWatchedKeys = storedPayload.dirtyWatchedKeys
                .filterTo(mutableSetOf()) { key -> key in nuvioItemsByKey }
            nuvioFullyWatchedSeriesKeys = storedPayload.fullyWatchedSeriesKeys
            expandedSiblingKeys = storedPayload.expandedSiblingKeys
        } else {
            lastSuccessfulPushEpochMs = 0L
            deltaCursorEventId = 0L
            deltaInitialized = false
            nuvioDirtyWatchedKeys.clear()
            nuvioFullyWatchedSeriesKeys = emptySet()
        }

        publish()
    }

    internal fun activateSource(source: WatchProgressSource): WatchProgressSource {
        if (!hasLoaded) {
            loadFromDisk(ProfileRepository.activeProfileId)
        }
        return activateEffectiveSource(source)
    }

    private fun activateEffectiveSource(source: WatchProgressSource): WatchProgressSource {
        if (activeSource == source) {
            log.i {
                "Watched source activation unchanged source=$source generation=$sourceGeneration " +
                    "items=${itemCountForSource(source)} loaded=${hasLoadedSource(source)}"
            }
            return source
        }
        val previousSource = activeSource
        source.providerId?.let { providerId ->
            providerItemsByKey.getOrPut(providerId, ::mutableMapOf).clear()
            providerFullyWatchedSeriesKeys[providerId] = emptySet()
            providerExtraWatchedKeys.remove(providerId)
            loadedProviders -= providerId
            providersLoadedFromRemote -= providerId
        } ?: run {
            nuvioHasLoadedRemote = false
        }
        activeSource = source
        sourceGeneration += 1L
        stopExtraKeysObserver()
        log.i {
            "Watched source activated previous=$previousSource current=$source generation=$sourceGeneration " +
                "provider=${source.providerId?.storageId}"
        }
        publish()
        startExtraKeysObserverIfNeeded()
        return source
    }

    private fun newRefreshOperation(profileId: Int): WatchedRefreshOperation? {
        if (ProfileRepository.activeProfileId != profileId) return null
        if (!hasLoaded || currentProfileId != profileId) return null
        return WatchedRefreshOperation(
            profileId = profileId,
            profileGeneration = profileGeneration,
            sourceOperation = WatchedSourceOperation(
                source = activeSource,
                generation = sourceGeneration,
            ),
        )
    }

    private fun isActiveOperation(operation: WatchedRefreshOperation): Boolean =
        currentProfileId == operation.profileId &&
            profileGeneration == operation.profileGeneration &&
            ProfileRepository.activeProfileId == operation.profileId &&
            isWatchedSourceOperationCurrent(
                operation = operation.sourceOperation,
                activeSource = activeSource,
                activeGeneration = sourceGeneration,
            )

    suspend fun pullFromServer(profileId: Int) {
        TrackingProviderRegistry.ensureLoaded()
        TrackingSettingsRepository.ensureLoaded()
        refreshForSource(
            profileId = profileId,
            source = effectiveWatchedSource(
                requestedSource = TrackingSettingsRepository.uiState.value.watchProgressSource,
                connectedProviderIds = connectedWatchedProviderIds(),
            ),
            forceSnapshot = false,
        )
    }

    suspend fun forceSnapshotRefreshFromServer(profileId: Int) {
        TrackingProviderRegistry.ensureLoaded()
        TrackingSettingsRepository.ensureLoaded()
        refreshForSource(
            profileId = profileId,
            source = effectiveWatchedSource(
                requestedSource = TrackingSettingsRepository.uiState.value.watchProgressSource,
                connectedProviderIds = connectedWatchedProviderIds(),
            ),
            forceSnapshot = true,
        )
    }

    internal suspend fun refreshForSource(
        profileId: Int,
        source: WatchProgressSource,
        forceSnapshot: Boolean = true,
    ): Boolean {
        TrackingProviderRegistry.ensureLoaded()
        TrackingSettingsRepository.ensureLoaded()
        if (ProfileRepository.activeProfileId != profileId) {
            log.d { "Skipping watched refresh for inactive profile $profileId" }
            return false
        }
        if (!hasLoaded || currentProfileId != profileId) {
            loadFromDisk(profileId)
        }

        val effectiveSource = activateEffectiveSource(source)
        val operation = newRefreshOperation(profileId) ?: return false
        log.i {
            "Watched refresh request profile=$profileId requestedSource=$source effectiveSource=$effectiveSource " +
                "forceSnapshot=$forceSnapshot profileGeneration=$profileGeneration " +
                "sourceGeneration=$sourceGeneration"
        }
        if (effectiveSource.providerId == null) {
            val authState = AuthRepository.state.value
            if (authState !is AuthState.Authenticated || authState.isAnonymous) {
                // Local watched state is authoritative when this account has no Nuvio upstream.
                nuvioHasLoaded = true
                nuvioHasLoadedRemote = true
                publish()
                return true
            }
        }
        return try {
            effectiveSource.providerId?.let { providerId ->
                val provider = TrackingProviderRegistry.watchedProvider(providerId)
                    ?: run {
                        log.w { "Watched provider missing provider=${providerId.storageId} source=$effectiveSource" }
                        return false
                    }
                pullSnapshotFromAdapter(
                    adapter = provider,
                    operation = operation,
                    profileId = profileId,
                    resetDeltaState = true,
                )
            } ?: if (forceSnapshot) {
                refreshNuvioSnapshot(
                    operation = operation,
                    profileId = profileId,
                )
            } else {
                pullSupabaseDeltaFromServer(
                    operation = operation,
                    profileId = profileId,
                )
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            log.e(error) { "Failed to refresh watched items from $effectiveSource" }
            false
        }
    }

    private suspend fun refreshNuvioSnapshot(
        operation: WatchedRefreshOperation,
        profileId: Int,
    ): Boolean {
        val cursorBeforeSnapshot = try {
            syncAdapter.getDeltaCursor(profileId)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            null
        }
        if (!isActiveOperation(operation)) return false

        val applied = pullSnapshotFromAdapter(
            adapter = syncAdapter,
            operation = operation,
            profileId = profileId,
            resetDeltaState = cursorBeforeSnapshot == null,
        )
        if (!applied || !isActiveOperation(operation)) return false
        if (cursorBeforeSnapshot != null) {
            deltaCursorEventId = cursorBeforeSnapshot
            deltaInitialized = true
            persistNuvio()
        }
        return true
    }

    private suspend fun pullSnapshotFromAdapter(
        adapter: WatchedSyncAdapter,
        operation: WatchedRefreshOperation,
        profileId: Int,
        resetDeltaState: Boolean,
    ): Boolean {
        val serverItems = adapter.pull(
            profileId = profileId,
            pageSize = watchedItemsPageSize,
        )
        val fullyWatchedSeriesKeys = adapter.pullFullyWatchedSeriesKeys(profileId)
        val source = operation.sourceOperation.source
        log.i {
            "Watched adapter result source=$source provider=${source.providerId?.storageId ?: "nuvio"} " +
                "profile=$profileId serverItems=${serverItems.size} " +
                "movies=${serverItems.count { it.type == "movie" }} " +
                "episodes=${serverItems.count { it.season != null && it.episode != null }} " +
                "seriesSummaries=${serverItems.count { it.type != "movie" && it.season == null }} " +
                "fullyWatchedSeries=${fullyWatchedSeriesKeys?.size} " +
                "itemKeys=[${diagnosticItemKeySample(serverItems)}] " +
                "fullyWatchedKeys=[${fullyWatchedSeriesKeys.orEmpty().take(watchedDiagnosticSampleLimit).joinToString(",")}]"
        }
        if (!isActiveOperation(operation)) {
            log.w {
                "Watched adapter result discarded source=$source profile=$profileId " +
                    "operationProfileGeneration=${operation.profileGeneration} currentProfileGeneration=$profileGeneration " +
                    "operationSourceGeneration=${operation.sourceOperation.generation} currentSourceGeneration=$sourceGeneration " +
                    "activeSource=$activeSource"
            }
            return false
        }
        val localAtApply = itemsForSource(operation.sourceOperation.source).values.toList()

        val mergedSnapshot = mergeWatchedSnapshot(
            serverItems = serverItems,
            localItems = localAtApply,
            dirtyKeys = if (operation.sourceOperation.source == WatchProgressSource.NUVIO_SYNC) {
                nuvioDirtyWatchedKeys
            } else {
                emptySet()
            },
        )
        replaceWatchedItemsForSource(
            source = operation.sourceOperation.source,
            nuvioItems = nuvioItemsByKey,
            providerItems = providerItemsByKey,
            replacement = mergedSnapshot.items,
        )
        fullyWatchedSeriesKeys?.let { keys ->
            setFullyWatchedSeriesKeysForSource(operation.sourceOperation.source, keys)
        }
        val extraWatchedKeys = adapter.pullExtraWatchedKeys(profileId)
        operation.sourceOperation.source.providerId?.let { providerId ->
            if (extraWatchedKeys.isNotEmpty()) {
                providerExtraWatchedKeys[providerId] = extraWatchedKeys
            }
            loadedProviders += providerId
            providersLoadedFromRemote += providerId
        } ?: run {
            nuvioDirtyWatchedKeys = mergedSnapshot.dirtyKeys.toMutableSet()
            nuvioHasLoaded = true
            nuvioHasLoadedRemote = true
            if (resetDeltaState) {
                deltaCursorEventId = 0L
                deltaInitialized = false
            }
        }
        publish()
        if (shouldPersistWatchedSource(operation.sourceOperation.source)) {
            persistNuvio()
        }
        return true
    }

    private suspend fun pullSupabaseDeltaFromServer(
        operation: WatchedRefreshOperation,
        profileId: Int,
    ): Boolean {
        if (!isActiveOperation(operation)) return false
        if (!deltaInitialized) {
            val cursorBeforeSnapshot = try {
                syncAdapter.getDeltaCursor(profileId)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                null
            }
            if (!isActiveOperation(operation)) return false
            if (cursorBeforeSnapshot == null) {
                return pullSnapshotFromAdapter(
                    adapter = syncAdapter,
                    operation = operation,
                    profileId = profileId,
                    resetDeltaState = true,
                )
            }
            val applied = pullSnapshotFromAdapter(
                adapter = syncAdapter,
                operation = operation,
                profileId = profileId,
                resetDeltaState = false,
            )
            if (!applied || !isActiveOperation(operation)) return false
            deltaCursorEventId = cursorBeforeSnapshot
            deltaInitialized = true
            persistNuvio()
            return true
        }

        var cursor = deltaCursorEventId
        var changed = false

        while (true) {
            val events = syncAdapter.pullDelta(
                profileId = profileId,
                sinceEventId = cursor,
                limit = watchedItemsDeltaPageSize,
            )
            if (!isActiveOperation(operation)) return false
            if (events.isEmpty()) break

            applyWatchedDeltaEvents(
                targetItems = nuvioItemsByKey,
                dirtyKeys = nuvioDirtyWatchedKeys,
                events = events,
            )
            cursor = maxOf(cursor, events.maxOf { it.eventId })
            deltaCursorEventId = cursor
            deltaInitialized = true
            changed = true

            if (events.size < watchedItemsDeltaPageSize) break
        }

        if (!isActiveOperation(operation)) return false
        nuvioHasLoaded = true
        val remoteReadinessChanged = !nuvioHasLoadedRemote
        nuvioHasLoadedRemote = true
        if (changed || remoteReadinessChanged) {
            publish()
        }
        if (changed) {
            persistNuvio()
        }
        return true
    }

    private fun applyWatchedDeltaEvents(
        targetItems: MutableMap<String, WatchedItem>,
        dirtyKeys: MutableSet<String>,
        events: Collection<WatchedDeltaEvent>,
    ) {
        var upsertCount = 0
        var deleteCount = 0
        var removedCount = 0
        var removedByFallbackKeyCount = 0
        var preservedDirtyCount = 0
        var acknowledgedDirtyCount = 0
        var ignoredCount = 0

        events.forEach { event ->
            val key = watchedItemKey(event.contentType, event.contentId, event.season, event.episode)
            when (event.operation.lowercase()) {
                watchedDeltaOperationUpsert -> {
                    upsertCount += 1
                    val remoteItem = WatchedItem(
                        id = event.contentId,
                        type = event.contentType,
                        name = event.title,
                        season = event.season,
                        episode = event.episode,
                        markedAtEpochMs = normalizeWatchedMarkedAtEpochMs(event.watchedAt),
                    )
                    val localItem = targetItems[key]?.normalizedMarkedAt()
                    if (
                        key in dirtyKeys &&
                        localItem != null &&
                        remoteItem.markedAtEpochMs < localItem.markedAtEpochMs
                    ) {
                        preservedDirtyCount += 1
                    } else {
                        targetItems[key] = remoteItem
                        if (dirtyKeys.remove(key)) {
                            acknowledgedDirtyCount += 1
                        }
                    }
                }
                watchedDeltaOperationDelete -> {
                    deleteCount += 1
                    val matchingKey = if (key in targetItems) {
                        key
                    } else {
                        findWatchedItemStableDeleteKey(
                            targetItems = targetItems,
                            contentId = event.contentId,
                            contentType = event.contentType,
                            season = event.season,
                            episode = event.episode,
                        )
                    }
                    if (matchingKey == null) {
                        return@forEach
                    }
                    if (matchingKey in dirtyKeys) {
                        preservedDirtyCount += 1
                        return@forEach
                    }
                    val removedItem = targetItems.remove(matchingKey)
                    if (removedItem != null) {
                        removedCount += 1
                        if (matchingKey != key) {
                            removedByFallbackKeyCount += 1
                        }
                    }
                }
                else -> {
                    ignoredCount += 1
                }
            }
        }

        log.i {
            "Applied watched delta events total=${events.size} upserts=$upsertCount deletes=$deleteCount " +
                "removed=$removedCount removedByFallbackKey=$removedByFallbackKeyCount " +
                "preservedDirty=$preservedDirtyCount acknowledgedDirty=$acknowledgedDirtyCount " +
                "ignored=$ignoredCount"
        }
    }

    private fun findWatchedItemStableDeleteKey(
        targetItems: Map<String, WatchedItem>,
        contentId: String,
        contentType: String,
        season: Int?,
        episode: Int?,
    ): String? = targetItems.entries.firstOrNull { (_, item) ->
        item.id == contentId &&
            watchedDeleteTypesCompatible(remoteType = contentType, localType = item.type) &&
            item.season == season &&
            item.episode == episode
    }?.key

    private fun watchedDeleteTypesCompatible(remoteType: String, localType: String): Boolean {
        if (remoteType.equals(localType, ignoreCase = true)) return true
        return remoteType.isSeriesLikeWatchedType() && localType.isSeriesLikeWatchedType()
    }

    private fun itemsForSource(source: WatchProgressSource): MutableMap<String, WatchedItem> =
        source.providerId
            ?.let { providerId -> providerItemsByKey.getOrPut(providerId, ::mutableMapOf) }
            ?: nuvioItemsByKey

    private fun fullyWatchedSeriesKeysForSource(source: WatchProgressSource): Set<String> =
        source.providerId
            ?.let { providerId -> providerFullyWatchedSeriesKeys[providerId].orEmpty() }
            ?: nuvioFullyWatchedSeriesKeys

    private fun setFullyWatchedSeriesKeysForSource(
        source: WatchProgressSource,
        keys: Set<String>,
    ) {
        source.providerId?.let { providerId ->
            providerFullyWatchedSeriesKeys[providerId] = keys
        } ?: run {
            nuvioFullyWatchedSeriesKeys = keys
        }
    }

    private fun hasLoadedSource(source: WatchProgressSource): Boolean =
        source.providerId?.let(loadedProviders::contains) ?: nuvioHasLoaded

    private fun itemCountForSource(source: WatchProgressSource): Int = source.providerId
        ?.let { providerId -> providerItemsByKey[providerId]?.size ?: 0 }
        ?: nuvioItemsByKey.size

    fun toggleWatched(item: WatchedItem) {
        ensureLoaded()
        val source = activeSource
        val targetItems = itemsForSource(source)
        val key = watchedItemKey(item.type, item.id, item.season, item.episode)
        if (targetItems.containsKey(key)) {
            unmarkWatched(item)
        } else {
            markWatched(item)
        }
    }

    fun markWatched(item: WatchedItem) {
        markWatched(listOf(item))
    }

    fun markWatched(items: Collection<WatchedItem>) {
        markWatched(items = items, trackerHistorySync = WatchedTrackerHistorySync.Mirror)
    }

    internal fun markWatchedFromPlaybackCompletion(item: WatchedItem, syncRemote: Boolean = true) {
        markWatched(
            items = listOf(item),
            trackerHistorySync = WatchedTrackerHistorySync.Skip,
            syncRemote = syncRemote,
        )
    }

    private fun markWatched(
        items: Collection<WatchedItem>,
        trackerHistorySync: WatchedTrackerHistorySync,
        syncRemote: Boolean = true,
    ) {
        ensureLoaded()
        if (items.isEmpty()) return
        val source = activeSource
        val targetItems = itemsForSource(source)
        val markedAt = WatchedClock.nowEpochMs()
        val timestampedItems = items.map { watchedItem ->
            watchedItem.copy(markedAtEpochMs = markedAt)
        }
        timestampedItems.forEach { watchedItem ->
            val key = watchedItemKey(watchedItem.type, watchedItem.id, watchedItem.season, watchedItem.episode)
            targetItems[key] = watchedItem
            if (source.providerId == null) {
                nuvioDirtyWatchedKeys += key
            }
        }
        publish()
        if (shouldPersistWatchedSource(source)) {
            persistNuvio()
        }
        if (syncRemote) {
            pushMarksToServer(
                items = timestampedItems,
                trackerHistorySync = trackerHistorySync,
                source = source,
            )
        }
    }

    fun unmarkWatched(item: WatchedItem) {
        unmarkWatched(listOf(item))
    }

    fun unmarkWatched(
        id: String,
        type: String,
        season: Int? = null,
        episode: Int? = null,
    ) {
        unmarkWatched(
            listOf(
                WatchedItem(
                    id = id,
                    type = type,
                    name = "",
                    season = season,
                    episode = episode,
                    markedAtEpochMs = 0L,
                ),
            ),
        )
    }

    fun unmarkWatched(items: Collection<WatchedItem>) {
        ensureLoaded()
        if (items.isEmpty()) return
        val source = activeSource
        val targetItems = itemsForSource(source)
        val removedItems = items.mapNotNull { watchedItem ->
            val key = watchedItemKey(watchedItem.type, watchedItem.id, watchedItem.season, watchedItem.episode)
            targetItems.remove(key)?.let { storeItem ->
                // Preserve videoId from the original request (store items don't have it)
                if (watchedItem.videoId != null && storeItem.videoId == null) {
                    storeItem.copy(videoId = watchedItem.videoId)
                } else {
                    storeItem
                }
            }?.also {
                if (source.providerId == null) {
                    nuvioDirtyWatchedKeys -= key
                }
                // Optimistically remove from extra keys so publish() doesn't re-add it
                source.providerId?.let { providerId ->
                    providerExtraWatchedKeys[providerId]?.let { extraKeys ->
                        if (key in extraKeys) {
                            providerExtraWatchedKeys[providerId] = extraKeys - key
                        }
                    }
                }
            }
        }
        if (removedItems.isNotEmpty()) {
            publish()
            if (shouldPersistWatchedSource(source)) {
                persistNuvio()
            }
            pushDeleteToServer(items = removedItems, source = source)
        } else if (source.providerId != null) {
            // Items not found in local store (e.g. anime resolved via snapshot fallback).
            // Still push delete to provider so it can remove from remote.
            // The observer on snapshot changes will re-pull items and update the store.
            pushDeleteToServer(items = items.toList(), source = source)
        }
    }

    fun isWatched(
        id: String,
        type: String,
        season: Int? = null,
        episode: Int? = null,
    ): Boolean {
        ensureLoaded()
        return itemsForSource(activeSource).containsKey(watchedItemKey(type, id, season, episode))
    }

    fun isFullyWatchedSeries(id: String, type: String): Boolean {
        val key = watchedItemKey(type, id)
        return _fullyWatchedSeriesKeys.value.contains(key)
    }

    fun reconcileSeriesWatchedState(
        meta: MetaDetails,
        todayIsoDate: String,
        isEpisodeCompleted: (com.nuvio.app.features.details.MetaVideo) -> Boolean = { false },
    ) {
        if (!meta.type.isSeriesLikeWatchedType()) return

        ensureLoaded()
        val shouldMarkSeriesWatched = reconcileFullyWatchedSeriesState(
            meta = meta,
            todayIsoDate = todayIsoDate,
            isEpisodeCompleted = isEpisodeCompleted,
        )
        val seriesWatchedItem = meta.toSeriesWatchedItem()
        val hasSeriesWatchedMarker = isWatched(id = meta.id, type = meta.type)
        log.i {
            "Watched series reconciliation source=$activeSource content=${meta.type}:${meta.id} " +
                "episodes=${meta.videos.size} shouldMarkSeries=$shouldMarkSeriesWatched " +
                "hasSeriesMarker=$hasSeriesWatchedMarker " +
                "matchingItems=${itemsForSource(activeSource).values.count { it.id == meta.id }}"
        }
        if (shouldMarkSeriesWatched) {
            if (!hasSeriesWatchedMarker) {
                markWatched(seriesWatchedItem)
            }
        } else if (hasSeriesWatchedMarker) {
            unmarkWatched(seriesWatchedItem)
        }
    }

    fun reconcileFullyWatchedSeriesState(
        meta: MetaDetails,
        todayIsoDate: String,
        isEpisodeWatched: (MetaVideo) -> Boolean = { episode ->
            val key = watchedItemKey(meta.type, meta.id, episode.season, episode.episode)
            if (key in _uiState.value.watchedKeys) {
                true
            } else {
                val episodeNumber = episode.episode
                if (episodeNumber != null) {
                    com.nuvio.app.features.simkl.SimklAnimeWatchedFallback.isWatched(episode.id, episodeNumber)
                } else {
                    false
                }
            }
        },
        isEpisodeCompleted: (MetaVideo) -> Boolean = { false },
    ): Boolean {
        if (!meta.type.isSeriesLikeWatchedType()) return false

        ensureLoaded()
        val shouldMarkSeriesWatched = meta.hasWatchedAllMainSeasonEpisodes(todayIsoDate) { episode ->
            isEpisodeWatched(episode) || isEpisodeCompleted(episode)
        }
        updateFullyWatchedSeriesKey(
            key = watchedItemKey(meta.type, meta.id),
            isFullyWatched = shouldMarkSeriesWatched,
        )
        return shouldMarkSeriesWatched
    }

    fun updateFullyWatchedSeries(
        id: String,
        type: String,
        isFullyWatched: Boolean,
    ) {
        if (!type.isSeriesLikeWatchedType()) return
        ensureLoaded()
        updateFullyWatchedSeriesKey(
            key = watchedItemKey(type, id),
            isFullyWatched = isFullyWatched,
        )
    }

    private fun updateFullyWatchedSeriesKey(
        key: String,
        isFullyWatched: Boolean,
    ) {
        val source = activeSource
        val current = fullyWatchedSeriesKeysForSource(source)
        val updated = if (isFullyWatched) current + key else current - key
        if (updated == current) return
        setFullyWatchedSeriesKeysForSource(source = source, keys = updated)
        publish()
        if (shouldPersistWatchedSource(source)) {
            persistNuvio()
        }
    }

    fun setExpandedFullyWatchedSeriesKeys(keys: Set<String>) {
        expandedSiblingKeys = keys
        publish()
        persistNuvio()
    }

    fun currentExpandedSiblingKeys(): Set<String> = expandedSiblingKeys

    /**
     * Returns the base fully-watched series keys from the active source,
     * without sibling expansion. Used by sibling expansion to avoid feedback loops.
     */
    fun baseFullyWatchedSeriesKeys(): Set<String> = fullyWatchedSeriesKeysForSource(activeSource)

    private fun pushMarksToServer(
        items: Collection<WatchedItem>,
        trackerHistorySync: WatchedTrackerHistorySync,
        source: WatchProgressSource,
    ) {
        val profileId = currentProfileId
        val operationGeneration = profileGeneration
        accountScopeSnapshot().launch {
            runCatching {
                if (items.isEmpty()) return@runCatching
                val outcome = pushToTargetsForSource(
                    profileId = profileId,
                    items = items,
                    trackerHistorySync = trackerHistorySync,
                    source = source,
                )
                if (shouldAcknowledgeNuvioWatchedPush(source = source, outcome = outcome)) {
                    recordSuccessfulPush(
                        profileId = profileId,
                        operationGeneration = operationGeneration,
                        items = items,
                    )
                }
            }.onFailure { e ->
                log.e(e) { "Failed to push watched items" }
            }
        }
    }

    private fun pushDeleteToServer(
        items: Collection<WatchedItem>,
        source: WatchProgressSource,
    ) {
        val profileId = currentProfileId
        accountScopeSnapshot().launch {
            runCatching {
                if (items.isEmpty()) return@runCatching
                deleteFromTargetsForSource(
                    profileId = profileId,
                    items = items,
                    source = source,
                )
            }.onFailure { e ->
                log.e(e) { "Failed to push watched item delete" }
            }
        }
    }

    private fun publish() {
        val items = watchedItemsForSource(
            source = activeSource,
            nuvioItems = nuvioItemsByKey.values,
            providerItems = providerItemsByKey.mapValues { (_, itemsByKey) -> itemsByKey.values },
        )
            .map(WatchedItem::normalizedMarkedAt)
            .sortedByDescending { it.markedAtEpochMs }
        val fullyWatchedSeriesKeys = fullyWatchedSeriesKeysForSource(activeSource)
        val watchedKeys = items.mapTo(linkedSetOf()) {
            watchedItemKey(it.type, it.id, it.season, it.episode)
        }
        // Merge extra watched keys from providers (e.g. Simkl anime alternate IDs)
        activeSource.providerId?.let { providerId ->
            providerExtraWatchedKeys[providerId]?.let { extraKeys -> watchedKeys += extraKeys }
        }
        val isLoaded = hasLoadedSource(activeSource)
        val hasLoadedRemoteItems = activeSource.providerId
            ?.let(providersLoadedFromRemote::contains)
            ?: nuvioHasLoadedRemote
        _fullyWatchedSeriesKeys.value = fullyWatchedSeriesKeys + expandedSiblingKeys
        _uiState.value = WatchedUiState(
            items = items,
            watchedKeys = watchedKeys,
            isLoaded = isLoaded,
            hasLoadedRemoteItems = hasLoadedRemoteItems,
        )
        log.i {
            "Watched publish source=$activeSource provider=${activeSource.providerId?.storageId ?: "nuvio"} " +
                "items=${items.size} keys=${watchedKeys.size} fullyWatchedSeries=${fullyWatchedSeriesKeys.size} " +
                "isLoaded=$isLoaded hasLoadedRemote=$hasLoadedRemoteItems " +
                "itemKeys=[${diagnosticItemKeySample(items)}] " +
                "fullyWatchedKeys=[${fullyWatchedSeriesKeys.take(watchedDiagnosticSampleLimit).joinToString(",")}]"
        }
    }

    private fun diagnosticItemKeySample(items: Collection<WatchedItem>): String = items
        .asSequence()
        .take(watchedDiagnosticSampleLimit)
        .joinToString(separator = ",") { item ->
            watchedItemKey(item.type, item.id, item.season, item.episode)
        }

    /**
     * Observes provider extra watched keys (e.g. Simkl anime alternate IDs).
     * When the provider's snapshot changes (after mutations, syncs), recomputes
     * extra keys, re-pulls watched items, and re-publishes so watchedKeys and
     * items stay reactive and current.
     */
    private fun startExtraKeysObserverIfNeeded() {
        if (extraKeysObserverJob != null) return
        val providerId = activeSource.providerId ?: return
        val adapter = TrackingProviderRegistry.connectedWatchedProviders()
            .firstOrNull { it.providerId == providerId } ?: return
        extraKeysObserverJob = accountScopeSnapshot().launch {
            adapter.observeExtraWatchedKeys(currentProfileId)
                .distinctUntilChanged()
                .collectLatest { extraKeys ->
                    val keysChanged = providerExtraWatchedKeys[providerId] != extraKeys
                    if (keysChanged) {
                        providerExtraWatchedKeys[providerId] = extraKeys
                        // Re-pull items from provider to reflect snapshot changes
                        // (e.g. after remote episode removal)
                        val freshItems = adapter.pull(
                            profileId = currentProfileId,
                            pageSize = watchedItemsPageSize,
                        )
                        val itemsByKey = freshItems.associateBy { item ->
                            watchedItemKey(item.type, item.id, item.season, item.episode)
                        }.toMutableMap()
                        providerItemsByKey[providerId] = itemsByKey
                        publish()
                    }
                }
        }
    }

    private fun stopExtraKeysObserver() {
        extraKeysObserverJob?.cancel()
        extraKeysObserverJob = null
    }

    private fun persistNuvio() {
        WatchedStorage.savePayload(
            currentProfileId,
            json.encodeToString(
                StoredWatchedPayload(
                    items = nuvioItemsByKey.values
                        .map(WatchedItem::normalizedMarkedAt)
                        .sortedByDescending { it.markedAtEpochMs },
                    fullyWatchedSeriesKeys = nuvioFullyWatchedSeriesKeys,
                    expandedSiblingKeys = expandedSiblingKeys,
                    lastSuccessfulPushEpochMs = lastSuccessfulPushEpochMs,
                    deltaCursorEventId = deltaCursorEventId,
                    deltaInitialized = deltaInitialized,
                    dirtyWatchedKeys = nuvioDirtyWatchedKeys.toSet(),
                ),
            ),
        )
    }

    private fun recordSuccessfulPush(
        profileId: Int,
        operationGeneration: Long,
        items: Collection<WatchedItem>,
    ) {
        if (profileId != currentProfileId || operationGeneration != profileGeneration) return
        val acknowledgedDirtyKeys = acknowledgeSuccessfulWatchedPush(
            currentItems = nuvioItemsByKey,
            dirtyKeys = nuvioDirtyWatchedKeys,
            pushedItems = items,
        )
        val latestPushed = items
            .asSequence()
            .map { item -> normalizeWatchedMarkedAtEpochMs(item.markedAtEpochMs) }
            .maxOrNull()
            ?: return
        val updatedLastSuccessfulPushEpochMs = maxOf(lastSuccessfulPushEpochMs, latestPushed)
        if (
            acknowledgedDirtyKeys == nuvioDirtyWatchedKeys &&
            updatedLastSuccessfulPushEpochMs == lastSuccessfulPushEpochMs
        ) {
            return
        }
        nuvioDirtyWatchedKeys = acknowledgedDirtyKeys.toMutableSet()
        lastSuccessfulPushEpochMs = updatedLastSuccessfulPushEpochMs
        persistNuvio()
    }

    private suspend fun pushToTargetsForSource(
        profileId: Int,
        items: Collection<WatchedItem>,
        trackerHistorySync: WatchedTrackerHistorySync,
        source: WatchProgressSource,
    ): WatchedPushOutcome {
        var nuvioSyncSucceeded = false
        val succeededTrackerProviderIds = linkedSetOf<TrackingProviderId>()
        if (source.providerId == null) {
            try {
                syncAdapter.push(profileId = profileId, items = items)
                nuvioSyncSucceeded = true
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.e(error) { "Failed to push watched items to Nuvio Sync" }
            }
        }

        if (trackerHistorySync == WatchedTrackerHistorySync.Mirror) {
            TrackingProviderRegistry.connectedWatchedProviders().forEach { provider ->
                try {
                    provider.push(profileId = profileId, items = items)
                    succeededTrackerProviderIds += provider.providerId
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Throwable) {
                    log.e(error) { "Failed to push watched items to ${provider.providerId.storageId}" }
                }
            }
        }
        return WatchedPushOutcome(
            nuvioSyncSucceeded = nuvioSyncSucceeded,
            succeededTrackerProviderIds = succeededTrackerProviderIds,
        )
    }

    private suspend fun deleteFromTargetsForSource(
        profileId: Int,
        items: Collection<WatchedItem>,
        source: WatchProgressSource,
    ) {
        if (source.providerId == null) {
            try {
                syncAdapter.delete(profileId = profileId, items = items)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.e(error) { "Failed to delete watched items from Nuvio Sync" }
            }
        }

        TrackingProviderRegistry.connectedWatchedProviders().forEach { provider ->
            try {
                provider.delete(profileId = profileId, items = items)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.e(error) { "Failed to delete watched items from ${provider.providerId.storageId}" }
            }
        }
    }

    private fun accountScopeSnapshot(): CoroutineScope =
        synchronized(accountScopeLock) {
            accountScope
        }

    private fun connectedWatchedProviderIds(): Set<TrackingProviderId> =
        TrackingProviderRegistry.connectedWatchedProviders()
            .mapTo(linkedSetOf()) { provider -> provider.providerId }
}

internal data class WatchedSnapshotMerge(
    val items: Map<String, WatchedItem>,
    val dirtyKeys: Set<String>,
)

internal fun mergeWatchedSnapshot(
    serverItems: Collection<WatchedItem>,
    localItems: Collection<WatchedItem>,
    dirtyKeys: Set<String>,
): WatchedSnapshotMerge {
    val remoteByKey = serverItems
        .map(WatchedItem::normalizedMarkedAt)
        .associateBy { watchedItemKey(it.type, it.id, it.season, it.episode) }
        .toMutableMap()
    val localByKey = localItems
        .map(WatchedItem::normalizedMarkedAt)
        .associateBy { watchedItemKey(it.type, it.id, it.season, it.episode) }
    val remainingDirtyKeys = dirtyKeys
        .filterTo(mutableSetOf()) { key -> key in localByKey }

    remainingDirtyKeys.toList().forEach { key ->
        val localItem = localByKey.getValue(key)
        val remoteItem = remoteByKey[key]
        if (remoteItem == null || remoteItem.markedAtEpochMs < localItem.markedAtEpochMs) {
            remoteByKey[key] = localItem
        } else {
            remainingDirtyKeys -= key
        }
    }

    return WatchedSnapshotMerge(
        items = remoteByKey,
        dirtyKeys = remainingDirtyKeys,
    )
}

internal fun acknowledgeSuccessfulWatchedPush(
    currentItems: Map<String, WatchedItem>,
    dirtyKeys: Set<String>,
    pushedItems: Collection<WatchedItem>,
): Set<String> {
    val remainingDirtyKeys = dirtyKeys.toMutableSet()
    pushedItems
        .map(WatchedItem::normalizedMarkedAt)
        .forEach { pushedItem ->
            val key = watchedItemKey(
                type = pushedItem.type,
                id = pushedItem.id,
                season = pushedItem.season,
                episode = pushedItem.episode,
            )
            val currentItem = currentItems[key]?.normalizedMarkedAt()
            if (currentItem == null || currentItem.markedAtEpochMs <= pushedItem.markedAtEpochMs) {
                remainingDirtyKeys -= key
            }
        }
    return remainingDirtyKeys
}

internal fun effectiveWatchedSource(
    requestedSource: WatchProgressSource,
    connectedProviderIds: Set<TrackingProviderId>,
): WatchProgressSource = effectiveWatchProgressSource(
    requestedSource = requestedSource,
    isProviderAuthenticated = { providerId -> providerId in connectedProviderIds },
)

private fun String.isSeriesLikeWatchedType(): Boolean =
    trim().lowercase() in setOf("series", "show", "tv", "tvshow")
