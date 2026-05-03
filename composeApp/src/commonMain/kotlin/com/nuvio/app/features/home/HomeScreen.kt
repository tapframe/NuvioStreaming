package com.nuvio.app.features.home

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.network.NetworkCondition
import com.nuvio.app.core.network.NetworkStatusRepository
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioNetworkOfflineCard
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.details.nextReleasedEpisodeAfter
import com.nuvio.app.features.home.components.HomeCatalogRowSection
import com.nuvio.app.features.home.components.HomeContinueWatchingSection
import com.nuvio.app.features.home.components.HomeEmptyStateCard
import com.nuvio.app.features.home.components.HomeHeroReservedSpace
import com.nuvio.app.features.home.components.HomeHeroSection
import com.nuvio.app.features.home.components.HomeSkeletonHero
import com.nuvio.app.features.home.components.HomeSkeletonRow
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watchprogress.CachedInProgressItem
import com.nuvio.app.features.watchprogress.CachedNextUpItem
import com.nuvio.app.features.watchprogress.ContinueWatchingEnrichmentCache
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingItem
import com.nuvio.app.features.watchprogress.nextUpDismissKey
import com.nuvio.app.features.watchprogress.WatchProgressClock
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import com.nuvio.app.features.watchprogress.buildContinueWatchingEpisodeSubtitle
import com.nuvio.app.features.watchprogress.toContinueWatchingItem
import com.nuvio.app.features.watchprogress.toUpNextContinueWatchingItem
import com.nuvio.app.features.watching.application.WatchingState
import com.nuvio.app.features.watching.domain.WatchingContentRef
import com.nuvio.app.features.collection.CollectionRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.home.components.HomeCollectionRowSection
import com.nuvio.app.features.watchprogress.ContinueWatchingSectionStyle
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import com.nuvio.app.features.home.components.ContinueWatchingLayout
import com.nuvio.app.features.home.components.homeSectionHorizontalPaddingForWidth
import com.nuvio.app.features.home.components.rememberContinueWatchingLayout
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
fun HomeScreen(
    modifier: Modifier = Modifier,
    onCatalogClick: ((HomeCatalogSection) -> Unit)? = null,
    onPosterClick: ((MetaPreview) -> Unit)? = null,
    onPosterLongClick: ((MetaPreview) -> Unit)? = null,
    onContinueWatchingClick: ((ContinueWatchingItem) -> Unit)? = null,
    onContinueWatchingLongPress: ((ContinueWatchingItem) -> Unit)? = null,
    onFolderClick: ((collectionId: String, folderId: String) -> Unit)? = null,
    onFirstCatalogRendered: (() -> Unit)? = null,
) {
    LaunchedEffect(Unit) {
        AddonRepository.initialize()
        CollectionRepository.initialize()
        ContinueWatchingPreferencesRepository.ensureLoaded()
        WatchedRepository.ensureLoaded()
        WatchProgressRepository.ensureLoaded()
    }

    val addonsUiState by AddonRepository.uiState.collectAsStateWithLifecycle()
    val homeUiState by HomeRepository.uiState.collectAsStateWithLifecycle()
    val homeSettingsUiState by HomeCatalogSettingsRepository.uiState.collectAsStateWithLifecycle()
    val homeListState = rememberLazyListState()
    val collections by CollectionRepository.collections.collectAsStateWithLifecycle()
    val continueWatchingPreferences by ContinueWatchingPreferencesRepository.uiState.collectAsStateWithLifecycle()
    val watchedUiState by WatchedRepository.uiState.collectAsStateWithLifecycle()
    val watchProgressUiState by WatchProgressRepository.uiState.collectAsStateWithLifecycle()
    val networkStatusUiState by NetworkStatusRepository.uiState.collectAsStateWithLifecycle()
    val isTraktAuthenticated by remember {
        TraktAuthRepository.ensureLoaded()
        TraktAuthRepository.isAuthenticated
    }.collectAsStateWithLifecycle()
    var observedOfflineState by remember { mutableStateOf(false) }

    LaunchedEffect(networkStatusUiState.condition) {
        when (networkStatusUiState.condition) {
            NetworkCondition.NoInternet,
            NetworkCondition.ServersUnreachable,
            -> {
                observedOfflineState = true
            }

            NetworkCondition.Online -> {
                if (observedOfflineState) {
                    observedOfflineState = false
                    HomeRepository.refresh(addonsUiState.addons, force = true)
                }
            }

            NetworkCondition.Unknown,
            NetworkCondition.Checking,
            -> Unit
        }
    }

    val effectiveWatchProgressEntries = remember(watchProgressUiState.entries, isTraktAuthenticated) {
        if (!isTraktAuthenticated) {
            watchProgressUiState.entries
        } else {
            val cutoffMs = WatchProgressClock.nowEpochMs() - (TRAKT_CONTINUE_WATCHING_DAYS_CAP_DEFAULT.toLong() * 24L * 60L * 60L * 1000L)
            watchProgressUiState.entries.filter { entry -> entry.lastUpdatedEpochMs >= cutoffMs }
        }
    }

    val effectiveWatchedItems = remember(watchedUiState.items, isTraktAuthenticated) {
        if (isTraktAuthenticated) emptyList() else watchedUiState.items
    }

    val latestCompletedBySeries = remember(effectiveWatchProgressEntries, effectiveWatchedItems, continueWatchingPreferences.upNextFromFurthestEpisode) {
        WatchingState.latestCompletedBySeries(
            progressEntries = effectiveWatchProgressEntries,
            watchedItems = effectiveWatchedItems,
            preferFurthestEpisode = continueWatchingPreferences.upNextFromFurthestEpisode,
        )
    }
    val completedSeriesCandidates = remember(latestCompletedBySeries) {
        latestCompletedBySeries.map { (content, completed) ->
            CompletedSeriesCandidate(
                content = content,
                seasonNumber = completed.seasonNumber,
                episodeNumber = completed.episodeNumber,
                markedAtEpochMs = completed.markedAtEpochMs,
            )
        }
    }
    val visibleContinueWatchingEntries = remember(
        effectiveWatchProgressEntries,
        latestCompletedBySeries,
    ) {
        WatchingState.visibleContinueWatchingEntries(
            progressEntries = effectiveWatchProgressEntries,
            latestCompletedBySeries = latestCompletedBySeries,
        )
    }
    val profileState by ProfileRepository.state.collectAsStateWithLifecycle()
    val activeProfileId = profileState.activeProfile?.profileIndex ?: 1

    var nextUpItemsBySeries by remember(activeProfileId) { mutableStateOf<Map<String, Pair<Long, ContinueWatchingItem>>>(emptyMap()) }

    val cachedSnapshots = remember(activeProfileId) { ContinueWatchingEnrichmentCache.getSnapshots() }
    val cachedNextUpItems = remember(cachedSnapshots.first, continueWatchingPreferences.dismissedNextUpKeys) {
        cachedSnapshots.first.mapNotNull { cached ->
            if (nextUpDismissKey(cached.contentId, cached.seedSeason, cached.seedEpisode) in continueWatchingPreferences.dismissedNextUpKeys) {
                return@mapNotNull null
            }
            val item = cached.toContinueWatchingItem() ?: return@mapNotNull null
            cached.contentId to (cached.sortTimestamp to item)
        }.toMap()
    }
    val cachedInProgressItems = remember(cachedSnapshots.second) {
        cachedSnapshots.second.associate { cached ->
            cached.videoId to cached.toContinueWatchingItem()
        }
    }

    val effectivNextUpItems = remember(
        nextUpItemsBySeries,
        cachedNextUpItems,
        continueWatchingPreferences.dismissedNextUpKeys,
    ) {
        val liveNextUpItems = nextUpItemsBySeries.filterValues { (_, item) ->
            nextUpDismissKey(
                item.parentMetaId,
                item.nextUpSeedSeasonNumber,
                item.nextUpSeedEpisodeNumber,
            ) !in continueWatchingPreferences.dismissedNextUpKeys
        }
        if (liveNextUpItems.isNotEmpty()) {
            liveNextUpItems.mapValues { (contentId, pair) ->
                val cachedItem = cachedNextUpItems[contentId]?.second
                pair.first to pair.second.withFallbackMetadata(cachedItem)
            }
        } else {
            cachedNextUpItems
        }
    }

    val continueWatchingItems = remember(
        visibleContinueWatchingEntries,
        cachedInProgressItems,
        effectivNextUpItems,
    ) {
        buildHomeContinueWatchingItems(
            visibleEntries = visibleContinueWatchingEntries,
            cachedInProgressByVideoId = cachedInProgressItems,
            nextUpItemsBySeries = effectivNextUpItems,
        )
    }
    val availableManifests = remember(addonsUiState.addons) {
        addonsUiState.addons.mapNotNull { addon -> addon.manifest }
    }

    val metaProviderKey = remember(availableManifests) {
        availableManifests
            .filter { manifest -> manifest.resources.any { resource -> resource.name == "meta" } }
            .map { manifest -> manifest.transportUrl }
            .sorted()
    }

    val catalogRefreshKey = remember(availableManifests) {
        availableManifests
            .map { manifest ->
                buildString {
                    append(manifest.transportUrl)
                    append(':')
                    append(manifest.catalogs.joinToString(separator = ",") { catalog ->
                        "${catalog.type}:${catalog.id}:${catalog.extra.count { it.isRequired }}"
                    })
                }
            }
            .sorted()
    }

    LaunchedEffect(catalogRefreshKey) {
        if (catalogRefreshKey.isEmpty()) return@LaunchedEffect
        HomeCatalogSettingsRepository.syncCatalogs(addonsUiState.addons)
        HomeRepository.refresh(addonsUiState.addons)
    }

    LaunchedEffect(collections) {
        HomeCatalogSettingsRepository.syncCollections(collections)
    }

    LaunchedEffect(completedSeriesCandidates, metaProviderKey) {
        if (completedSeriesCandidates.isEmpty()) {
            nextUpItemsBySeries = emptyMap()
            return@LaunchedEffect
        }

        if (metaProviderKey.isEmpty()) return@LaunchedEffect

        val todayIsoDate = CurrentDateProvider.todayIsoDate()
        val semaphore = Semaphore(4)
        val results = completedSeriesCandidates.map { completedEntry ->
            async {
                semaphore.withPermit {
                    val meta = MetaDetailsRepository.fetch(
                        type = completedEntry.content.type,
                        id = completedEntry.content.id,
                    ) ?: return@withPermit null
                    val nextEpisode = meta.nextReleasedEpisodeAfter(
                        seasonNumber = completedEntry.seasonNumber,
                        episodeNumber = completedEntry.episodeNumber,
                        todayIsoDate = todayIsoDate,
                        showUnairedNextUp = isTraktAuthenticated,
                    ) ?: return@withPermit null
                    val item = completedEntry.toContinueWatchingSeed(meta)
                        .toUpNextContinueWatchingItem(nextEpisode)
                    if (nextUpDismissKey(item.parentMetaId, item.nextUpSeedSeasonNumber, item.nextUpSeedEpisodeNumber) in continueWatchingPreferences.dismissedNextUpKeys) {
                        return@withPermit null
                    }
                    completedEntry.content.id to (completedEntry.markedAtEpochMs to item)
                }
            }
        }.awaitAll().filterNotNull().toMap()
        nextUpItemsBySeries = results

        val nextUpCache = results.mapNotNull { (contentId, pair) ->
            val item = pair.second
            CachedNextUpItem(
                contentId = contentId,
                contentType = item.parentMetaType,
                name = item.title,
                poster = item.poster,
                backdrop = item.background,
                logo = item.logo,
                videoId = item.videoId,
                season = item.seasonNumber,
                episode = item.episodeNumber,
                episodeTitle = item.episodeTitle,
                episodeThumbnail = item.episodeThumbnail,
                pauseDescription = item.pauseDescription,
                lastWatched = pair.first,
                sortTimestamp = pair.first,
                seedSeason = item.nextUpSeedSeasonNumber,
                seedEpisode = item.nextUpSeedEpisodeNumber,
            )
        }
        val inProgressCache = visibleContinueWatchingEntries.map { entry ->
            CachedInProgressItem(
                contentId = entry.parentMetaId,
                contentType = entry.contentType,
                name = entry.title,
                poster = entry.poster,
                backdrop = entry.background,
                logo = entry.logo,
                videoId = entry.videoId,
                season = entry.seasonNumber,
                episode = entry.episodeNumber,
                episodeTitle = entry.episodeTitle,
                episodeThumbnail = entry.episodeThumbnail,
                pauseDescription = entry.pauseDescription,
                position = entry.lastPositionMs,
                duration = entry.durationMs,
                lastWatched = entry.lastUpdatedEpochMs,
                progressPercent = entry.progressPercent,
            )
        }
        ContinueWatchingEnrichmentCache.saveSnapshots(
            nextUp = nextUpCache,
            inProgress = inProgressCache,
        )
    }

    val hasActiveAddons = addonsUiState.addons.any { it.manifest != null }
    val showHeroSlot = homeSettingsUiState.heroEnabled
    val isResolvingHeroSources = addonsUiState.addons.any { it.isRefreshing } || homeUiState.isLoading
    val showHeroSkeleton = showHeroSlot &&
        homeUiState.heroItems.isEmpty() &&
        isResolvingHeroSources
    var firstCatalogReported by remember { mutableStateOf(false) }

    LaunchedEffect(homeUiState.sections.firstOrNull()?.key, onFirstCatalogRendered) {
        if (firstCatalogReported || homeUiState.sections.isEmpty()) return@LaunchedEffect
        firstCatalogReported = true
        onFirstCatalogRendered?.invoke()
    }

    val visibleCollections = remember(collections) {
        collections.filter { it.folders.isNotEmpty() }
    }
    val collectionsMap = remember(visibleCollections) {
        visibleCollections.associateBy { "collection_${it.id}" }
    }
    val sectionsMap = remember(homeUiState.sections) {
        homeUiState.sections.associateBy(HomeCatalogSection::key)
    }
    val enabledHomeItems = remember(homeSettingsUiState.items) {
        homeSettingsUiState.items.filter { it.enabled }
    }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val homeSectionPadding = homeSectionHorizontalPaddingForWidth(maxWidth.value)
        val continueWatchingLayout = rememberContinueWatchingLayout(maxWidth.value)
        val mobileHeroBelowSectionHeightHint = remember(
            maxWidth.value,
            continueWatchingPreferences.isVisible,
            continueWatchingPreferences.style,
            continueWatchingItems.isNotEmpty(),
            continueWatchingLayout,
        ) {
            heroMobileBelowSectionHeightHint(
                maxWidthDp = maxWidth.value,
                continueWatchingVisible = continueWatchingPreferences.isVisible,
                hasContinueWatchingItems = continueWatchingItems.isNotEmpty(),
                continueWatchingStyle = continueWatchingPreferences.style,
                continueWatchingLayout = continueWatchingLayout,
            )
        }

        NuvioScreen(
            modifier = Modifier.fillMaxSize(),
            horizontalPadding = 0.dp,
            topPadding = if (showHeroSlot) 0.dp else null,
            listState = homeListState,
        ) {
            if (showHeroSlot) {
                item {
                    when {
                        showHeroSkeleton -> HomeSkeletonHero(
                            modifier = Modifier,
                            viewportHeight = maxHeight,
                            mobileBelowSectionHeightHint = mobileHeroBelowSectionHeightHint,
                        )

                        homeUiState.heroItems.isNotEmpty() -> HomeHeroSection(
                            items = homeUiState.heroItems,
                            modifier = Modifier,
                            viewportHeight = maxHeight,
                            mobileBelowSectionHeightHint = mobileHeroBelowSectionHeightHint,
                            listState = homeListState,
                            onItemClick = onPosterClick,
                        )

                        else -> HomeHeroReservedSpace(
                            modifier = Modifier,
                            viewportHeight = maxHeight,
                            mobileBelowSectionHeightHint = mobileHeroBelowSectionHeightHint,
                        )
                    }
                }
            }

            when {
                addonsUiState.addons.none { it.manifest != null } -> {
                    if (continueWatchingPreferences.isVisible && continueWatchingItems.isNotEmpty()) {
                        item {
                            HomeContinueWatchingSection(
                                items = continueWatchingItems,
                                style = continueWatchingPreferences.style,
                                modifier = Modifier.padding(bottom = 12.dp),
                                sectionPadding = homeSectionPadding,
                                layout = continueWatchingLayout,
                                onItemClick = onContinueWatchingClick,
                                onItemLongPress = onContinueWatchingLongPress,
                            )
                        }
                    }
                    item {
                        HomeEmptyStateCard(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            title = stringResource(Res.string.compose_search_empty_no_active_addons_title),
                            message = stringResource(Res.string.home_empty_no_active_addons_message),
                        )
                    }
                }

                homeUiState.isLoading && homeUiState.sections.isEmpty() -> {
                    if (continueWatchingPreferences.isVisible && continueWatchingItems.isNotEmpty()) {
                        item {
                            HomeContinueWatchingSection(
                                items = continueWatchingItems,
                                style = continueWatchingPreferences.style,
                                modifier = Modifier.padding(bottom = 12.dp),
                                sectionPadding = homeSectionPadding,
                                layout = continueWatchingLayout,
                                onItemClick = onContinueWatchingClick,
                                onItemLongPress = onContinueWatchingLongPress,
                            )
                        }
                    }
                    items(3) {
                        HomeSkeletonRow(modifier = Modifier.padding(horizontal = 16.dp))
                    }
                }

                homeUiState.sections.isEmpty() && homeUiState.heroItems.isEmpty() &&
                    (!continueWatchingPreferences.isVisible || continueWatchingItems.isEmpty()) -> {
                    item {
                        if (networkStatusUiState.isOfflineLike) {
                            NuvioNetworkOfflineCard(
                                condition = networkStatusUiState.condition,
                                modifier = Modifier.padding(horizontal = 16.dp),
                                onRetry = {
                                    NetworkStatusRepository.requestRefresh(force = true)
                                    HomeRepository.refresh(addonsUiState.addons, force = true)
                                },
                            )
                        } else {
                            HomeEmptyStateCard(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                title = stringResource(Res.string.home_empty_no_rows_title),
                                message = homeUiState.errorMessage
                                    ?: stringResource(Res.string.home_empty_no_rows_message),
                            )
                        }
                    }
                }

                else -> {
                    if (continueWatchingPreferences.isVisible && continueWatchingItems.isNotEmpty()) {
                        item {
                            HomeContinueWatchingSection(
                                items = continueWatchingItems,
                                style = continueWatchingPreferences.style,
                                modifier = Modifier.padding(bottom = 12.dp),
                                sectionPadding = homeSectionPadding,
                                layout = continueWatchingLayout,
                                onItemClick = onContinueWatchingClick,
                                onItemLongPress = onContinueWatchingLongPress,
                            )
                        }
                    }

                    enabledHomeItems.forEach { settingsItem ->
                        if (settingsItem.isCollection) {
                            val collection = collectionsMap[settingsItem.key]
                            if (collection != null) {
                                item(key = settingsItem.key) {
                                    HomeCollectionRowSection(
                                        collection = collection,
                                        modifier = Modifier.padding(bottom = 12.dp),
                                        sectionPadding = homeSectionPadding,
                                        onFolderClick = onFolderClick,
                                    )
                                }
                            }
                        } else {
                            val section = sectionsMap[settingsItem.key]
                            if (section != null && section.items.isNotEmpty()) {
                                item(key = settingsItem.key) {
                                    HomeCatalogRowSection(
                                        section = section,
                                        entries = section.items.take(HOME_CATALOG_PREVIEW_LIMIT),
                                        modifier = Modifier.padding(bottom = 12.dp),
                                        sectionPadding = homeSectionPadding,
                                        onViewAllClick = if (section.canOpenCatalog(HOME_CATALOG_PREVIEW_LIMIT)) {
                                            onCatalogClick?.let { { it(section) } }
                                        } else {
                                            null
                                        },
                                        watchedKeys = watchedUiState.watchedKeys,
                                        onPosterClick = onPosterClick,
                                        onPosterLongClick = onPosterLongClick,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private const val HOME_CATALOG_PREVIEW_LIMIT = 18
private const val TRAKT_CONTINUE_WATCHING_DAYS_CAP_DEFAULT = 60

private fun heroMobileBelowSectionHeightHint(
    maxWidthDp: Float,
    continueWatchingVisible: Boolean,
    hasContinueWatchingItems: Boolean,
    continueWatchingStyle: ContinueWatchingSectionStyle,
    continueWatchingLayout: ContinueWatchingLayout,
): Dp? {
    if (maxWidthDp >= 600f || !continueWatchingVisible || !hasContinueWatchingItems) return null

    return when (continueWatchingStyle) {
        ContinueWatchingSectionStyle.Wide -> continueWatchingLayout.wideCardHeight + 56.dp
        ContinueWatchingSectionStyle.Poster ->
            continueWatchingLayout.posterCardHeight + continueWatchingLayout.posterTitleBlockHeight + 70.dp
    }
}

internal fun buildHomeContinueWatchingItems(
    visibleEntries: List<WatchProgressEntry>,
    cachedInProgressByVideoId: Map<String, ContinueWatchingItem> = emptyMap(),
    nextUpItemsBySeries: Map<String, Pair<Long, ContinueWatchingItem>>,
): List<ContinueWatchingItem> {
    return buildList {
        addAll(
            visibleEntries.map { entry ->
                val liveItem = entry.toContinueWatchingItem()
                HomeContinueWatchingCandidate(
                    lastUpdatedEpochMs = entry.lastUpdatedEpochMs,
                    item = liveItem.withFallbackMetadata(cachedInProgressByVideoId[entry.videoId]),
                    isProgressEntry = true,
                )
            },
        )
        addAll(
            nextUpItemsBySeries.values.map { (lastUpdatedEpochMs, item) ->
                HomeContinueWatchingCandidate(
                    lastUpdatedEpochMs = lastUpdatedEpochMs,
                    item = item,
                    isProgressEntry = false,
                )
            },
        )
    }
        .sortedWith(
            compareByDescending<HomeContinueWatchingCandidate> { it.lastUpdatedEpochMs }
                .thenByDescending { it.isProgressEntry },
        )
        .filter { candidate -> candidate.item.shouldDisplayInContinueWatching() }
        .distinctBy { it.item.videoId }
        .map(HomeContinueWatchingCandidate::item)
}

private data class CompletedSeriesCandidate(
    val content: WatchingContentRef,
    val seasonNumber: Int,
    val episodeNumber: Int,
    val markedAtEpochMs: Long,
)

private data class HomeContinueWatchingCandidate(
    val lastUpdatedEpochMs: Long,
    val item: ContinueWatchingItem,
    val isProgressEntry: Boolean,
)

private fun CompletedSeriesCandidate.toContinueWatchingSeed(meta: com.nuvio.app.features.details.MetaDetails) =
    WatchProgressEntry(
        contentType = content.type,
        parentMetaId = content.id,
        parentMetaType = content.type,
        videoId = "${content.id}:${seasonNumber}:${episodeNumber}",
        title = meta.name,
        logo = meta.logo,
        poster = meta.poster,
        background = meta.background,
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        lastPositionMs = 0L,
        durationMs = 0L,
        lastUpdatedEpochMs = markedAtEpochMs,
        isCompleted = true,
    )

private fun ContinueWatchingItem.shouldDisplayInContinueWatching(): Boolean =
    isNextUp || progressFraction < 0.995f

private fun CachedNextUpItem.toContinueWatchingItem(): ContinueWatchingItem? {
    return ContinueWatchingItem(
        parentMetaId = contentId,
        parentMetaType = contentType,
        videoId = videoId,
        title = name,
        subtitle = buildContinueWatchingEpisodeSubtitle(
            seasonNumber = season,
            episodeNumber = episode,
            episodeTitle = episodeTitle,
        ),
        imageUrl = episodeThumbnail ?: backdrop ?: poster,
        logo = logo,
        poster = poster,
        background = backdrop,
        seasonNumber = season,
        episodeNumber = episode,
        episodeTitle = episodeTitle,
        episodeThumbnail = episodeThumbnail,
        pauseDescription = pauseDescription,
        isNextUp = true,
        nextUpSeedSeasonNumber = seedSeason,
        nextUpSeedEpisodeNumber = seedEpisode,
        resumePositionMs = 0L,
        resumeProgressFraction = null,
        durationMs = 0L,
        progressFraction = 0f,
    )
}

private fun CachedInProgressItem.toContinueWatchingItem(): ContinueWatchingItem {
    val explicitResumeProgressFraction = progressPercent
        ?.takeIf { duration <= 0L && it > 0f }
        ?.let { (it / 100f).coerceIn(0f, 1f) }
    val normalizedProgressFraction = progressPercent
        ?.let { (it / 100f).coerceIn(0f, 1f) }
        ?: if (duration > 0L) {
            (position.toFloat() / duration.toFloat()).coerceIn(0f, 1f)
        } else {
            0f
        }

    return ContinueWatchingItem(
        parentMetaId = contentId,
        parentMetaType = contentType,
        videoId = videoId,
        title = name,
        subtitle = buildContinueWatchingEpisodeSubtitle(
            seasonNumber = season,
            episodeNumber = episode,
            episodeTitle = episodeTitle,
        ),
        imageUrl = episodeThumbnail ?: backdrop ?: poster,
        logo = logo,
        poster = poster,
        background = backdrop,
        seasonNumber = season,
        episodeNumber = episode,
        episodeTitle = episodeTitle,
        episodeThumbnail = episodeThumbnail,
        pauseDescription = pauseDescription,
        isNextUp = false,
        nextUpSeedSeasonNumber = null,
        nextUpSeedEpisodeNumber = null,
        resumePositionMs = if (explicitResumeProgressFraction != null) 0L else position,
        resumeProgressFraction = explicitResumeProgressFraction,
        durationMs = duration,
        progressFraction = normalizedProgressFraction,
    )
}

private fun ContinueWatchingItem.withFallbackMetadata(
    fallback: ContinueWatchingItem?,
): ContinueWatchingItem {
    if (fallback == null) return this

    return copy(
        title = title.ifBlank { fallback.title },
        subtitle = subtitle.ifBlank { fallback.subtitle },
        imageUrl = imageUrl ?: fallback.imageUrl,
        logo = logo ?: fallback.logo,
        poster = poster ?: fallback.poster,
        background = background ?: fallback.background,
        episodeTitle = episodeTitle ?: fallback.episodeTitle,
        episodeThumbnail = episodeThumbnail ?: fallback.episodeThumbnail,
        pauseDescription = pauseDescription ?: fallback.pauseDescription,
    )
}
