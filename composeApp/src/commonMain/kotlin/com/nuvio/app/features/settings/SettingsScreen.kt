package com.nuvio.app.features.settings

import com.nuvio.app.core.build.AppFeaturePolicy

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.max
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.AppTheme
import com.nuvio.app.core.ui.LocalNuvioBottomNavigationOverlayPadding
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.PlatformBackHandler
import com.nuvio.app.core.ui.isLiquidGlassNativeTabBarSupported
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.details.MetaScreenSettingsRepository
import com.nuvio.app.features.details.MetaScreenSettingsUiState
import com.nuvio.app.core.ui.PosterCardStyleRepository
import com.nuvio.app.core.ui.PosterCardStyleUiState
import com.nuvio.app.features.collection.CollectionRepository
import com.nuvio.app.features.home.HomeCatalogSettingsItem
import com.nuvio.app.features.home.HomeCatalogSettingsRepository
import com.nuvio.app.features.mdblist.MdbListSettings
import com.nuvio.app.features.mdblist.MdbListSettingsRepository
import com.nuvio.app.features.notifications.EpisodeReleaseNotificationsRepository
import com.nuvio.app.features.notifications.EpisodeReleaseNotificationsUiState
import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.trakt.TraktAuthUiState
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktCommentsSettings
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.TraktSettingsUiState
import com.nuvio.app.features.tmdb.TmdbSettings
import com.nuvio.app.features.tmdb.TmdbSettingsRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesUiState
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_settings_page_root
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource

private val SettingsSearchRevealThreshold = 28.dp
private const val SettingsSearchRevealAnimationMillis = 240L
private const val SettingsSearchRevealHapticDelayMillis = 90L

