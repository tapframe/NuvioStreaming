package com.nuvio.app.features.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.debrid.DEBRID_PREPARE_INSTANT_PLAYBACK_DEFAULT_LIMIT
import com.nuvio.app.features.debrid.DebridCredentialValidator
import com.nuvio.app.features.debrid.DebridProviders
import com.nuvio.app.features.debrid.DebridSettings
import com.nuvio.app.features.debrid.DebridSettingsRepository
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_reset
import nuvio.composeapp.generated.resources.action_save
import nuvio.composeapp.generated.resources.action_validate
import nuvio.composeapp.generated.resources.settings_debrid_add_key_first
import nuvio.composeapp.generated.resources.settings_debrid_description_template
import nuvio.composeapp.generated.resources.settings_debrid_description_template_description
import nuvio.composeapp.generated.resources.settings_debrid_enable
import nuvio.composeapp.generated.resources.settings_debrid_enable_description
import nuvio.composeapp.generated.resources.settings_debrid_prepare_count_many
import nuvio.composeapp.generated.resources.settings_debrid_prepare_count_one
import nuvio.composeapp.generated.resources.settings_debrid_prepare_instant_playback
import nuvio.composeapp.generated.resources.settings_debrid_prepare_instant_playback_description
import nuvio.composeapp.generated.resources.settings_debrid_prepare_stream_count
import nuvio.composeapp.generated.resources.settings_debrid_key_valid
import nuvio.composeapp.generated.resources.settings_debrid_key_invalid
import nuvio.composeapp.generated.resources.settings_debrid_name_template
import nuvio.composeapp.generated.resources.settings_debrid_name_template_description
import nuvio.composeapp.generated.resources.settings_debrid_provider_torbox_description
import nuvio.composeapp.generated.resources.settings_debrid_section_instant_playback
import nuvio.composeapp.generated.resources.settings_debrid_section_formatting
import nuvio.composeapp.generated.resources.settings_debrid_section_providers
import nuvio.composeapp.generated.resources.settings_debrid_section_title
import org.jetbrains.compose.resources.stringResource

internal fun LazyListScope.debridSettingsContent(
    isTablet: Boolean,
    settings: DebridSettings,
) {
    item {
        SettingsSection(
            title = stringResource(Res.string.settings_debrid_section_title),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_debrid_enable),
                    description = stringResource(Res.string.settings_debrid_enable_description),
                    checked = settings.enabled,
                    enabled = settings.hasAnyApiKey,
                    isTablet = isTablet,
                    onCheckedChange = DebridSettingsRepository::setEnabled,
                )
                if (!settings.hasAnyApiKey) {
                    SettingsGroupDivider(isTablet = isTablet)
                    DebridInfoRow(
                        isTablet = isTablet,
                        text = stringResource(Res.string.settings_debrid_add_key_first),
                    )
                }
            }
        }
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.settings_debrid_section_providers),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                DebridApiKeyRow(
                    isTablet = isTablet,
                    providerId = DebridProviders.TORBOX_ID,
                    title = DebridProviders.Torbox.displayName,
                    description = stringResource(Res.string.settings_debrid_provider_torbox_description),
                    value = settings.torboxApiKey,
                    onApiKeyCommitted = DebridSettingsRepository::setTorboxApiKey,
                )
            }
        }
    }

    item {
        var showPrepareCountDialog by rememberSaveable { mutableStateOf(false) }
        val prepareLimit = settings.instantPlaybackPreparationLimit
        val prepareEnabled = settings.enabled && prepareLimit > 0

        SettingsSection(
            title = stringResource(Res.string.settings_debrid_section_instant_playback),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_debrid_prepare_instant_playback),
                    description = stringResource(Res.string.settings_debrid_prepare_instant_playback_description),
                    checked = prepareEnabled,
                    enabled = settings.enabled && settings.hasAnyApiKey,
                    isTablet = isTablet,
                    onCheckedChange = { enabled ->
                        DebridSettingsRepository.setInstantPlaybackPreparationLimit(
                            if (enabled) DEBRID_PREPARE_INSTANT_PLAYBACK_DEFAULT_LIMIT else 0,
                        )
                    },
                )
                if (prepareEnabled) {
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsNavigationRow(
                        title = stringResource(Res.string.settings_debrid_prepare_stream_count),
                        description = prepareCountLabel(prepareLimit),
                        isTablet = isTablet,
                        onClick = { showPrepareCountDialog = true },
                    )
                }
            }
        }

        if (showPrepareCountDialog) {
            DebridPrepareCountDialog(
                selectedLimit = prepareLimit,
                onLimitSelected = { limit ->
                    DebridSettingsRepository.setInstantPlaybackPreparationLimit(limit)
                    showPrepareCountDialog = false
                },
                onDismiss = { showPrepareCountDialog = false },
            )
        }
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.settings_debrid_section_formatting),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                DebridTemplateRow(
                    isTablet = isTablet,
                    title = stringResource(Res.string.settings_debrid_name_template),
                    description = stringResource(Res.string.settings_debrid_name_template_description),
                    value = settings.streamNameTemplate,
                    singleLine = true,
                    onTemplateCommitted = DebridSettingsRepository::setStreamNameTemplate,
                )
                SettingsGroupDivider(isTablet = isTablet)
                DebridTemplateRow(
                    isTablet = isTablet,
                    title = stringResource(Res.string.settings_debrid_description_template),
                    description = stringResource(Res.string.settings_debrid_description_template_description),
                    value = settings.streamDescriptionTemplate,
                    singleLine = false,
                    onTemplateCommitted = DebridSettingsRepository::setStreamDescriptionTemplate,
                )
                SettingsGroupDivider(isTablet = isTablet)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = if (isTablet) 20.dp else 16.dp, vertical = 12.dp),
                ) {
                    TextButton(onClick = DebridSettingsRepository::resetStreamTemplates) {
                        Text(stringResource(Res.string.action_reset))
                    }
                }
            }
        }
    }
}

