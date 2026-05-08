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
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.library.LibrarySourceMode
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktBrandAsset
import com.nuvio.app.features.trakt.TraktAuthUiState
import com.nuvio.app.features.trakt.TraktConnectionMode
import com.nuvio.app.features.trakt.TraktContinueWatchingDaysOptions
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.TraktSettingsUiState
import com.nuvio.app.features.trakt.WatchProgressSource
import com.nuvio.app.features.trakt.TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL
import com.nuvio.app.features.trakt.normalizeTraktContinueWatchingDaysCap
import com.nuvio.app.features.trakt.traktBrandPainter
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
import nuvio.composeapp.generated.resources.trakt_watch_progress_dialog_subtitle
import nuvio.composeapp.generated.resources.trakt_watch_progress_dialog_title
import nuvio.composeapp.generated.resources.trakt_watch_progress_nuvio_selected
import nuvio.composeapp.generated.resources.trakt_watch_progress_source_nuvio
import nuvio.composeapp.generated.resources.trakt_watch_progress_source_trakt
import nuvio.composeapp.generated.resources.trakt_watch_progress_subtitle
import nuvio.composeapp.generated.resources.trakt_watch_progress_title
import nuvio.composeapp.generated.resources.trakt_watch_progress_trakt_selected
import org.jetbrains.compose.resources.stringResource

internal fun LazyListScope.traktSettingsContent(
    isTablet: Boolean,
    uiState: TraktAuthUiState,
    settingsUiState: TraktSettingsUiState,
    commentsEnabled: Boolean,
    onCommentsEnabledChange: (Boolean) -> Unit,
) {
    item {
        SettingsGroup(isTablet = isTablet) {
            TraktBrandIntro(isTablet = isTablet)
        }
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.settings_trakt_authentication),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                TraktConnectionCard(
                    isTablet = isTablet,
                    uiState = uiState,
                )
            }
        }
    }

    if (uiState.mode == TraktConnectionMode.CONNECTED) {
        item {
            SettingsSection(
                title = stringResource(Res.string.settings_trakt_features),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    TraktFeatureRows(
                        isTablet = isTablet,
                        settingsUiState = settingsUiState,
                        commentsEnabled = commentsEnabled,
                        onCommentsEnabledChange = onCommentsEnabledChange,
                    )
                }
            }
        }
    }
}

