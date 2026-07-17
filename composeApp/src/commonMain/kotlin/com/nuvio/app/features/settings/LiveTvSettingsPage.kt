package com.nuvio.app.features.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.livetv.LiveTvPlaylist
import com.nuvio.app.features.livetv.LiveTvPlaylistType
import com.nuvio.app.features.livetv.LiveTvRepository
import com.nuvio.app.features.livetv.LiveTvUiState
import com.nuvio.app.features.livetv.rememberLiveTvPlaylistFilePicker
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_remove
import nuvio.composeapp.generated.resources.live_tv_settings_add_local_playlist
import nuvio.composeapp.generated.resources.live_tv_settings_add_url_playlist
import nuvio.composeapp.generated.resources.live_tv_settings_cancel_edit
import nuvio.composeapp.generated.resources.live_tv_settings_configured_playlists
import nuvio.composeapp.generated.resources.live_tv_settings_description
import nuvio.composeapp.generated.resources.live_tv_settings_edit_playlist
import nuvio.composeapp.generated.resources.live_tv_settings_navigation_description
import nuvio.composeapp.generated.resources.live_tv_settings_navigation_title
import nuvio.composeapp.generated.resources.live_tv_settings_no_playlists
import nuvio.composeapp.generated.resources.live_tv_settings_pick_file_failed
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_disabled
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_enabled
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_label
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_name_label
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_name_placeholder
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_placeholder
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_source_local
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_type_local
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_type_url
import nuvio.composeapp.generated.resources.live_tv_settings_playlist_url_label
import nuvio.composeapp.generated.resources.live_tv_settings_save_playlist
import nuvio.composeapp.generated.resources.live_tv_settings_section_navigation
import nuvio.composeapp.generated.resources.live_tv_settings_section_playlist
import org.jetbrains.compose.resources.stringResource

internal fun LazyListScope.liveTvSettingsContent(
    isTablet: Boolean,
    uiState: LiveTvUiState,
) {
    if (uiState.hasPlaylist) {
        item {
            SettingsSection(
                title = stringResource(Res.string.live_tv_settings_section_navigation),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    LiveTvNavigationVisibilityRow(
                        isTablet = isTablet,
                        enabled = uiState.isNavigationEnabled,
                        onEnabledChanged = LiveTvRepository::setNavigationEnabled,
                    )
                }
            }
        }
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.live_tv_settings_section_playlist),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                LiveTvPlaylistSourcesRow(
                    isTablet = isTablet,
                    uiState = uiState,
                    onUrlAdded = LiveTvRepository::addPlaylistUrl,
                    onLocalPlaylistAdded = LiveTvRepository::addLocalPlaylist,
                    onPlaylistUpdated = LiveTvRepository::updatePlaylist,
                    onPlaylistEnabledChanged = LiveTvRepository::setPlaylistEnabled,
                    onPlaylistRemoved = LiveTvRepository::removePlaylist,
                )
            }
        }
    }
}

@Composable
private fun LiveTvNavigationVisibilityRow(
    isTablet: Boolean,
    enabled: Boolean,
    onEnabledChanged: (Boolean) -> Unit,
) {
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 16.dp else 14.dp

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = stringResource(Res.string.live_tv_settings_navigation_title),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = stringResource(Res.string.live_tv_settings_navigation_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = enabled,
            onCheckedChange = onEnabledChanged,
        )
    }
}

