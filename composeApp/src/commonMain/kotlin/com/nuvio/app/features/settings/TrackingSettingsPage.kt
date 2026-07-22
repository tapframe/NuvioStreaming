package com.nuvio.app.features.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import com.nuvio.app.core.ui.NuvioLoadingIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.features.library.LibrarySourceMode
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.simkl.SimklAuthError
import com.nuvio.app.features.simkl.SimklAuthRepository
import com.nuvio.app.features.simkl.SimklAuthUiState
import com.nuvio.app.features.simkl.SimklConnectionMode
import com.nuvio.app.features.simkl.SimklSyncRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktAuthUiState
import com.nuvio.app.features.trakt.TraktConnectionMode
import com.nuvio.app.features.trakt.TraktContinueWatchingDaysOptions
import com.nuvio.app.features.trakt.MoreLikeThisSourcePreference
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingRefreshIntent
import com.nuvio.app.features.tracking.TrackingSettingsRepository
import com.nuvio.app.features.tracking.TrackingSettingsUiState
import com.nuvio.app.features.tracking.WatchProgressSource
import com.nuvio.app.features.tracking.effectiveLibrarySourceMode
import com.nuvio.app.features.tracking.effectiveWatchProgressSource
import com.nuvio.app.features.trakt.TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL
import com.nuvio.app.features.trakt.normalizeTraktContinueWatchingDaysCap
import com.nuvio.app.features.watchprogress.WatchProgressSourceCoordinator
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_cancel
import nuvio.composeapp.generated.resources.settings_playback_dialog_close
import nuvio.composeapp.generated.resources.settings_trakt_approval_redirect
import nuvio.composeapp.generated.resources.settings_trakt_authentication
import nuvio.composeapp.generated.resources.settings_trakt_comments
import nuvio.composeapp.generated.resources.settings_trakt_comments_description
import nuvio.composeapp.generated.resources.settings_trakt_connect
import nuvio.composeapp.generated.resources.settings_trakt_connected_as
import nuvio.composeapp.generated.resources.settings_trakt_default_user
import nuvio.composeapp.generated.resources.settings_trakt_disconnect
import nuvio.composeapp.generated.resources.settings_trakt_failed_open_browser
import nuvio.composeapp.generated.resources.settings_trakt_features
import nuvio.composeapp.generated.resources.settings_trakt_finish_sign_in
import nuvio.composeapp.generated.resources.settings_trakt_intro_description
import nuvio.composeapp.generated.resources.settings_trakt_missing_credentials
import nuvio.composeapp.generated.resources.settings_trakt_open_login
import nuvio.composeapp.generated.resources.settings_trakt_save_actions_description
import nuvio.composeapp.generated.resources.settings_trakt_sign_in_description
import nuvio.composeapp.generated.resources.settings_tracking_approval_redirect
import nuvio.composeapp.generated.resources.settings_tracking_features
import nuvio.composeapp.generated.resources.settings_tracking_intro_description
import nuvio.composeapp.generated.resources.settings_simkl_authorization_expired
import nuvio.composeapp.generated.resources.settings_simkl_authorization_revoked
import nuvio.composeapp.generated.resources.settings_simkl_connect
import nuvio.composeapp.generated.resources.settings_simkl_connected_as
import nuvio.composeapp.generated.resources.settings_simkl_connected_description
import nuvio.composeapp.generated.resources.settings_simkl_default_user
import nuvio.composeapp.generated.resources.settings_simkl_disconnect
import nuvio.composeapp.generated.resources.settings_simkl_finish_sign_in
import nuvio.composeapp.generated.resources.settings_simkl_invalid_callback
import nuvio.composeapp.generated.resources.settings_simkl_missing_credentials
import nuvio.composeapp.generated.resources.settings_simkl_open_login
import nuvio.composeapp.generated.resources.settings_simkl_sign_in_description
import nuvio.composeapp.generated.resources.settings_simkl_sign_in_failed
import nuvio.composeapp.generated.resources.settings_simkl_sync_now
import nuvio.composeapp.generated.resources.settings_simkl_sync_info_action
import nuvio.composeapp.generated.resources.settings_simkl_visit
import nuvio.composeapp.generated.resources.tracking_library_source_simkl_selected
import nuvio.composeapp.generated.resources.tracking_source_simkl
import nuvio.composeapp.generated.resources.tracking_watch_progress_dialog_subtitle
import nuvio.composeapp.generated.resources.tracking_watch_progress_simkl_selected
import nuvio.composeapp.generated.resources.trakt_all_history
import nuvio.composeapp.generated.resources.trakt_continue_watching_subtitle
import nuvio.composeapp.generated.resources.trakt_continue_watching_window
import nuvio.composeapp.generated.resources.trakt_cw_window_subtitle
import nuvio.composeapp.generated.resources.trakt_cw_window_title
import nuvio.composeapp.generated.resources.trakt_days_format
import nuvio.composeapp.generated.resources.trakt_library_source_dialog_subtitle
import nuvio.composeapp.generated.resources.trakt_library_source_dialog_title
import nuvio.composeapp.generated.resources.trakt_library_source_nuvio
import nuvio.composeapp.generated.resources.trakt_library_source_nuvio_selected
import nuvio.composeapp.generated.resources.trakt_library_source_subtitle
import nuvio.composeapp.generated.resources.trakt_library_source_title
import nuvio.composeapp.generated.resources.trakt_library_source_trakt
import nuvio.composeapp.generated.resources.trakt_library_source_trakt_selected
import nuvio.composeapp.generated.resources.trakt_more_like_this_source_dialog_subtitle
import nuvio.composeapp.generated.resources.trakt_more_like_this_source_dialog_title
import nuvio.composeapp.generated.resources.trakt_more_like_this_source_subtitle
import nuvio.composeapp.generated.resources.trakt_more_like_this_source_title
import nuvio.composeapp.generated.resources.trakt_more_like_this_source_tmdb
import nuvio.composeapp.generated.resources.trakt_more_like_this_source_trakt
import nuvio.composeapp.generated.resources.trakt_watch_progress_dialog_subtitle
import nuvio.composeapp.generated.resources.trakt_watch_progress_dialog_title
import nuvio.composeapp.generated.resources.trakt_watch_progress_nuvio_selected
import nuvio.composeapp.generated.resources.trakt_watch_progress_source_nuvio
import nuvio.composeapp.generated.resources.trakt_watch_progress_source_trakt
import nuvio.composeapp.generated.resources.trakt_watch_progress_subtitle
import nuvio.composeapp.generated.resources.trakt_watch_progress_title
import nuvio.composeapp.generated.resources.trakt_watch_progress_trakt_selected
import org.jetbrains.compose.resources.stringResource

