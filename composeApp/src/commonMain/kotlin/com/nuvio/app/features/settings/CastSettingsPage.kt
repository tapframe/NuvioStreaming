package com.nuvio.app.features.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.NuvioBottomSheetActionRow
import com.nuvio.app.core.ui.NuvioBottomSheetDivider
import com.nuvio.app.core.ui.NuvioModalBottomSheet
import com.nuvio.app.core.ui.dismissNuvioBottomSheet
import com.nuvio.app.features.cast.CastMaxResolution
import com.nuvio.app.features.cast.CastSettingsRepository
import com.nuvio.app.features.cast.CastTranscodeMode
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import nuvio.composeapp.generated.resources.*

@Composable
private fun transcodeModeLabel(mode: CastTranscodeMode): String = when (mode) {
    CastTranscodeMode.DISABLED -> stringResource(Res.string.cast_transcode_disabled)
    CastTranscodeMode.AUTO -> stringResource(Res.string.cast_transcode_auto)
    CastTranscodeMode.ALWAYS -> stringResource(Res.string.cast_transcode_always)
}

@Composable
private fun maxResolutionLabel(res: CastMaxResolution): String = when (res) {
    CastMaxResolution.SOURCE -> stringResource(Res.string.cast_res_source)
    CastMaxResolution.P1080 -> "1080p"
    CastMaxResolution.P720 -> "720p"
    CastMaxResolution.P480 -> "480p"
}

internal fun LazyListScope.castSettingsContent(
    isTablet: Boolean,
) {
    item {
        val castState by CastSettingsRepository.uiState.collectAsStateWithLifecycle()
        var showTranscodeModeSheet by remember { mutableStateOf(false) }
        var showMaxResolutionSheet by remember { mutableStateOf(false) }

        Column(verticalArrangement = Arrangement.spacedBy(if (isTablet) 18.dp else 12.dp)) {
            SettingsSection(
                title = stringResource(Res.string.cast_section_dlna),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    SettingsSwitchRow(
                        title = stringResource(Res.string.cast_proxy_enabled),
                        description = stringResource(Res.string.cast_proxy_enabled_desc),
                        checked = castState.proxyEnabled,
                        isTablet = isTablet,
                        onCheckedChange = CastSettingsRepository::setProxyEnabled,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    Text(
                        text = stringResource(Res.string.cast_proxy_info),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = if (isTablet) 18.dp else 16.dp, vertical = 8.dp)
                    )
                }
            }

            SettingsSection(
                title = stringResource(Res.string.cast_section_transcode),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    SettingsNavigationRow(
                        title = stringResource(Res.string.cast_transcode_mode),
                        description = transcodeModeLabel(castState.transcodeMode),
                        enabled = castState.proxyEnabled,
                        isTablet = isTablet,
                        onClick = { showTranscodeModeSheet = true },
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = stringResource(Res.string.cast_max_resolution),
                        description = maxResolutionLabel(castState.maxResolution),
                        enabled = castState.proxyEnabled && castState.transcodeMode != CastTranscodeMode.DISABLED,
                        isTablet = isTablet,
                        onClick = { showMaxResolutionSheet = true },
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsSwitchRow(
                        title = stringResource(Res.string.cast_hw_accel),
                        description = stringResource(Res.string.cast_hw_accel_desc),
                        checked = castState.useHardwareAcceleration,
                        enabled = castState.proxyEnabled && castState.transcodeMode != CastTranscodeMode.DISABLED,
                        isTablet = isTablet,
                        onCheckedChange = CastSettingsRepository::setUseHardwareAcceleration,
                    )
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsSwitchRow(
                        title = stringResource(Res.string.cast_transcode_audio),
                        description = stringResource(Res.string.cast_transcode_audio_desc),
                        checked = castState.transcodeAudioToAac,
                        enabled = castState.proxyEnabled && castState.transcodeMode != CastTranscodeMode.DISABLED,
                        isTablet = isTablet,
                        onCheckedChange = CastSettingsRepository::setTranscodeAudioToAac,
                    )
                }
            }

            SettingsSection(
                title = stringResource(Res.string.cast_section_info),
                isTablet = isTablet,
            ) {
                SettingsGroup(isTablet = isTablet) {
                    Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = stringResource(Res.string.cast_info_title),
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold)
                        )
                        Text(
                            text = stringResource(Res.string.cast_info_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = stringResource(Res.string.cast_info_note),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        if (showTranscodeModeSheet) {
            TranscodeModeBottomSheet(
                selectedMode = castState.transcodeMode,
                onModeSelected = {
                    CastSettingsRepository.setTranscodeMode(it)
                    showTranscodeModeSheet = false
                },
                onDismiss = { showTranscodeModeSheet = false },
            )
        }

        if (showMaxResolutionSheet) {
            MaxResolutionBottomSheet(
                selectedResolution = castState.maxResolution,
                onResolutionSelected = {
                    CastSettingsRepository.setMaxResolution(it)
                    showMaxResolutionSheet = false
                },
                onDismiss = { showMaxResolutionSheet = false },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TranscodeModeBottomSheet(
    selectedMode: CastTranscodeMode,
    onModeSelected: (CastTranscodeMode) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    NuvioModalBottomSheet(
        onDismissRequest = { scope.launch { dismissNuvioBottomSheet(sheetState, onDismiss) } },
        sheetState = sheetState,
    ) {
        LazyColumn(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            item {
                Text(
                    text = stringResource(Res.string.cast_transcode_mode),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                )
            }
            itemsIndexed(CastTranscodeMode.entries.toList()) { index, mode ->
                if (index > 0) NuvioBottomSheetDivider()
                NuvioBottomSheetActionRow(
                    title = transcodeModeLabel(mode),
                    onClick = {
                        onModeSelected(mode)
                        scope.launch { dismissNuvioBottomSheet(sheetState, onDismiss) }
                    },
                    trailingContent = {
                        if (mode == selectedMode) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = stringResource(Res.string.cd_selected),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MaxResolutionBottomSheet(
    selectedResolution: CastMaxResolution,
    onResolutionSelected: (CastMaxResolution) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    NuvioModalBottomSheet(
        onDismissRequest = { scope.launch { dismissNuvioBottomSheet(sheetState, onDismiss) } },
        sheetState = sheetState,
    ) {
        LazyColumn(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            item {
                Text(
                    text = stringResource(Res.string.cast_max_resolution),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                )
            }
            itemsIndexed(CastMaxResolution.entries.toList()) { index, res ->
                if (index > 0) NuvioBottomSheetDivider()
                NuvioBottomSheetActionRow(
                    title = maxResolutionLabel(res),
                    onClick = {
                        onResolutionSelected(res)
                        scope.launch { dismissNuvioBottomSheet(sheetState, onDismiss) }
                    },
                    trailingContent = {
                        if (res == selectedResolution) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = stringResource(Res.string.cd_selected),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                    },
                )
            }
        }
    }
}