@Composable
private fun LiveTvPlaylistSourcesRow(
    isTablet: Boolean,
    uiState: LiveTvUiState,
    onUrlAdded: (String?, String) -> Unit,
    onLocalPlaylistAdded: (String?, String?, String) -> Unit,
    onPlaylistUpdated: (playlistId: String, name: String, source: String) -> Unit,
    onPlaylistEnabledChanged: (playlistId: String, isEnabled: Boolean) -> Unit,
    onPlaylistRemoved: (String) -> Unit,
) {
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 16.dp else 14.dp
    var draftName by rememberSaveable { mutableStateOf("") }
    var draftUrl by rememberSaveable { mutableStateOf("") }
    var filePickerError by rememberSaveable { mutableStateOf<String?>(null) }
    val normalizedName = draftName.trim()
    val normalizedUrl = draftUrl.trim()
    val fallbackPickFileFailed = stringResource(Res.string.live_tv_settings_pick_file_failed)
    val filePicker = rememberLiveTvPlaylistFilePicker(
        onPlaylistLoaded = { fileName, content ->
            filePickerError = null
            onLocalPlaylistAdded(normalizedName.takeIf(String::isNotBlank), fileName, content)
            draftName = ""
        },
        onError = { message ->
            filePickerError = message.ifBlank { fallbackPickFileFailed }
        },
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = stringResource(Res.string.live_tv_settings_playlist_label),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = stringResource(Res.string.live_tv_settings_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        OutlinedTextField(
            value = draftName,
            onValueChange = { draftName = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text(stringResource(Res.string.live_tv_settings_playlist_name_placeholder)) },
            colors = liveTvOutlinedTextFieldColors(),
        )

        OutlinedTextField(
            value = draftUrl,
            onValueChange = { draftUrl = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text(stringResource(Res.string.live_tv_settings_playlist_placeholder)) },
            colors = liveTvOutlinedTextFieldColors(),
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Button(
                onClick = {
                    onUrlAdded(normalizedName.takeIf(String::isNotBlank), normalizedUrl)
                    draftName = ""
                    draftUrl = ""
                },
                enabled = normalizedUrl.isNotBlank(),
            ) {
                Text(stringResource(Res.string.live_tv_settings_add_url_playlist))
            }
            OutlinedButton(
                onClick = filePicker::launch,
                enabled = filePicker.canPickFiles,
            ) {
                Text(stringResource(Res.string.live_tv_settings_add_local_playlist))
            }
        }

        filePickerError?.takeIf(String::isNotBlank)?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

        Text(
            text = stringResource(Res.string.live_tv_settings_configured_playlists),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium,
        )

        if (uiState.playlists.isEmpty()) {
            Text(
                text = stringResource(Res.string.live_tv_settings_no_playlists),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                uiState.playlists.forEach { playlist ->
                    LiveTvPlaylistRow(
                        playlist = playlist,
                        onUpdate = { name, source -> onPlaylistUpdated(playlist.id, name, source) },
                        onEnabledChanged = { isEnabled -> onPlaylistEnabledChanged(playlist.id, isEnabled) },
                        onRemove = { onPlaylistRemoved(playlist.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun LiveTvPlaylistRow(
    playlist: LiveTvPlaylist,
    onUpdate: (name: String, source: String) -> Unit,
    onEnabledChanged: (Boolean) -> Unit,
    onRemove: () -> Unit,
) {
    var isEditing by rememberSaveable(playlist.id) { mutableStateOf(false) }
    var draftName by rememberSaveable(playlist.id) { mutableStateOf(playlist.name) }
    var draftSource by rememberSaveable(playlist.id) { mutableStateOf(playlist.source) }
    val sourceLabel = when (playlist.type) {
        LiveTvPlaylistType.Url -> playlist.source
        LiveTvPlaylistType.LocalFile -> stringResource(Res.string.live_tv_settings_playlist_source_local)
    }
    val enabledLabel = stringResource(
        if (playlist.isEnabled) {
            Res.string.live_tv_settings_playlist_enabled
        } else {
            Res.string.live_tv_settings_playlist_disabled
        },
    )

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (isEditing) {
            OutlinedTextField(
                value = draftName,
                onValueChange = { draftName = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text(stringResource(Res.string.live_tv_settings_playlist_name_label)) },
                colors = liveTvOutlinedTextFieldColors(),
            )
            if (playlist.type == LiveTvPlaylistType.Url) {
                OutlinedTextField(
                    value = draftSource,
                    onValueChange = { draftSource = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(stringResource(Res.string.live_tv_settings_playlist_url_label)) },
                    colors = liveTvOutlinedTextFieldColors(),
                )
            } else {
                Text(
                    text = sourceLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        onUpdate(draftName, draftSource)
                        isEditing = false
                    },
                    enabled = draftName.trim().isNotBlank() && draftSource.trim().isNotBlank(),
                ) {
                    Text(stringResource(Res.string.live_tv_settings_save_playlist))
                }
                OutlinedButton(
                    onClick = {
                        draftName = playlist.name
                        draftSource = playlist.source
                        isEditing = false
                    },
                ) {
                    Text(stringResource(Res.string.live_tv_settings_cancel_edit))
                }
            }
        } else {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = playlist.name,
                                modifier = Modifier.weight(1f, fill = false),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "($enabledLabel)",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (playlist.isEnabled) {
                                    LiveTvPlaylistEnabledColor
                                } else {
                                    LiveTvPlaylistDisabledColor
                                },
                                maxLines = 1,
                            )
                        }
                        Text(
                            text = sourceLabel,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Switch(
                        checked = playlist.isEnabled,
                        onCheckedChange = onEnabledChanged,
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { isEditing = true }) {
                        Text(stringResource(Res.string.live_tv_settings_edit_playlist))
                    }
                    TextButton(onClick = onRemove) {
                        Text(stringResource(Res.string.action_remove))
                    }
                }
            }
        }
    }
}

private val LiveTvPlaylistEnabledColor = Color(0xFF2E7D32)
private val LiveTvPlaylistDisabledColor = Color(0xFFC62828)

@Composable
private fun liveTvOutlinedTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.75f),
    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f),
    focusedContainerColor = MaterialTheme.colorScheme.surface,
    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
)