internal fun LazyListScope.trackingSettingsContent(
    isTablet: Boolean,
    traktUiState: TraktAuthUiState,
    simklUiState: SimklAuthUiState,
    settingsUiState: TrackingSettingsUiState,
    commentsEnabled: Boolean,
    onCommentsEnabledChange: (Boolean) -> Unit,
) {
    item {
        SettingsGroup(isTablet = isTablet) {
            TrackingIntro(isTablet = isTablet)
        }
    }

    item {
        SettingsSection(
            title = "TRAKT",
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                TraktConnectionCard(
                    isTablet = isTablet,
                    uiState = traktUiState,
                )
            }
        }
    }

    item {
        SettingsSection(
            title = "SIMKL",
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SimklConnectionCard(
                    isTablet = isTablet,
                    uiState = simklUiState,
                )
            }
        }
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.settings_tracking_features),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                TrackingFeatureRows(
                    isTablet = isTablet,
                    settingsUiState = settingsUiState,
                    traktConnected = traktUiState.mode == TraktConnectionMode.CONNECTED,
                    simklConnected = simklUiState.mode == SimklConnectionMode.CONNECTED,
                    commentsEnabled = commentsEnabled,
                    onCommentsEnabledChange = onCommentsEnabledChange,
                )
            }
        }
    }
}