@Composable
private fun prepareCountLabel(limit: Int): String =
    if (limit == 1) {
        stringResource(Res.string.settings_debrid_prepare_count_one)
    } else {
        stringResource(Res.string.settings_debrid_prepare_count_many, limit)
    }

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DebridPrepareCountDialog(
    selectedLimit: Int,
    onLimitSelected: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val options = listOf(1, 2, 3, 5)

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
                    text = stringResource(Res.string.settings_debrid_prepare_stream_count),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    options.forEach { limit ->
                        val isSelected = limit == selectedLimit
                        val containerColor = if (isSelected) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                        }
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onLimitSelected(limit) },
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
                                    text = prepareCountLabel(limit),
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f),
                                )
                                Box(
                                    modifier = Modifier.size(24.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (isSelected) {
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
                }
            }
        }
    }
}

@Composable
private fun DebridApiKeyRow(
    isTablet: Boolean,
    providerId: String,
    title: String,
    description: String,
    value: String,
    onApiKeyCommitted: (String) -> Unit,
) {
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 16.dp else 14.dp
    val scope = rememberCoroutineScope()
    var draft by rememberSaveable(value) { mutableStateOf(value) }
    var isValidating by rememberSaveable(providerId) { mutableStateOf(false) }
    var validationMessage by rememberSaveable(providerId, value) { mutableStateOf<String?>(null) }
    val normalizedDraft = draft.trim()
    val validMessage = stringResource(Res.string.settings_debrid_key_valid)
    val invalidMessage = stringResource(Res.string.settings_debrid_key_invalid)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
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

        SettingsSecretTextField(
            value = draft,
            onValueChange = {
                draft = it
                validationMessage = null
            },
            modifier = Modifier.fillMaxWidth(),
            label = "$title API key",
        )

        validationMessage?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(
                onClick = {
                    draft = normalizedDraft
                    onApiKeyCommitted(normalizedDraft)
                },
                enabled = normalizedDraft != value && !isValidating,
            ) {
                Text(stringResource(Res.string.action_save))
            }
            TextButton(
                onClick = {
                    scope.launch {
                        isValidating = true
                        val valid = runCatching {
                            DebridCredentialValidator.validateProvider(providerId, normalizedDraft)
                        }.getOrDefault(false)
                        validationMessage = if (valid) validMessage else invalidMessage
                        isValidating = false
                    }
                },
                enabled = normalizedDraft.isNotBlank() && !isValidating,
            ) {
                Text(stringResource(Res.string.action_validate))
            }
        }
    }
}

@Composable
private fun DebridTemplateRow(
    isTablet: Boolean,
    title: String,
    description: String,
    value: String,
    singleLine: Boolean,
    onTemplateCommitted: (String) -> Unit,
) {
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 16.dp else 14.dp
    var draft by rememberSaveable(value) { mutableStateOf(value) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
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

        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = singleLine,
            minLines = if (singleLine) 1 else 4,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.75f),
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f),
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                disabledContainerColor = MaterialTheme.colorScheme.surface,
            ),
        )

        Row(modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = { onTemplateCommitted(draft) },
                enabled = draft != value,
            ) {
                Text(stringResource(Res.string.action_save))
            }
        }
    }
}

@Composable
private fun DebridInfoRow(
    isTablet: Boolean,
    text: String,
) {
    Text(
        text = text,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = if (isTablet) 20.dp else 16.dp, vertical = if (isTablet) 14.dp else 12.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