@Composable
fun SettingsScreen(
    modifier: Modifier = Modifier,
    onSwitchProfile: (() -> Unit)? = null,
    onHomescreenClick: () -> Unit = {},
    onMetaScreenClick: () -> Unit = {},
    onContinueWatchingClick: () -> Unit = {},
    onAddonsClick: () -> Unit = {},
    onPluginsClick: () -> Unit = {},
    onDownloadsClick: () -> Unit = {},
    onAccountClick: () -> Unit = {},
    onSupportersContributorsClick: () -> Unit = {},
    onLicensesAttributionsClick: () -> Unit = {},
    onCheckForUpdatesClick: (() -> Unit)? = null,
    onCollectionsClick: () -> Unit = {},
) {
    BoxWithConstraints(
        modifier = modifier.fillMaxSize(),
    ) {
        val playerSettingsUiState by remember {
            PlayerSettingsRepository.ensureLoaded()
            PlayerSettingsRepository.uiState
        }.collectAsStateWithLifecycle()

        val selectedTheme by remember {
            ThemeSettingsRepository.ensureLoaded()
            ThemeSettingsRepository.selectedTheme
        }.collectAsStateWithLifecycle()
        val amoledEnabled by remember { ThemeSettingsRepository.amoledEnabled }.collectAsStateWithLifecycle()
        val liquidGlassNativeTabBarEnabled by remember {
            ThemeSettingsRepository.liquidGlassNativeTabBarEnabled
        }.collectAsStateWithLifecycle()
        val liquidGlassNativeTabBarSupported = remember { isLiquidGlassNativeTabBarSupported() }
        val selectedAppLanguage by remember { ThemeSettingsRepository.selectedAppLanguage }.collectAsStateWithLifecycle()
        val tmdbSettings by remember {
            TmdbSettingsRepository.ensureLoaded()
            TmdbSettingsRepository.uiState
        }.collectAsStateWithLifecycle()
        val mdbListSettings by remember {
            MdbListSettingsRepository.ensureLoaded()
            MdbListSettingsRepository.uiState
        }.collectAsStateWithLifecycle()
        val traktAuthUiState by remember {
            TraktAuthRepository.ensureLoaded()
            TraktAuthRepository.uiState
        }.collectAsStateWithLifecycle()
        val traktCommentsEnabled by remember {
            TraktCommentsSettings.ensureLoaded()
            TraktCommentsSettings.enabled
        }.collectAsStateWithLifecycle()
        val traktSettingsUiState by remember {
            TraktSettingsRepository.ensureLoaded()
            TraktSettingsRepository.uiState
        }.collectAsStateWithLifecycle()
        val addonsUiState by remember {
            AddonRepository.initialize()
            AddonRepository.uiState
        }.collectAsStateWithLifecycle()
        val homescreenCatalogRefreshKey = remember(addonsUiState.addons) {
            val allManifestsSettled = addonsUiState.addons.isNotEmpty() &&
                addonsUiState.addons.none { it.isRefreshing }
            if (!allManifestsSettled) return@remember emptyList<String>()
            addonsUiState.addons.mapNotNull { addon ->
                val manifest = addon.manifest ?: return@mapNotNull null
                buildString {
                    append(manifest.transportUrl)
                    append(':')
                    append(manifest.catalogs.joinToString(separator = ",") { catalog ->
                        "${catalog.type}:${catalog.id}:${catalog.extra.count { it.isRequired }}"
                    })
                }
            }
        }
        val homescreenSettingsUiState by remember {
            HomeCatalogSettingsRepository.snapshot()
            HomeCatalogSettingsRepository.uiState
        }.collectAsStateWithLifecycle()
        val collections by CollectionRepository.collections.collectAsStateWithLifecycle()
        val metaScreenSettingsUiState by remember {
            MetaScreenSettingsRepository.ensureLoaded()
            MetaScreenSettingsRepository.uiState
        }.collectAsStateWithLifecycle()
        val continueWatchingPreferencesUiState by remember {
            ContinueWatchingPreferencesRepository.ensureLoaded()
            ContinueWatchingPreferencesRepository.uiState
        }.collectAsStateWithLifecycle()
        val posterCardStyleUiState by remember {
            PosterCardStyleRepository.ensureLoaded()
            PosterCardStyleRepository.uiState
        }.collectAsStateWithLifecycle()
        val episodeReleaseNotificationsUiState by remember {
            EpisodeReleaseNotificationsRepository.ensureLoaded()
            EpisodeReleaseNotificationsRepository.uiState
        }.collectAsStateWithLifecycle()

        LaunchedEffect(homescreenCatalogRefreshKey) {
            if (homescreenCatalogRefreshKey.isEmpty()) return@LaunchedEffect
            HomeCatalogSettingsRepository.syncCatalogs(addonsUiState.addons)
        }

        LaunchedEffect(Unit) {
            CollectionRepository.initialize()
        }

        LaunchedEffect(collections) {
            HomeCatalogSettingsRepository.syncCollections(collections)
        }

        var currentPage by rememberSaveable { mutableStateOf(SettingsPage.Root.name) }
        val page = remember(currentPage) { SettingsPage.valueOf(currentPage) }
        val previousPage = page.previousPage()

        PlatformBackHandler(
            enabled = previousPage != null,
            onBack = { previousPage?.let { currentPage = it.name } },
        )

        if (maxWidth >= 768.dp) {
            TabletSettingsScreen(
                page = page,
                onPageChange = { currentPage = it.name },
                showLoadingOverlay = playerSettingsUiState.showLoadingOverlay,
                holdToSpeedEnabled = playerSettingsUiState.holdToSpeedEnabled,
                holdToSpeedValue = playerSettingsUiState.holdToSpeedValue,
                preferredAudioLanguage = playerSettingsUiState.preferredAudioLanguage,
                secondaryPreferredAudioLanguage = playerSettingsUiState.secondaryPreferredAudioLanguage,
                preferredSubtitleLanguage = playerSettingsUiState.preferredSubtitleLanguage,
                secondaryPreferredSubtitleLanguage = playerSettingsUiState.secondaryPreferredSubtitleLanguage,
                streamReuseLastLinkEnabled = playerSettingsUiState.streamReuseLastLinkEnabled,
                streamReuseLastLinkCacheHours = playerSettingsUiState.streamReuseLastLinkCacheHours,
                decoderPriority = playerSettingsUiState.decoderPriority,
                mapDV7ToHevc = playerSettingsUiState.mapDV7ToHevc,
                tunnelingEnabled = playerSettingsUiState.tunnelingEnabled,
                useLibass = playerSettingsUiState.useLibass,
                libassRenderType = playerSettingsUiState.libassRenderType,
                selectedTheme = selectedTheme,
                onThemeSelected = ThemeSettingsRepository::setTheme,
                amoledEnabled = amoledEnabled,
                onAmoledToggle = ThemeSettingsRepository::setAmoled,
                liquidGlassNativeTabBarSupported = liquidGlassNativeTabBarSupported,
                liquidGlassNativeTabBarEnabled = liquidGlassNativeTabBarEnabled,
                onLiquidGlassNativeTabBarToggle = ThemeSettingsRepository::setLiquidGlassNativeTabBar,
                selectedAppLanguage = selectedAppLanguage,
                onAppLanguageSelected = ThemeSettingsRepository::setAppLanguage,
                episodeReleaseNotificationsUiState = episodeReleaseNotificationsUiState,
                tmdbSettings = tmdbSettings,
                mdbListSettings = mdbListSettings,
                traktAuthUiState = traktAuthUiState,
                traktCommentsEnabled = traktCommentsEnabled,
                traktSettingsUiState = traktSettingsUiState,
                homescreenHeroEnabled = homescreenSettingsUiState.heroEnabled,
                homescreenHideUnreleasedContent = homescreenSettingsUiState.hideUnreleasedContent,
                homescreenItems = homescreenSettingsUiState.items,
                metaScreenSettingsUiState = metaScreenSettingsUiState,
                continueWatchingPreferencesUiState = continueWatchingPreferencesUiState,
                posterCardStyleUiState = posterCardStyleUiState,
                onSwitchProfile = onSwitchProfile,
                onDownloadsClick = onDownloadsClick,
                onSupportersContributorsClick = onSupportersContributorsClick,
                onLicensesAttributionsClick = onLicensesAttributionsClick,
                onCheckForUpdatesClick = onCheckForUpdatesClick,
                onCollectionsClick = onCollectionsClick,
            )
        } else {
            MobileSettingsScreen(
                page = page,
                onPageChange = { currentPage = it.name },
                showLoadingOverlay = playerSettingsUiState.showLoadingOverlay,
                holdToSpeedEnabled = playerSettingsUiState.holdToSpeedEnabled,
                holdToSpeedValue = playerSettingsUiState.holdToSpeedValue,
                preferredAudioLanguage = playerSettingsUiState.preferredAudioLanguage,
                secondaryPreferredAudioLanguage = playerSettingsUiState.secondaryPreferredAudioLanguage,
                preferredSubtitleLanguage = playerSettingsUiState.preferredSubtitleLanguage,
                secondaryPreferredSubtitleLanguage = playerSettingsUiState.secondaryPreferredSubtitleLanguage,
                streamReuseLastLinkEnabled = playerSettingsUiState.streamReuseLastLinkEnabled,
                streamReuseLastLinkCacheHours = playerSettingsUiState.streamReuseLastLinkCacheHours,
                decoderPriority = playerSettingsUiState.decoderPriority,
                mapDV7ToHevc = playerSettingsUiState.mapDV7ToHevc,
                tunnelingEnabled = playerSettingsUiState.tunnelingEnabled,
                useLibass = playerSettingsUiState.useLibass,
                libassRenderType = playerSettingsUiState.libassRenderType,
                selectedTheme = selectedTheme,
                onThemeSelected = ThemeSettingsRepository::setTheme,
                amoledEnabled = amoledEnabled,
                onAmoledToggle = ThemeSettingsRepository::setAmoled,
                liquidGlassNativeTabBarSupported = liquidGlassNativeTabBarSupported,
                liquidGlassNativeTabBarEnabled = liquidGlassNativeTabBarEnabled,
                onLiquidGlassNativeTabBarToggle = ThemeSettingsRepository::setLiquidGlassNativeTabBar,
                selectedAppLanguage = selectedAppLanguage,
                onAppLanguageSelected = ThemeSettingsRepository::setAppLanguage,
                episodeReleaseNotificationsUiState = episodeReleaseNotificationsUiState,
                tmdbSettings = tmdbSettings,
                mdbListSettings = mdbListSettings,
                traktAuthUiState = traktAuthUiState,
                traktCommentsEnabled = traktCommentsEnabled,
                traktSettingsUiState = traktSettingsUiState,
                homescreenHeroEnabled = homescreenSettingsUiState.heroEnabled,
                homescreenHideUnreleasedContent = homescreenSettingsUiState.hideUnreleasedContent,
                homescreenItems = homescreenSettingsUiState.items,
                metaScreenSettingsUiState = metaScreenSettingsUiState,
                continueWatchingPreferencesUiState = continueWatchingPreferencesUiState,
                posterCardStyleUiState = posterCardStyleUiState,
                onSwitchProfile = onSwitchProfile,
                onHomescreenClick = onHomescreenClick,
                onMetaScreenClick = onMetaScreenClick,
                onContinueWatchingClick = onContinueWatchingClick,
                onAddonsClick = onAddonsClick,
                onPluginsClick = onPluginsClick,
                onDownloadsClick = onDownloadsClick,
                onAccountClick = onAccountClick,
                onSupportersContributorsClick = onSupportersContributorsClick,
                onLicensesAttributionsClick = onLicensesAttributionsClick,
                onCheckForUpdatesClick = onCheckForUpdatesClick,
                onCollectionsClick = onCollectionsClick,
            )
        }
    }
}