@Composable
private fun TrackingFeatureRows(
    isTablet: Boolean,
    settingsUiState: TrackingSettingsUiState,
    traktConnected: Boolean,
    simklConnected: Boolean,
    commentsEnabled: Boolean,
    onCommentsEnabledChange: (Boolean) -> Unit,
) {
    var showLibrarySourceDialog by rememberSaveable { mutableStateOf(false) }
    var showWatchProgressDialog by rememberSaveable { mutableStateOf(false) }
    var showContinueWatchingWindowDialog by rememberSaveable { mutableStateOf(false) }
    var showMoreLikeThisSourceDialog by rememberSaveable { mutableStateOf(false) }
    var statusMessage by rememberSaveable { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val connectedProviders = buildSet {
        if (traktConnected) add(TrackingProviderId.TRAKT)
        if (simklConnected) add(TrackingProviderId.SIMKL)
    }
    val selectedLibrarySource = effectiveLibrarySourceMode(settingsUiState.librarySourceMode) {
        providerId -> providerId in connectedProviders
    }
    val selectedWatchProgressSource = effectiveWatchProgressSource(settingsUiState.watchProgressSource) {
        providerId -> providerId in connectedProviders
    }
    val availableLibrarySources = buildList {
        add(LibrarySourceMode.LOCAL)
        if (traktConnected) add(LibrarySourceMode.TRAKT)
        if (simklConnected) add(LibrarySourceMode.SIMKL)
    }
    val availableWatchProgressSources = buildList {
        add(WatchProgressSource.NUVIO_SYNC)
        if (traktConnected) add(WatchProgressSource.TRAKT)
        if (simklConnected) add(WatchProgressSource.SIMKL)
    }

    val librarySourceValue = librarySourceModeLabel(selectedLibrarySource)
    val watchProgressValue = watchProgressSourceLabel(selectedWatchProgressSource)
    val continueWatchingWindowValue = continueWatchingDaysCapLabel(settingsUiState.continueWatchingDaysCap)
    val moreLikeThisSourceValue = moreLikeThisSourceLabel(settingsUiState.moreLikeThisSource)
    val traktProgressSelectedMessage = stringResource(Res.string.trakt_watch_progress_trakt_selected)
    val simklProgressSelectedMessage = stringResource(Res.string.tracking_watch_progress_simkl_selected)
    val nuvioProgressSelectedMessage = stringResource(Res.string.trakt_watch_progress_nuvio_selected)
    val traktLibrarySelectedMessage = stringResource(Res.string.trakt_library_source_trakt_selected)
    val simklLibrarySelectedMessage = stringResource(Res.string.tracking_library_source_simkl_selected)
    val nuvioLibrarySelectedMessage = stringResource(Res.string.trakt_library_source_nuvio_selected)

    TrackingSettingsActionRow(
        title = stringResource(Res.string.trakt_library_source_title),
        description = stringResource(Res.string.trakt_library_source_subtitle),
        value = librarySourceValue,
        isTablet = isTablet,
        onClick = { showLibrarySourceDialog = true },
    )
    SettingsGroupDivider(isTablet = isTablet)
    TrackingSettingsActionRow(
        title = stringResource(Res.string.trakt_watch_progress_title),
        description = stringResource(Res.string.trakt_watch_progress_subtitle),
        value = watchProgressValue,
        isTablet = isTablet,
        onClick = { showWatchProgressDialog = true },
    )
    SettingsGroupDivider(isTablet = isTablet)
    TrackingSettingsActionRow(
        title = stringResource(Res.string.trakt_continue_watching_window),
        description = stringResource(Res.string.trakt_continue_watching_subtitle),
        value = continueWatchingWindowValue,
        isTablet = isTablet,
        onClick = { showContinueWatchingWindowDialog = true },
    )
    if (traktConnected) {
        SettingsGroupDivider(isTablet = isTablet)
        SettingsSwitchRow(
            title = stringResource(Res.string.settings_trakt_comments),
            description = stringResource(Res.string.settings_trakt_comments_description),
            checked = commentsEnabled,
            isTablet = isTablet,
            onCheckedChange = onCommentsEnabledChange,
        )
        SettingsGroupDivider(isTablet = isTablet)
        TrackingSettingsActionRow(
            title = stringResource(Res.string.trakt_more_like_this_source_title),
            description = stringResource(Res.string.trakt_more_like_this_source_subtitle),
            value = moreLikeThisSourceValue,
            isTablet = isTablet,
            onClick = { showMoreLikeThisSourceDialog = true },
        )
    }
    statusMessage?.takeIf { it.isNotBlank() }?.let { message ->
        SettingsGroupDivider(isTablet = isTablet)
        TrackingInfoRow(
            isTablet = isTablet,
            text = message,
        )
    }

    if (showLibrarySourceDialog) {
        LibrarySourceModeDialog(
            selectedSource = selectedLibrarySource,
            availableSources = availableLibrarySources,
            onSourceSelected = { source ->
                TrackingSettingsRepository.setLibrarySourceMode(source)
                statusMessage = when (source) {
                    LibrarySourceMode.LOCAL -> nuvioLibrarySelectedMessage
                    LibrarySourceMode.TRAKT -> traktLibrarySelectedMessage
                    LibrarySourceMode.SIMKL -> simklLibrarySelectedMessage
                }
                showLibrarySourceDialog = false
            },
            onDismiss = { showLibrarySourceDialog = false },
        )
    }

    if (showWatchProgressDialog) {
        WatchProgressSourceDialog(
            selectedSource = selectedWatchProgressSource,
            availableSources = availableWatchProgressSources,
            onSourceSelected = { source ->
                scope.launch {
                    val result = WatchProgressSourceCoordinator.selectSource(
                        profileId = ProfileRepository.activeProfileId,
                        source = source,
                    )
                    statusMessage = if (result.succeeded) {
                        when (result.requestedSource) {
                            WatchProgressSource.TRAKT -> traktProgressSelectedMessage
                            WatchProgressSource.SIMKL -> simklProgressSelectedMessage
                            WatchProgressSource.NUVIO_SYNC -> nuvioProgressSelectedMessage
                        }
                    } else {
                        null
                    }
                }
                showWatchProgressDialog = false
            },
            onDismiss = { showWatchProgressDialog = false },
        )
    }

    if (showContinueWatchingWindowDialog) {
        ContinueWatchingWindowDialog(
            selectedDaysCap = settingsUiState.continueWatchingDaysCap,
            onDaysCapSelected = { days ->
                TrackingSettingsRepository.setContinueWatchingDaysCap(days)
                showContinueWatchingWindowDialog = false
            },
            onDismiss = { showContinueWatchingWindowDialog = false },
        )
    }

    if (showMoreLikeThisSourceDialog) {
        MoreLikeThisSourceDialog(
            selectedSource = settingsUiState.moreLikeThisSource,
            onSourceSelected = { source ->
                TrackingSettingsRepository.setMoreLikeThisSource(source)
                showMoreLikeThisSourceDialog = false
            },
            onDismiss = { showMoreLikeThisSourceDialog = false },
        )
    }
}

@Composable
private fun TrackingSettingsActionRow(
    title: String,
    description: String,
    value: String,
    isTablet: Boolean,
    onClick: () -> Unit,
) {
    val verticalPadding = if (isTablet) 16.dp else 14.dp
    val horizontalPadding = if (isTablet) 20.dp else 16.dp

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(end = 12.dp)
                .widthIn(max = if (isTablet) 560.dp else Dp.Unspecified),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun TrackingInfoRow(
    isTablet: Boolean,
    text: String,
) {
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 14.dp else 12.dp

    Text(
        text = text,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun librarySourceModeLabel(source: LibrarySourceMode): String =
    when (source) {
        LibrarySourceMode.TRAKT -> stringResource(Res.string.trakt_library_source_trakt)
        LibrarySourceMode.LOCAL -> stringResource(Res.string.trakt_library_source_nuvio)
        LibrarySourceMode.SIMKL -> stringResource(Res.string.tracking_source_simkl)
    }

@Composable
private fun watchProgressSourceLabel(source: WatchProgressSource): String =
    when (source) {
        WatchProgressSource.TRAKT -> stringResource(Res.string.trakt_watch_progress_source_trakt)
        WatchProgressSource.NUVIO_SYNC -> stringResource(Res.string.trakt_watch_progress_source_nuvio)
        WatchProgressSource.SIMKL -> stringResource(Res.string.tracking_source_simkl)
    }

@Composable
private fun moreLikeThisSourceLabel(source: MoreLikeThisSourcePreference): String =
    when (source) {
        MoreLikeThisSourcePreference.TRAKT -> stringResource(Res.string.trakt_more_like_this_source_trakt)
        MoreLikeThisSourcePreference.TMDB -> stringResource(Res.string.trakt_more_like_this_source_tmdb)
    }

@Composable
private fun continueWatchingDaysCapLabel(daysCap: Int): String {
    val normalized = normalizeTraktContinueWatchingDaysCap(daysCap)
    return if (normalized == TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL) {
        stringResource(Res.string.trakt_all_history)
    } else {
        stringResource(Res.string.trakt_days_format, normalized)
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun LibrarySourceModeDialog(
    selectedSource: LibrarySourceMode,
    availableSources: List<LibrarySourceMode>,
    onSourceSelected: (LibrarySourceMode) -> Unit,
    onDismiss: () -> Unit,
) {
    BasicAlertDialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = stringResource(Res.string.trakt_library_source_dialog_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(Res.string.trakt_library_source_dialog_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    availableSources.forEach { source ->
                        TrackingDialogOption(
                            label = librarySourceModeLabel(source),
                            selected = source == selectedSource,
                            onClick = { onSourceSelected(source) },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = stringResource(Res.string.settings_playback_dialog_close),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun WatchProgressSourceDialog(
    selectedSource: WatchProgressSource,
    availableSources: List<WatchProgressSource>,
    onSourceSelected: (WatchProgressSource) -> Unit,
    onDismiss: () -> Unit,
) {
    BasicAlertDialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = stringResource(Res.string.trakt_watch_progress_dialog_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(Res.string.tracking_watch_progress_dialog_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    availableSources.forEach { source ->
                        TrackingDialogOption(
                            label = watchProgressSourceLabel(source),
                            selected = source == selectedSource,
                            onClick = { onSourceSelected(source) },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = stringResource(Res.string.settings_playback_dialog_close),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun ContinueWatchingWindowDialog(
    selectedDaysCap: Int,
    onDaysCapSelected: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val normalizedSelected = normalizeTraktContinueWatchingDaysCap(selectedDaysCap)

    BasicAlertDialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = stringResource(Res.string.trakt_cw_window_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(Res.string.trakt_cw_window_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    TraktContinueWatchingDaysOptions.forEach { days ->
                        val normalizedDays = normalizeTraktContinueWatchingDaysCap(days)
                        TrackingDialogOption(
                            label = continueWatchingDaysCapLabel(days),
                            selected = normalizedDays == normalizedSelected,
                            onClick = { onDaysCapSelected(days) },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = stringResource(Res.string.settings_playback_dialog_close),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun MoreLikeThisSourceDialog(
    selectedSource: MoreLikeThisSourcePreference,
    onSourceSelected: (MoreLikeThisSourcePreference) -> Unit,
    onDismiss: () -> Unit,
) {
    BasicAlertDialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = stringResource(Res.string.trakt_more_like_this_source_dialog_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(Res.string.trakt_more_like_this_source_dialog_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(MoreLikeThisSourcePreference.TRAKT, MoreLikeThisSourcePreference.TMDB).forEach { source ->
                        TrackingDialogOption(
                            label = moreLikeThisSourceLabel(source),
                            selected = source == selectedSource,
                            onClick = { onSourceSelected(source) },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = stringResource(Res.string.settings_playback_dialog_close),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun TrackingDialogOption(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val containerColor = if (selected) {
        MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = containerColor,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier.size(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (selected) {
                    Icon(
                        imageVector = Icons.Rounded.Check,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun TrackingIntro(isTablet: Boolean) {
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 18.dp else 16.dp

    Text(
        text = stringResource(Res.string.settings_tracking_intro_description),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

private enum class ConnectionCardMode {
    DISCONNECTED,
    AWAITING_APPROVAL,
    CONNECTED,
}

@Composable
private fun TraktConnectionCard(
    isTablet: Boolean,
    uiState: TraktAuthUiState,
) {
    ProviderConnectionCard(
        isTablet = isTablet,
        mode = when (uiState.mode) {
            TraktConnectionMode.DISCONNECTED -> ConnectionCardMode.DISCONNECTED
            TraktConnectionMode.AWAITING_APPROVAL -> ConnectionCardMode.AWAITING_APPROVAL
            TraktConnectionMode.CONNECTED -> ConnectionCardMode.CONNECTED
        },
        credentialsConfigured = uiState.credentialsConfigured,
        isLoading = uiState.isLoading,
        connectedLabel = stringResource(
            Res.string.settings_trakt_connected_as,
            uiState.username ?: stringResource(Res.string.settings_trakt_default_user),
        ),
        connectedDescription = stringResource(Res.string.settings_trakt_save_actions_description),
        signInDescription = stringResource(Res.string.settings_trakt_sign_in_description),
        finishSignInLabel = stringResource(Res.string.settings_trakt_finish_sign_in),
        approvalDescription = stringResource(Res.string.settings_trakt_approval_redirect),
        connectLabel = stringResource(Res.string.settings_trakt_connect),
        openLoginLabel = stringResource(Res.string.settings_trakt_open_login),
        disconnectLabel = stringResource(Res.string.settings_trakt_disconnect),
        missingCredentialsMessage = stringResource(Res.string.settings_trakt_missing_credentials),
        statusMessage = uiState.statusMessage,
        errorMessage = uiState.errorMessage,
        onConnectRequested = TraktAuthRepository::onConnectRequested,
        onResumeAuthorization = {
            TraktAuthRepository.pendingAuthorizationUrl()
                ?: TraktAuthRepository.onConnectRequested()
        },
        onCancelAuthorization = TraktAuthRepository::onCancelAuthorization,
        onDisconnect = TraktAuthRepository::onDisconnectRequested,
    )
}

@Composable
private fun SimklConnectionCard(
    isTablet: Boolean,
    uiState: SimklAuthUiState,
) {
    val syncState by remember {
        SimklSyncRepository.ensureLoaded()
        SimklSyncRepository.state
    }.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var showSyncInfo by rememberSaveable { mutableStateOf(false) }

    ProviderConnectionCard(
        isTablet = isTablet,
        mode = when (uiState.mode) {
            SimklConnectionMode.DISCONNECTED -> ConnectionCardMode.DISCONNECTED
            SimklConnectionMode.AWAITING_APPROVAL -> ConnectionCardMode.AWAITING_APPROVAL
            SimklConnectionMode.CONNECTED -> ConnectionCardMode.CONNECTED
        },
        credentialsConfigured = uiState.credentialsConfigured,
        isLoading = uiState.isLoading,
        connectedLabel = stringResource(
            Res.string.settings_simkl_connected_as,
            uiState.username ?: stringResource(Res.string.settings_simkl_default_user),
        ),
        connectedDescription = stringResource(Res.string.settings_simkl_connected_description),
        signInDescription = stringResource(Res.string.settings_simkl_sign_in_description),
        finishSignInLabel = stringResource(Res.string.settings_simkl_finish_sign_in),
        approvalDescription = stringResource(Res.string.settings_tracking_approval_redirect),
        connectLabel = stringResource(Res.string.settings_simkl_connect),
        openLoginLabel = stringResource(Res.string.settings_simkl_open_login),
        disconnectLabel = stringResource(Res.string.settings_simkl_disconnect),
        syncLabel = stringResource(Res.string.settings_simkl_sync_now),
        infoLabel = stringResource(Res.string.settings_simkl_sync_info_action),
        isSyncing = syncState.isLoading,
        missingCredentialsMessage = stringResource(Res.string.settings_simkl_missing_credentials),
        errorMessage = simklErrorMessage(uiState.error) ?: syncState.errorMessage,
        websiteLabel = stringResource(Res.string.settings_simkl_visit),
        websiteUrl = SIMKL_WEBSITE_URL,
        onConnectRequested = SimklAuthRepository::onConnectRequested,
        onResumeAuthorization = {
            SimklAuthRepository.pendingAuthorizationUrl()
                ?: SimklAuthRepository.onConnectRequested()
        },
        onCancelAuthorization = SimklAuthRepository::onCancelAuthorization,
        onSyncRequested = {
            scope.launch {
                SimklSyncRepository.refresh(TrackingRefreshIntent.USER_INITIATED)
            }
        },
        onInfoRequested = { showSyncInfo = true },
        onDisconnect = SimklAuthRepository::onDisconnectRequested,
    )

    if (showSyncInfo) {
        SimklSyncInfoDialog(onDismiss = { showSyncInfo = false })
    }
}

@Composable
private fun ProviderConnectionCard(
    isTablet: Boolean,
    mode: ConnectionCardMode,
    credentialsConfigured: Boolean,
    isLoading: Boolean,
    connectedLabel: String,
    connectedDescription: String,
    signInDescription: String,
    finishSignInLabel: String,
    approvalDescription: String,
    connectLabel: String,
    openLoginLabel: String,
    disconnectLabel: String,
    syncLabel: String? = null,
    infoLabel: String? = null,
    isSyncing: Boolean = false,
    missingCredentialsMessage: String,
    statusMessage: String? = null,
    errorMessage: String? = null,
    websiteLabel: String? = null,
    websiteUrl: String? = null,
    onConnectRequested: () -> String?,
    onResumeAuthorization: () -> String?,
    onCancelAuthorization: () -> Unit,
    onSyncRequested: (() -> Unit)? = null,
    onInfoRequested: (() -> Unit)? = null,
    onDisconnect: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 18.dp else 16.dp
    val failedOpenBrowserMessage = stringResource(Res.string.settings_trakt_failed_open_browser)
    var browserError by rememberSaveable { mutableStateOf<String?>(null) }

    fun openUrl(url: String?) {
        if (url.isNullOrBlank()) return
        browserError = null
        runCatching { uriHandler.openUri(url) }
            .onFailure { error -> browserError = error.message ?: failedOpenBrowserMessage }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        when (mode) {
            ConnectionCardMode.CONNECTED -> {
                Text(
                    text = connectedLabel,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = connectedDescription,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (syncLabel != null && onSyncRequested != null) {
                    Button(
                        onClick = onSyncRequested,
                        enabled = !isLoading && !isSyncing,
                    ) {
                        if (isSyncing) {
                            NuvioLoadingIndicator(
                                color = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(18.dp),
                            )
                        } else {
                            Text(syncLabel)
                        }
                    }
                }
                if (infoLabel != null && onInfoRequested != null) {
                    TextButton(onClick = onInfoRequested) {
                        Icon(
                            imageVector = Icons.Rounded.Info,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.size(8.dp))
                        Text(infoLabel)
                    }
                }
                Button(
                    onClick = onDisconnect,
                    enabled = !isLoading && !isSyncing,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                ) {
                    if (isLoading) {
                        NuvioLoadingIndicator(
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(disconnectLabel)
                    }
                }
            }

            ConnectionCardMode.AWAITING_APPROVAL -> {
                Text(
                    text = finishSignInLabel,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = approvalDescription,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { openUrl(onResumeAuthorization()) },
                    enabled = !isLoading,
                ) {
                    Text(openLoginLabel)
                }
                Button(
                    onClick = onCancelAuthorization,
                    enabled = !isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                ) {
                    Text(stringResource(Res.string.action_cancel))
                }
            }

            ConnectionCardMode.DISCONNECTED -> {
                Text(
                    text = signInDescription,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { openUrl(onConnectRequested()) },
                    enabled = credentialsConfigured && !isLoading,
                ) {
                    if (isLoading) {
                        NuvioLoadingIndicator(
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(connectLabel)
                    }
                }
                if (!credentialsConfigured) {
                    Text(
                        text = missingCredentialsMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }

        if (!websiteLabel.isNullOrBlank() && !websiteUrl.isNullOrBlank()) {
            TextButton(onClick = { openUrl(websiteUrl) }) {
                Text(websiteLabel)
            }
        }
        statusMessage?.takeIf { it.isNotBlank() }?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        errorMessage?.takeIf { it.isNotBlank() }?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        browserError?.let {
            Text(
                text = failedOpenBrowserMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun simklErrorMessage(error: SimklAuthError?): String? =
    when (error) {
        null, SimklAuthError.MISSING_CLIENT_ID -> null
        SimklAuthError.INVALID_CALLBACK,
        SimklAuthError.INVALID_CALLBACK_STATE
        -> stringResource(Res.string.settings_simkl_invalid_callback)

        SimklAuthError.AUTHORIZATION_EXPIRED ->
            stringResource(Res.string.settings_simkl_authorization_expired)

        SimklAuthError.TOKEN_EXCHANGE_FAILED,
        SimklAuthError.INVALID_TOKEN_RESPONSE
        -> stringResource(Res.string.settings_simkl_sign_in_failed)

        SimklAuthError.AUTHORIZATION_REVOKED ->
            stringResource(Res.string.settings_simkl_authorization_revoked)
    }

private const val SIMKL_WEBSITE_URL = "https://simkl.com"
