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
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.max
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.AppTheme
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.PlatformBackHandler
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.details.MetaScreenSettingsRepository
import com.nuvio.app.features.details.MetaScreenSettingsUiState
import com.nuvio.app.core.ui.PosterCardStyleRepository
import com.nuvio.app.core.ui.PosterCardStyleUiState
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
import com.nuvio.app.features.tmdb.TmdbSettings
import com.nuvio.app.features.tmdb.TmdbSettingsRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesUiState
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_settings_page_root
import org.jetbrains.compose.resources.stringResource

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
            HomeCatalogSettingsRepository.uiState
        }.collectAsStateWithLifecycle()
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
                selectedAppLanguage = selectedAppLanguage,
                onAppLanguageSelected = ThemeSettingsRepository::setAppLanguage,
                episodeReleaseNotificationsUiState = episodeReleaseNotificationsUiState,
                tmdbSettings = tmdbSettings,
                mdbListSettings = mdbListSettings,
                traktAuthUiState = traktAuthUiState,
                traktCommentsEnabled = traktCommentsEnabled,
                homescreenHeroEnabled = homescreenSettingsUiState.heroEnabled,
                homescreenItems = homescreenSettingsUiState.items,
                metaScreenSettingsUiState = metaScreenSettingsUiState,
                continueWatchingPreferencesUiState = continueWatchingPreferencesUiState,
                posterCardStyleUiState = posterCardStyleUiState,
                onSwitchProfile = onSwitchProfile,
                onDownloadsClick = onDownloadsClick,
                onSupportersContributorsClick = onSupportersContributorsClick,
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
                selectedAppLanguage = selectedAppLanguage,
                onAppLanguageSelected = ThemeSettingsRepository::setAppLanguage,
                episodeReleaseNotificationsUiState = episodeReleaseNotificationsUiState,
                tmdbSettings = tmdbSettings,
                mdbListSettings = mdbListSettings,
                traktAuthUiState = traktAuthUiState,
                traktCommentsEnabled = traktCommentsEnabled,
                homescreenHeroEnabled = homescreenSettingsUiState.heroEnabled,
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
    selectedAppLanguage: AppLanguage,
    onAppLanguageSelected: (AppLanguage) -> Unit,
    episodeReleaseNotificationsUiState: EpisodeReleaseNotificationsUiState,
    tmdbSettings: TmdbSettings,
    mdbListSettings: MdbListSettings,
    traktAuthUiState: TraktAuthUiState,
    traktCommentsEnabled: Boolean,
    homescreenHeroEnabled: Boolean,
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
    onCheckForUpdatesClick: (() -> Unit)? = null,
    onCollectionsClick: () -> Unit = {},
) {
    val saveableStateHolder = rememberSaveableStateHolder()
    saveableStateHolder.SaveableStateProvider(page.name) {
        NuvioScreen {
            stickyHeader {
                val previousPage = page.previousPage()
                NuvioScreenHeader(
                    title = stringResource(page.titleRes),
                    onBack = previousPage?.let { { onPageChange(it) } },
                )
            }

            when (page) {
                SettingsPage.Root -> settingsRootContent(
                    isTablet = false,
                    onPlaybackClick = { onPageChange(SettingsPage.Playback) },
                    onAppearanceClick = { onPageChange(SettingsPage.Appearance) },
                    onNotificationsClick = { onPageChange(SettingsPage.Notifications) },
                    onContentDiscoveryClick = { onPageChange(SettingsPage.ContentDiscovery) },
                    onIntegrationsClick = { onPageChange(SettingsPage.Integrations) },
                    onTraktClick = { onPageChange(SettingsPage.TraktAuthentication) },
                    onSupportersContributorsClick = onSupportersContributorsClick,
                    onCheckForUpdatesClick = onCheckForUpdatesClick,
                    onDownloadsClick = onDownloadsClick,
                    onAccountClick = onAccountClick,
                    onSwitchProfileClick = onSwitchProfile,
                )
                SettingsPage.Account -> accountSettingsContent(
                    isTablet = false,
                )
                SettingsPage.SupportersContributors -> supportersContributorsContent(
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
                    showResumePromptOnLaunch = continueWatchingPreferencesUiState.showResumePromptOnLaunch,
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
                    commentsEnabled = traktCommentsEnabled,
                    onCommentsEnabledChange = TraktCommentsSettings::setEnabled,
                )
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
    selectedAppLanguage: AppLanguage,
    onAppLanguageSelected: (AppLanguage) -> Unit,
    episodeReleaseNotificationsUiState: EpisodeReleaseNotificationsUiState,
    tmdbSettings: TmdbSettings,
    mdbListSettings: MdbListSettings,
    traktAuthUiState: TraktAuthUiState,
    traktCommentsEnabled: Boolean,
    homescreenHeroEnabled: Boolean,
    homescreenItems: List<HomeCatalogSettingsItem>,
    metaScreenSettingsUiState: MetaScreenSettingsUiState,
    continueWatchingPreferencesUiState: ContinueWatchingPreferencesUiState,
    posterCardStyleUiState: PosterCardStyleUiState,
    onSwitchProfile: (() -> Unit)? = null,
    onDownloadsClick: () -> Unit = {},
    onSupportersContributorsClick: () -> Unit = {},
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
            val listState = rememberLazyListState()
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    start = 40.dp,
                    top = topOffset,
                    end = 40.dp,
                    bottom = 40.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                item {
                    val previousPage = page.previousPage()
                    TabletPageHeader(
                        title = if (page == SettingsPage.Root) {
                            stringResource(activeCategory.labelRes)
                        } else {
                            stringResource(page.titleRes)
                        },
                        showBack = previousPage != null,
                        onBack = { previousPage?.let(onPageChange) },
                    )
                }
                when (page) {
                    SettingsPage.Root -> settingsRootContent(
                        isTablet = true,
                        onPlaybackClick = { openInlinePage(SettingsPage.Playback) },
                        onAppearanceClick = { openInlinePage(SettingsPage.Appearance) },
                        onNotificationsClick = { openInlinePage(SettingsPage.Notifications) },
                        onContentDiscoveryClick = { openInlinePage(SettingsPage.ContentDiscovery) },
                        onIntegrationsClick = { openInlinePage(SettingsPage.Integrations) },
                        onTraktClick = { openInlinePage(SettingsPage.TraktAuthentication) },
                        onSupportersContributorsClick = { openInlinePage(SettingsPage.SupportersContributors) },
                        onCheckForUpdatesClick = onCheckForUpdatesClick,
                        onDownloadsClick = onDownloadsClick,
                        onAccountClick = { openInlinePage(SettingsPage.Account) },
                        onSwitchProfileClick = onSwitchProfile,
                        showAccountSection = activeCategory == SettingsCategory.Account,
                        showGeneralSection = activeCategory == SettingsCategory.General,
                        showAboutSection = activeCategory == SettingsCategory.About,
                    )
                    SettingsPage.Account -> accountSettingsContent(
                        isTablet = true,
                    )
                    SettingsPage.SupportersContributors -> supportersContributorsContent(
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
                        showResumePromptOnLaunch = continueWatchingPreferencesUiState.showResumePromptOnLaunch,
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
                        commentsEnabled = traktCommentsEnabled,
                        onCommentsEnabledChange = TraktCommentsSettings::setEnabled,
                    )
                }
            }
        }
    }
}