@Composable
private fun MobileSettingsScreen(
    page: SettingsPage,
    onPageChange: (SettingsPage) -> Unit,
    showLoadingOverlay: Boolean,
    holdToSpeedEnabled: Boolean,
    holdToSpeedValue: Float,
    preferredAudioLanguage: String,
    secondaryPreferredAudioLanguage: String?,
    preferredSubtitleLanguage: String,
    secondaryPreferredSubtitleLanguage: String?,
    streamReuseLastLinkEnabled: Boolean,
    streamReuseLastLinkCacheHours: Int,
    decoderPriority: Int,
    mapDV7ToHevc: Boolean,
    tunnelingEnabled: Boolean,
    useLibass: Boolean,
    libassRenderType: String,
    selectedTheme: AppTheme,
    onThemeSelected: (AppTheme) -> Unit,
    amoledEnabled: Boolean,
    onAmoledToggle: (Boolean) -> Unit,
    liquidGlassNativeTabBarSupported: Boolean,
    liquidGlassNativeTabBarEnabled: Boolean,
    onLiquidGlassNativeTabBarToggle: (Boolean) -> Unit,
    selectedAppLanguage: AppLanguage,
    onAppLanguageSelected: (AppLanguage) -> Unit,
    episodeReleaseNotificationsUiState: EpisodeReleaseNotificationsUiState,
    tmdbSettings: TmdbSettings,
    mdbListSettings: MdbListSettings,
    traktAuthUiState: TraktAuthUiState,
    traktCommentsEnabled: Boolean,
    traktSettingsUiState: TraktSettingsUiState,
    homescreenHeroEnabled: Boolean,
    homescreenHideUnreleasedContent: Boolean,
    homescreenItems: List<HomeCatalogSettingsItem>,
    metaScreenSettingsUiState: MetaScreenSettingsUiState,
    continueWatchingPreferencesUiState: ContinueWatchingPreferencesUiState,
    posterCardStyleUiState: PosterCardStyleUiState,
    onSwitchProfile: (() -> Unit)? = null,
    onHomescreenClick: () -> Unit = {},
    onMetaScreenClick: () -> Unit = {},
    onContinueWatchingClick: () -> Unit = {},
    onAddonsClick: () -> Unit = {},
    onPluginsClick: () -> Unit = {},
    onDownloadsClick: () -> Unit = {},
    onAccountClick: () -> Unit = {},
    onSupportersContributorsClick: () -> Unit = {},
    onLicensesAttributionsClick: () -> Unit = {},
    onCheckForUpdatesClick: (() -> Unit)? = null,
    onCollectionsClick: () -> Unit = {},
) {
    val saveableStateHolder = rememberSaveableStateHolder()
    saveableStateHolder.SaveableStateProvider(page.name) {
        var settingsSearchQuery by rememberSaveable { mutableStateOf("") }
        var rootSearchVisible by rememberSaveable { mutableStateOf(false) }
        var rootSearchRevealAnimating by rememberSaveable { mutableStateOf(false) }
        val listState = rememberLazyListState()
        val hapticFeedback = LocalHapticFeedback.current
        val hapticScope = rememberCoroutineScope()
        val rootSearchRevealConnection = rememberSettingsRootSearchRevealConnection(
            page = page,
            listState = listState,
            query = settingsSearchQuery,
            searchVisible = rootSearchVisible,
        ) {
            rootSearchVisible = true
            rootSearchRevealAnimating = true
            hapticScope.launch {
                delay(SettingsSearchRevealHapticDelayMillis)
                hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            }
        }
        val searchEntries = settingsSearchEntries(
            pluginsEnabled = AppFeaturePolicy.pluginsEnabled,
            liquidGlassNativeTabBarSupported = liquidGlassNativeTabBarSupported,
            switchProfileAvailable = onSwitchProfile != null,
            checkForUpdatesAvailable = onCheckForUpdatesClick != null,
        )

        fun openSearchTarget(target: SettingsSearchTarget) {
            when (target) {
                is SettingsSearchTarget.Page -> when (target.page) {
                    SettingsPage.Account -> onAccountClick()
                    SettingsPage.SupportersContributors -> onSupportersContributorsClick()
                    SettingsPage.LicensesAttributions -> onLicensesAttributionsClick()
                    SettingsPage.ContinueWatching -> onContinueWatchingClick()
                    SettingsPage.Addons -> onAddonsClick()
                    SettingsPage.Plugins -> {
                        if (AppFeaturePolicy.pluginsEnabled) {
                            onPluginsClick()
                        }
                    }
                    SettingsPage.Homescreen -> onHomescreenClick()
                    SettingsPage.MetaScreen -> onMetaScreenClick()
                    else -> onPageChange(target.page)
                }
                SettingsSearchTarget.Downloads -> onDownloadsClick()
                SettingsSearchTarget.Collections -> onCollectionsClick()
                SettingsSearchTarget.SwitchProfile -> onSwitchProfile?.invoke()
                SettingsSearchTarget.CheckForUpdates -> onCheckForUpdatesClick?.invoke()
            }
        }

        LaunchedEffect(rootSearchRevealAnimating) {
            if (rootSearchRevealAnimating) {
                delay(SettingsSearchRevealAnimationMillis)
                rootSearchRevealAnimating = false
            }
        }

        NuvioScreen(
            modifier = Modifier.nestedScroll(rootSearchRevealConnection),
            listState = listState,
        ) {
            stickyHeader {
                val previousPage = page.previousPage()
                NuvioScreenHeader(
                    title = stringResource(page.titleRes),
                    onBack = previousPage?.let { { onPageChange(it) } },
                )
            }

            when (page) {
                SettingsPage.Root -> {
                    settingsSearchRootContent(
                        query = settingsSearchQuery,
                        entries = searchEntries,
                        isTablet = false,
                        showSearchField = rootSearchVisible,
                        animateSearchField = rootSearchRevealAnimating,
                        onQueryChange = { settingsSearchQuery = it },
                        onTargetClick = { openSearchTarget(it) },
                    )
                    if (settingsSearchQuery.isBlank()) {
                        settingsRootContent(
                            isTablet = false,
                            onPlaybackClick = { onPageChange(SettingsPage.Playback) },
                            onAppearanceClick = { onPageChange(SettingsPage.Appearance) },
                            onNotificationsClick = { onPageChange(SettingsPage.Notifications) },
                            onContentDiscoveryClick = { onPageChange(SettingsPage.ContentDiscovery) },
                            onIntegrationsClick = { onPageChange(SettingsPage.Integrations) },
                            onTraktClick = { onPageChange(SettingsPage.TraktAuthentication) },
                            onSupportersContributorsClick = onSupportersContributorsClick,
                            onLicensesAttributionsClick = onLicensesAttributionsClick,
                            onCheckForUpdatesClick = onCheckForUpdatesClick,
                            onDownloadsClick = onDownloadsClick,
                            onAccountClick = onAccountClick,
                            onSwitchProfileClick = onSwitchProfile,
                        )
                    }
                }
                SettingsPage.Account -> accountSettingsContent(
                    isTablet = false,
                )
                SettingsPage.SupportersContributors -> supportersContributorsContent(
                    isTablet = false,
                )
                SettingsPage.LicensesAttributions -> licensesAttributionsContent(
                    isTablet = false,
                )
                SettingsPage.Playback -> playbackSettingsContent(
                    isTablet = false,
                    showLoadingOverlay = showLoadingOverlay,
                    holdToSpeedEnabled = holdToSpeedEnabled,
                    holdToSpeedValue = holdToSpeedValue,
                    preferredAudioLanguage = preferredAudioLanguage,
                    secondaryPreferredAudioLanguage = secondaryPreferredAudioLanguage,
                    preferredSubtitleLanguage = preferredSubtitleLanguage,
                    secondaryPreferredSubtitleLanguage = secondaryPreferredSubtitleLanguage,
                    streamReuseLastLinkEnabled = streamReuseLastLinkEnabled,
                    streamReuseLastLinkCacheHours = streamReuseLastLinkCacheHours,
                    decoderPriority = decoderPriority,
                    mapDV7ToHevc = mapDV7ToHevc,
                    tunnelingEnabled = tunnelingEnabled,
                    useLibass = useLibass,
                    libassRenderType = libassRenderType,
                )
                SettingsPage.Appearance -> appearanceSettingsContent(
                    isTablet = false,
                    selectedTheme = selectedTheme,
                    onThemeSelected = onThemeSelected,
                    amoledEnabled = amoledEnabled,
                    onAmoledToggle = onAmoledToggle,
                    liquidGlassNativeTabBarSupported = liquidGlassNativeTabBarSupported,
                    liquidGlassNativeTabBarEnabled = liquidGlassNativeTabBarEnabled,
                    onLiquidGlassNativeTabBarToggle = onLiquidGlassNativeTabBarToggle,
                    selectedAppLanguage = selectedAppLanguage,
                    onAppLanguageSelected = onAppLanguageSelected,
                    onContinueWatchingClick = onContinueWatchingClick,
                    onPosterCustomizationClick = { onPageChange(SettingsPage.PosterCustomization) },
                )
                SettingsPage.Notifications -> notificationsSettingsContent(
                    isTablet = false,
                    uiState = episodeReleaseNotificationsUiState,
                )
                SettingsPage.ContinueWatching -> continueWatchingSettingsContent(
                    isTablet = false,
                    isVisible = continueWatchingPreferencesUiState.isVisible,
                    style = continueWatchingPreferencesUiState.style,
                    upNextFromFurthestEpisode = continueWatchingPreferencesUiState.upNextFromFurthestEpisode,
                    useEpisodeThumbnails = continueWatchingPreferencesUiState.useEpisodeThumbnails,
                    showUnairedNextUp = continueWatchingPreferencesUiState.showUnairedNextUp,
                    blurNextUp = continueWatchingPreferencesUiState.blurNextUp,
                    showResumePromptOnLaunch = continueWatchingPreferencesUiState.showResumePromptOnLaunch,
                    sortMode = continueWatchingPreferencesUiState.sortMode,
                )
                SettingsPage.PosterCustomization -> posterCustomizationSettingsContent(
                    isTablet = false,
                    uiState = posterCardStyleUiState,
                )
                SettingsPage.ContentDiscovery -> contentDiscoveryContent(
                    isTablet = false,
                    showPluginsEntry = AppFeaturePolicy.pluginsEnabled,
                    onAddonsClick = onAddonsClick,
                    onPluginsClick = onPluginsClick,
                    onHomescreenClick = onHomescreenClick,
                    onMetaScreenClick = onMetaScreenClick,
                    onCollectionsClick = onCollectionsClick,
                )
                SettingsPage.Addons -> addonsSettingsContent()
                SettingsPage.Plugins -> if (AppFeaturePolicy.pluginsEnabled) pluginsSettingsContent() else addonsSettingsContent()
                SettingsPage.Homescreen -> homescreenSettingsContent(
                    isTablet = false,
                    heroEnabled = homescreenHeroEnabled,
                    hideUnreleasedContent = homescreenHideUnreleasedContent,
                    items = homescreenItems,
                )
                SettingsPage.MetaScreen -> metaScreenSettingsContent(
                    isTablet = false,
                    uiState = metaScreenSettingsUiState,
                )
                SettingsPage.Integrations -> integrationsContent(
                    isTablet = false,
                    onTmdbClick = { onPageChange(SettingsPage.TmdbEnrichment) },
                    onMdbListClick = { onPageChange(SettingsPage.MdbListRatings) },
                )
                SettingsPage.TmdbEnrichment -> tmdbSettingsContent(
                    isTablet = false,
                    settings = tmdbSettings,
                )
                SettingsPage.MdbListRatings -> mdbListSettingsContent(
                    isTablet = false,
                    settings = mdbListSettings,
                )
                SettingsPage.TraktAuthentication -> traktSettingsContent(
                    isTablet = false,
                    uiState = traktAuthUiState,
                    settingsUiState = traktSettingsUiState,
                    commentsEnabled = traktCommentsEnabled,
                    onCommentsEnabledChange = TraktCommentsSettings::setEnabled,
                )
            }
        }
    }
}