@Composable
private fun TraktFeatureRows(
    isTablet: Boolean,
    settingsUiState: TraktSettingsUiState,
    commentsEnabled: Boolean,
    onCommentsEnabledChange: (Boolean) -> Unit,
) {
    var showLibrarySourceDialog by rememberSaveable { mutableStateOf(false) }
    var showWatchProgressDialog by rememberSaveable { mutableStateOf(false) }
    var showContinueWatchingWindowDialog by rememberSaveable { mutableStateOf(false) }
    var statusMessage by rememberSaveable { mutableStateOf<String?>(null) }

    val librarySourceValue = librarySourceModeLabel(settingsUiState.librarySourceMode)
    val watchProgressValue = watchProgressSourceLabel(settingsUiState.watchProgressSource)
    val continueWatchingWindowValue = continueWatchingDaysCapLabel(settingsUiState.continueWatchingDaysCap)
    val traktProgressSelectedMessage = stringResource(Res.string.trakt_watch_progress_trakt_selected)
    val nuvioProgressSelectedMessage = stringResource(Res.string.trakt_watch_progress_nuvio_selected)
    val traktLibrarySelectedMessage = stringResource(Res.string.trakt_library_source_trakt_selected)
    val nuvioLibrarySelectedMessage = stringResource(Res.string.trakt_library_source_nuvio_selected)

    TraktSettingsActionRow(
        title = stringResource(Res.string.trakt_library_source_title),
        description = stringResource(Res.string.trakt_library_source_subtitle),
        value = librarySourceValue,
        isTablet = isTablet,
        onClick = { showLibrarySourceDialog = true },
    )
    SettingsGroupDivider(isTablet = isTablet)
    TraktSettingsActionRow(
        title = stringResource(Res.string.trakt_watch_progress_title),
        description = stringResource(Res.string.trakt_watch_progress_subtitle),
        value = watchProgressValue,
        isTablet = isTablet,
        onClick = { showWatchProgressDialog = true },
    )
    SettingsGroupDivider(isTablet = isTablet)
    TraktSettingsActionRow(
        title = stringResource(Res.string.trakt_continue_watching_window),
        description = stringResource(Res.string.trakt_continue_watching_subtitle),
        value = continueWatchingWindowValue,
        isTablet = isTablet,
        onClick = { showContinueWatchingWindowDialog = true },
    )
    SettingsGroupDivider(isTablet = isTablet)
    SettingsSwitchRow(
        title = stringResource(Res.string.settings_trakt_comments),
        description = stringResource(Res.string.settings_trakt_comments_description),
        checked = commentsEnabled,
        isTablet = isTablet,
        onCheckedChange = onCommentsEnabledChange,
    )
    statusMessage?.takeIf { it.isNotBlank() }?.let { message ->
        SettingsGroupDivider(isTablet = isTablet)
        TraktInfoRow(
            isTablet = isTablet,
            text = message,
        )
    }

    if (showLibrarySourceDialog) {
        LibrarySourceModeDialog(
            selectedSource = settingsUiState.librarySourceMode,
            onSourceSelected = { source ->
                TraktSettingsRepository.setLibrarySourceMode(source)
                statusMessage = if (source == LibrarySourceMode.TRAKT) {
                    traktLibrarySelectedMessage
                } else {
                    nuvioLibrarySelectedMessage
                }
                showLibrarySourceDialog = false
            },
            onDismiss = { showLibrarySourceDialog = false },
        )
    }

    if (showWatchProgressDialog) {
        WatchProgressSourceDialog(
            selectedSource = settingsUiState.watchProgressSource,
            onSourceSelected = { source ->
                TraktSettingsRepository.setWatchProgressSource(source)
                statusMessage = if (source == WatchProgressSource.TRAKT) {
                    traktProgressSelectedMessage
                } else {
                    nuvioProgressSelectedMessage
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
                TraktSettingsRepository.setContinueWatchingDaysCap(days)
                showContinueWatchingWindowDialog = false
            },
            onDismiss = { showContinueWatchingWindowDialog = false },
        )
    }
}

@Composable
private fun TraktSettingsActionRow(
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
private fun TraktInfoRow(
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
    }

@Composable
private fun watchProgressSourceLabel(source: WatchProgressSource): String =
    when (source) {
        WatchProgressSource.TRAKT -> stringResource(Res.string.trakt_watch_progress_source_trakt)
        WatchProgressSource.NUVIO_SYNC -> stringResource(Res.string.trakt_watch_progress_source_nuvio)
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
                    listOf(LibrarySourceMode.TRAKT, LibrarySourceMode.LOCAL).forEach { source ->
                        TraktDialogOption(
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
                    text = stringResource(Res.string.trakt_watch_progress_dialog_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(WatchProgressSource.TRAKT, WatchProgressSource.NUVIO_SYNC).forEach { source ->
                        TraktDialogOption(
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
                        TraktDialogOption(
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
private fun TraktDialogOption(
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
private fun TraktBrandIntro(
    isTablet: Boolean,
) {
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 18.dp else 16.dp

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            androidx.compose.foundation.Image(
                painter = traktBrandPainter(TraktBrandAsset.Glyph),
                contentDescription = null,
                modifier = Modifier.size(if (isTablet) 84.dp else 72.dp),
                contentScale = ContentScale.Fit,
            )
            Text(
                text = stringResource(Res.string.settings_trakt_intro_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TraktConnectionCard(
    isTablet: Boolean,
    uiState: TraktAuthUiState,
) {
    val uriHandler = LocalUriHandler.current
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 18.dp else 16.dp
    val failedOpenBrowserMessage = stringResource(Res.string.settings_trakt_failed_open_browser)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        when (uiState.mode) {
            TraktConnectionMode.CONNECTED -> {
                Text(
                    text = stringResource(
                        Res.string.settings_trakt_connected_as,
                        uiState.username ?: stringResource(Res.string.settings_trakt_default_user),
                    ),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = stringResource(Res.string.settings_trakt_save_actions_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = TraktAuthRepository::onDisconnectRequested,
                    enabled = !uiState.isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.onSurface,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(stringResource(Res.string.settings_trakt_disconnect))
                    }
                }
            }

            TraktConnectionMode.AWAITING_APPROVAL -> {
                Text(
                    text = stringResource(Res.string.settings_trakt_finish_sign_in),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = stringResource(Res.string.settings_trakt_approval_redirect),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = {
                        val authUrl = TraktAuthRepository.pendingAuthorizationUrl()
                            ?: TraktAuthRepository.onConnectRequested()
                        if (authUrl == null) return@Button
                        runCatching { uriHandler.openUri(authUrl) }
                            .onFailure {
                                TraktAuthRepository.onAuthLaunchFailed(
                                    it.message ?: failedOpenBrowserMessage,
                                )
                            }
                    },
                    enabled = !uiState.isLoading,
                ) {
                    Text(stringResource(Res.string.settings_trakt_open_login))
                }
                Button(
                    onClick = TraktAuthRepository::onCancelAuthorization,
                    enabled = !uiState.isLoading,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                ) {
                    Text(stringResource(Res.string.action_cancel))
                }
            }

            TraktConnectionMode.DISCONNECTED -> {
                Text(
                    text = stringResource(Res.string.settings_trakt_sign_in_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = {
                        val authUrl = TraktAuthRepository.onConnectRequested() ?: return@Button
                        runCatching { uriHandler.openUri(authUrl) }
                            .onFailure {
                                TraktAuthRepository.onAuthLaunchFailed(
                                    it.message ?: failedOpenBrowserMessage,
                                )
                            }
                    },
                    enabled = uiState.credentialsConfigured && !uiState.isLoading,
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(stringResource(Res.string.settings_trakt_connect))
                    }
                }
                if (!uiState.credentialsConfigured) {
                    Text(
                        text = stringResource(Res.string.settings_trakt_missing_credentials),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }

        uiState.statusMessage?.takeIf { it.isNotBlank() }?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        uiState.errorMessage?.takeIf { it.isNotBlank() }?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}