@Composable
private fun rememberSettingsRootSearchRevealConnection(
    page: SettingsPage,
    listState: LazyListState,
    query: String,
    searchVisible: Boolean,
    onReveal: () -> Unit,
): NestedScrollConnection {
    val revealThresholdPx = with(LocalDensity.current) { SettingsSearchRevealThreshold.toPx() }
    val currentOnReveal by rememberUpdatedState(onReveal)
    var pullDistancePx by remember(page) { mutableStateOf(0f) }
    var revealTriggered by remember(page) { mutableStateOf(false) }

    return remember(page, listState, query, searchVisible, revealThresholdPx) {
        object : NestedScrollConnection {
            override fun onPostScroll(
                consumed: Offset,
                available: Offset,
                source: NestedScrollSource,
            ): Offset {
                val isRootAtTop = page == SettingsPage.Root &&
                    listState.firstVisibleItemIndex == 0 &&
                    listState.firstVisibleItemScrollOffset == 0
                val canRevealSearch = isRootAtTop && !searchVisible && !revealTriggered && query.isBlank()

                if (canRevealSearch && available.y > 0f) {
                    pullDistancePx += available.y
                    if (pullDistancePx >= revealThresholdPx) {
                        pullDistancePx = 0f
                        revealTriggered = true
                        currentOnReveal()
                    }
                } else if (!isRootAtTop || available.y < 0f) {
                    pullDistancePx = 0f
                }

                return Offset.Zero
            }
        }
    }
}

@Composable
private fun TabletSettingsScreen(
    page: SettingsPage,
    onPageChange: (SettingsPage) -> Unit,
    showLoadingOverlay: Boolean,
    holdToSpeedEnabled: Boolean,
    holdToSpeedValue: Float,
    preferredAudioLanguage: String,
    secondaryPreferredAudioLanguage: String?,
    preferredSubtitleLanguage: String,
    secondaryPreferredSubtitleLanguage: String?,
    streamReuseLastLinkEnabled: Boolean,
    streamReuseLastLinkCacheHours: Int,
    decoderPriority: Int,
    mapDV7ToHevc: Boolean,
    tunnelingEnabled: Boolean,
    useLibass: Boolean,
    libassRenderType: String,
    selectedTheme: AppTheme,
    onThemeSelected: (AppTheme) -> Unit,
    amoledEnabled: Boolean,
    onAmoledToggle: (Boolean) -> Unit,
    liquidGlassNativeTabBarSupported: Boolean,
    liquidGlassNativeTabBarEnabled: Boolean,
    onLiquidGlassNativeTabBarToggle: (Boolean) -> Unit,
    selectedAppLanguage: AppLanguage,
    onAppLanguageSelected: (AppLanguage) -> Unit,
    episodeReleaseNotificationsUiState: EpisodeReleaseNotificationsUiState,
    tmdbSettings: TmdbSettings,
    mdbListSettings: MdbListSettings,
    traktAuthUiState: TraktAuthUiState,
    traktCommentsEnabled: Boolean,
    traktSettingsUiState: TraktSettingsUiState,
    homescreenHeroEnabled: Boolean,
    homescreenHideUnreleasedContent: Boolean,
    homescreenItems: List<HomeCatalogSettingsItem>,
    metaScreenSettingsUiState: MetaScreenSettingsUiState,
    continueWatchingPreferencesUiState: ContinueWatchingPreferencesUiState,
    posterCardStyleUiState: PosterCardStyleUiState,
    onSwitchProfile: (() -> Unit)? = null,
    onDownloadsClick: () -> Unit = {},
    onSupportersContributorsClick: () -> Unit = {},
    onLicensesAttributionsClick: () -> Unit = {},
    onCheckForUpdatesClick: (() -> Unit)? = null,
    onCollectionsClick: () -> Unit = {},
) {
    var selectedCategory by rememberSaveable { mutableStateOf(SettingsCategory.General.name) }
    val activeCategory = SettingsCategory.valueOf(selectedCategory)
    val statusBarPadding = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val topOffset = max(statusBarPadding + 24.dp, 48.dp) + 64.dp

    LaunchedEffect(page) {
        if (page.opensInlineOnTablet) {
            selectedCategory = page.category.name
        }
    }

    fun openInlinePage(page: SettingsPage) {
        selectedCategory = page.category.name
        onPageChange(page)
    }

    val saveableStateHolder = rememberSaveableStateHolder()

    Row(modifier = Modifier.fillMaxSize()) {
        Surface(
            modifier = Modifier
                .width(280.dp)
                .fillMaxSize(),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = topOffset),
            ) {
                Text(
                    text = stringResource(Res.string.compose_settings_page_root),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp)
                        .padding(bottom = 20.dp),
                    style = MaterialTheme.typography.displayLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Bold,
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                Spacer(modifier = Modifier.height(10.dp))
                SettingsCategory.entries.forEach { category ->
                    SettingsSidebarItem(
                        label = stringResource(category.labelRes),
                        icon = category.icon,
                        selected = category == activeCategory,
                        onClick = {
                            selectedCategory = category.name
                            if (page != SettingsPage.Root) {
                                onPageChange(SettingsPage.Root)
                            }
                        },
                    )
                }
            }
        }

        saveableStateHolder.SaveableStateProvider(page.name) {
            var settingsSearchQuery by rememberSaveable { mutableStateOf("") }
            var rootSearchVisible by rememberSaveable { mutableStateOf(false) }
            var rootSearchRevealAnimating by rememberSaveable { mutableStateOf(false) }
            val hapticFeedback = LocalHapticFeedback.current
            val hapticScope = rememberCoroutineScope()
            val searchEntries = settingsSearchEntries(
                pluginsEnabled = AppFeaturePolicy.pluginsEnabled,
                liquidGlassNativeTabBarSupported = liquidGlassNativeTabBarSupported,
                switchProfileAvailable = onSwitchProfile != null,
                checkForUpdatesAvailable = onCheckForUpdatesClick != null,
            )

            fun openSearchTarget(target: SettingsSearchTarget) {
                when (target) {
                    is SettingsSearchTarget.Page -> openInlinePage(target.page)
                    SettingsSearchTarget.Downloads -> onDownloadsClick()
                    SettingsSearchTarget.Collections -> onCollectionsClick()
                    SettingsSearchTarget.SwitchProfile -> onSwitchProfile?.invoke()
                    SettingsSearchTarget.CheckForUpdates -> onCheckForUpdatesClick?.invoke()
                }
            }

            val listState = rememberLazyListState()
            val bottomOverlayPadding = LocalNuvioBottomNavigationOverlayPadding.current
            val rootSearchRevealConnection = rememberSettingsRootSearchRevealConnection(
                page = page,
                listState = listState,
                query = settingsSearchQuery,
                searchVisible = rootSearchVisible,
            ) {
                rootSearchVisible = true
                rootSearchRevealAnimating = true
                hapticScope.launch {
                    delay(SettingsSearchRevealHapticDelayMillis)
                    hapticFeedback.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                }
            }
            LaunchedEffect(rootSearchRevealAnimating) {
                if (rootSearchRevealAnimating) {
                    delay(SettingsSearchRevealAnimationMillis)
                    rootSearchRevealAnimating = false
                }
            }
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .nestedScroll(rootSearchRevealConnection),
                contentPadding = PaddingValues(
                    start = 40.dp,
                    top = topOffset,
                    end = 40.dp,
                    bottom = 40.dp + bottomOverlayPadding,
                ),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                item {
                    val previousPage = page.previousPage()
                    TabletPageHeader(
                        title = if (page == SettingsPage.Root) {
                            if (settingsSearchQuery.isBlank()) {
                                stringResource(activeCategory.labelRes)
                            } else {
                                stringResource(Res.string.compose_settings_page_root)
                            }
                        } else {
                            stringResource(page.titleRes)
                        },
                        showBack = previousPage != null,
                        onBack = { previousPage?.let(onPageChange) },
                    )
                }
                when (page) {
                    SettingsPage.Root -> {
                        settingsSearchRootContent(
                            query = settingsSearchQuery,
                            entries = searchEntries,
                            isTablet = true,
                            showSearchField = rootSearchVisible,
                            animateSearchField = rootSearchRevealAnimating,
                            onQueryChange = { settingsSearchQuery = it },
                            onTargetClick = { openSearchTarget(it) },
                        )
                        if (settingsSearchQuery.isBlank()) {
                            settingsRootContent(
                                isTablet = true,
                                onPlaybackClick = { openInlinePage(SettingsPage.Playback) },
                                onAppearanceClick = { openInlinePage(SettingsPage.Appearance) },
                                onNotificationsClick = { openInlinePage(SettingsPage.Notifications) },
                                onContentDiscoveryClick = { openInlinePage(SettingsPage.ContentDiscovery) },
                                onIntegrationsClick = { openInlinePage(SettingsPage.Integrations) },
                                onTraktClick = { openInlinePage(SettingsPage.TraktAuthentication) },
                                onSupportersContributorsClick = { openInlinePage(SettingsPage.SupportersContributors) },
                                onLicensesAttributionsClick = { openInlinePage(SettingsPage.LicensesAttributions) },
                                onCheckForUpdatesClick = onCheckForUpdatesClick,
                                onDownloadsClick = onDownloadsClick,
                                onAccountClick = { openInlinePage(SettingsPage.Account) },
                                onSwitchProfileClick = onSwitchProfile,
                                showAccountSection = activeCategory == SettingsCategory.Account,
                                showGeneralSection = activeCategory == SettingsCategory.General,
                                showAboutSection = activeCategory == SettingsCategory.About,
                            )
                        }
                    }
                    SettingsPage.Account -> accountSettingsContent(
                        isTablet = true,
                    )
                    SettingsPage.SupportersContributors -> supportersContributorsContent(
                        isTablet = true,
                    )
                    SettingsPage.LicensesAttributions -> licensesAttributionsContent(
                        isTablet = true,
                    )
                    SettingsPage.Playback -> playbackSettingsContent(
                        isTablet = true,
                        showLoadingOverlay = showLoadingOverlay,
                        holdToSpeedEnabled = holdToSpeedEnabled,
                        holdToSpeedValue = holdToSpeedValue,
                        preferredAudioLanguage = preferredAudioLanguage,
                        secondaryPreferredAudioLanguage = secondaryPreferredAudioLanguage,
                        preferredSubtitleLanguage = preferredSubtitleLanguage,
                        secondaryPreferredSubtitleLanguage = secondaryPreferredSubtitleLanguage,
                        streamReuseLastLinkEnabled = streamReuseLastLinkEnabled,
                        streamReuseLastLinkCacheHours = streamReuseLastLinkCacheHours,
                        decoderPriority = decoderPriority,
                        mapDV7ToHevc = mapDV7ToHevc,
                        tunnelingEnabled = tunnelingEnabled,
                        useLibass = useLibass,
                        libassRenderType = libassRenderType,
                    )
                    SettingsPage.Appearance -> appearanceSettingsContent(
                        isTablet = true,
                        selectedTheme = selectedTheme,
                        onThemeSelected = onThemeSelected,
                        amoledEnabled = amoledEnabled,
                        onAmoledToggle = onAmoledToggle,
                        liquidGlassNativeTabBarSupported = liquidGlassNativeTabBarSupported,
                        liquidGlassNativeTabBarEnabled = liquidGlassNativeTabBarEnabled,
                        onLiquidGlassNativeTabBarToggle = onLiquidGlassNativeTabBarToggle,
                        selectedAppLanguage = selectedAppLanguage,
                        onAppLanguageSelected = onAppLanguageSelected,
                        onContinueWatchingClick = { openInlinePage(SettingsPage.ContinueWatching) },
                        onPosterCustomizationClick = { openInlinePage(SettingsPage.PosterCustomization) },
                    )
                    SettingsPage.Notifications -> notificationsSettingsContent(
                        isTablet = true,
                        uiState = episodeReleaseNotificationsUiState,
                    )
                    SettingsPage.ContinueWatching -> continueWatchingSettingsContent(
                        isTablet = true,
                        isVisible = continueWatchingPreferencesUiState.isVisible,
                        style = continueWatchingPreferencesUiState.style,
                        upNextFromFurthestEpisode = continueWatchingPreferencesUiState.upNextFromFurthestEpisode,
                        useEpisodeThumbnails = continueWatchingPreferencesUiState.useEpisodeThumbnails,
                        showUnairedNextUp = continueWatchingPreferencesUiState.showUnairedNextUp,
                        blurNextUp = continueWatchingPreferencesUiState.blurNextUp,
                        showResumePromptOnLaunch = continueWatchingPreferencesUiState.showResumePromptOnLaunch,
                        sortMode = continueWatchingPreferencesUiState.sortMode,
                    )
                    SettingsPage.PosterCustomization -> posterCustomizationSettingsContent(
                        isTablet = true,
                        uiState = posterCardStyleUiState,
                    )
                    SettingsPage.ContentDiscovery -> contentDiscoveryContent(
                        isTablet = true,
                        showPluginsEntry = AppFeaturePolicy.pluginsEnabled,
                        onAddonsClick = { openInlinePage(SettingsPage.Addons) },
                        onPluginsClick = { openInlinePage(SettingsPage.Plugins) },
                        onHomescreenClick = { openInlinePage(SettingsPage.Homescreen) },
                        onMetaScreenClick = { openInlinePage(SettingsPage.MetaScreen) },
                        onCollectionsClick = onCollectionsClick,
                    )
                    SettingsPage.Addons -> addonsSettingsContent()
                    SettingsPage.Plugins -> if (AppFeaturePolicy.pluginsEnabled) pluginsSettingsContent() else addonsSettingsContent()
                    SettingsPage.Homescreen -> homescreenSettingsContent(
                        isTablet = true,
                        heroEnabled = homescreenHeroEnabled,
                        hideUnreleasedContent = homescreenHideUnreleasedContent,
                        items = homescreenItems,
                    )
                    SettingsPage.MetaScreen -> metaScreenSettingsContent(
                        isTablet = true,
                        uiState = metaScreenSettingsUiState,
                    )
                    SettingsPage.Integrations -> integrationsContent(
                        isTablet = true,
                        onTmdbClick = { onPageChange(SettingsPage.TmdbEnrichment) },
                        onMdbListClick = { onPageChange(SettingsPage.MdbListRatings) },
                    )
                    SettingsPage.TmdbEnrichment -> tmdbSettingsContent(
                        isTablet = true,
                        settings = tmdbSettings,
                    )
                    SettingsPage.MdbListRatings -> mdbListSettingsContent(
                        isTablet = true,
                        settings = mdbListSettings,
                    )
                    SettingsPage.TraktAuthentication -> traktSettingsContent(
                        isTablet = true,
                        uiState = traktAuthUiState,
                        settingsUiState = traktSettingsUiState,
                        commentsEnabled = traktCommentsEnabled,
                        onCommentsEnabledChange = TraktCommentsSettings::setEnabled,
                    )
                }
            }
        }
    }
}
