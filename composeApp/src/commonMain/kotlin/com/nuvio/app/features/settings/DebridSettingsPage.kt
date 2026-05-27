package com.nuvio.app.features.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.debrid.DEBRID_PREPARE_INSTANT_PLAYBACK_DEFAULT_LIMIT
import com.nuvio.app.features.debrid.DebridCredentialValidator
import com.nuvio.app.features.debrid.DebridDeviceAuthorization
import com.nuvio.app.features.debrid.DebridDeviceAuthorizationTokenResult
import com.nuvio.app.features.debrid.DebridProvider
import com.nuvio.app.features.debrid.DebridProviderApis
import com.nuvio.app.features.debrid.DebridProviderAuthMethod
import com.nuvio.app.features.debrid.DebridProviders
import com.nuvio.app.features.debrid.DebridSettings
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.debrid.DebridStreamFormatterDefaults
import com.nuvio.app.features.debrid.DebridStreamAudioChannel
import com.nuvio.app.features.debrid.DebridStreamAudioTag
import com.nuvio.app.features.debrid.DebridStreamEncode
import com.nuvio.app.features.debrid.DebridStreamLanguage
import com.nuvio.app.features.debrid.DebridStreamPreferences
import com.nuvio.app.features.debrid.DebridStreamQuality
import com.nuvio.app.features.debrid.DebridStreamResolution
import com.nuvio.app.features.debrid.DebridStreamSortCriterion
import com.nuvio.app.features.debrid.DebridStreamSortDirection
import com.nuvio.app.features.debrid.DebridStreamSortKey
import com.nuvio.app.features.debrid.DebridStreamVisualTag
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_cancel
import nuvio.composeapp.generated.resources.action_clear
import nuvio.composeapp.generated.resources.action_retry
import nuvio.composeapp.generated.resources.action_reset
import nuvio.composeapp.generated.resources.action_save
import nuvio.composeapp.generated.resources.action_saving
import nuvio.composeapp.generated.resources.settings_debrid_add_key_first
import nuvio.composeapp.generated.resources.settings_debrid_cloud_library
import nuvio.composeapp.generated.resources.settings_debrid_cloud_library_description
import nuvio.composeapp.generated.resources.settings_debrid_connected
import nuvio.composeapp.generated.resources.settings_debrid_connect_provider
import nuvio.composeapp.generated.resources.settings_debrid_disconnect_provider
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_code_copied
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_connected
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_expired
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_failed
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_instructions
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_missing_configuration
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_open
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_starting
import nuvio.composeapp.generated.resources.settings_debrid_device_auth_waiting
import nuvio.composeapp.generated.resources.settings_debrid_dialog_placeholder
import nuvio.composeapp.generated.resources.settings_debrid_dialog_subtitle
import nuvio.composeapp.generated.resources.settings_debrid_dialog_title
import nuvio.composeapp.generated.resources.settings_debrid_disconnect
import nuvio.composeapp.generated.resources.settings_debrid_enable
import nuvio.composeapp.generated.resources.settings_debrid_enable_description
import nuvio.composeapp.generated.resources.settings_debrid_experimental_notice
import nuvio.composeapp.generated.resources.settings_debrid_description_template
import nuvio.composeapp.generated.resources.settings_debrid_description_template_description
import nuvio.composeapp.generated.resources.settings_debrid_formatter_reset_subtitle
import nuvio.composeapp.generated.resources.settings_debrid_formatter_reset_title
import nuvio.composeapp.generated.resources.settings_debrid_prepare_count_many
import nuvio.composeapp.generated.resources.settings_debrid_prepare_count_one
import nuvio.composeapp.generated.resources.settings_debrid_prepare_instant_playback
import nuvio.composeapp.generated.resources.settings_debrid_prepare_instant_playback_description
import nuvio.composeapp.generated.resources.settings_debrid_prepare_stream_count
import nuvio.composeapp.generated.resources.settings_debrid_prepare_stream_count_warning
import nuvio.composeapp.generated.resources.settings_debrid_key_invalid
import nuvio.composeapp.generated.resources.settings_debrid_name_template
import nuvio.composeapp.generated.resources.settings_debrid_name_template_description
import nuvio.composeapp.generated.resources.settings_debrid_not_set
import nuvio.composeapp.generated.resources.settings_debrid_provider_description
import nuvio.composeapp.generated.resources.settings_debrid_provider_device_description
import nuvio.composeapp.generated.resources.settings_debrid_resolve_with
import nuvio.composeapp.generated.resources.settings_debrid_resolve_with_description
import nuvio.composeapp.generated.resources.settings_debrid_section_instant_playback
import nuvio.composeapp.generated.resources.settings_debrid_section_formatting
import nuvio.composeapp.generated.resources.settings_debrid_section_providers
import nuvio.composeapp.generated.resources.settings_debrid_section_title
import org.jetbrains.compose.resources.stringResource

private const val CLOUD_SERVICES_FAQ_URL = "https://nuvioapp.space/faq#common-cloud-library-and-cloud-services"

internal fun LazyListScope.debridSettingsContent(
    isTablet: Boolean,
    settings: DebridSettings,
) {
    item {
        var showResolverProviderDialog by rememberSaveable { mutableStateOf(false) }
        val resolverProviders = settings.resolverServices.map { it.provider }
        val activeResolverProvider = settings.activeResolverCredential?.provider
        SettingsSection(
            title = stringResource(Res.string.settings_debrid_section_title),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                DebridInfoRow(
                    isTablet = isTablet,
                    text = stringResource(Res.string.settings_debrid_experimental_notice),
                )
                SettingsGroupDivider(isTablet = isTablet)
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_debrid_cloud_library),
                    description = stringResource(Res.string.settings_debrid_cloud_library_description),
                    checked = settings.canUseCloudLibrary,
                    enabled = settings.hasCloudLibraryProvider,
                    isTablet = isTablet,
                    onCheckedChange = DebridSettingsRepository::setCloudLibraryEnabled,
                )
                SettingsGroupDivider(isTablet = isTablet)
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_debrid_enable),
                    description = stringResource(Res.string.settings_debrid_enable_description),
                    checked = settings.canResolvePlayableLinks,
                    enabled = settings.hasResolverProvider,
                    isTablet = isTablet,
                    onCheckedChange = DebridSettingsRepository::setLinkResolvingEnabled,
                )
                if (settings.canResolvePlayableLinks && resolverProviders.size > 1 && activeResolverProvider != null) {
                    SettingsGroupDivider(isTablet = isTablet)
                    DebridPreferenceRow(
                        isTablet = isTablet,
                        title = stringResource(Res.string.settings_debrid_resolve_with),
                        description = stringResource(Res.string.settings_debrid_resolve_with_description),
                        value = activeResolverProvider.displayName,
                        enabled = true,
                        onClick = { showResolverProviderDialog = true },
                    )
                }
                if (!settings.hasResolverProvider) {
                    SettingsGroupDivider(isTablet = isTablet)
                    DebridInfoRow(
                        isTablet = isTablet,
                        text = stringResource(Res.string.settings_debrid_add_key_first),
                    )
                }
            }
        }

        if (showResolverProviderDialog && resolverProviders.size > 1 && activeResolverProvider != null) {
            DebridSingleChoiceDialog(
                title = stringResource(Res.string.settings_debrid_resolve_with),
                selectedValue = activeResolverProvider,
                options = resolverProviders,
                label = { provider -> provider.displayName },
                onSelected = { provider -> DebridSettingsRepository.setPreferredResolverProviderId(provider.id) },
                onDismiss = { showResolverProviderDialog = false },
            )
        }
    }

    item {
        var activeApiKeyProviderId by rememberSaveable { mutableStateOf<String?>(null) }
        var activeDeviceAuthProviderId by rememberSaveable { mutableStateOf<String?>(null) }
        val providers = remember { DebridProviders.visible() }
        val notSetLabel = stringResource(Res.string.settings_debrid_not_set)
        val connectedLabel = stringResource(Res.string.settings_debrid_connected)

        SettingsSection(
            title = stringResource(Res.string.settings_debrid_section_providers),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                providers.forEachIndexed { index, provider ->
                    if (index > 0) {
                        SettingsGroupDivider(isTablet = isTablet)
                    }
                    DebridPreferenceRow(
                        isTablet = isTablet,
                        title = provider.displayName,
                        description = if (provider.authMethod == DebridProviderAuthMethod.DeviceCode) {
                            stringResource(Res.string.settings_debrid_provider_device_description, provider.displayName)
                        } else {
                            stringResource(Res.string.settings_debrid_provider_description, provider.displayName)
                        },
                        value = providerCredentialStatus(
                            provider = provider,
                            credential = settings.apiKeyFor(provider.id),
                            notSetLabel = notSetLabel,
                            connectedLabel = connectedLabel,
                        ),
                        enabled = true,
                        onClick = {
                            when (provider.authMethod) {
                                DebridProviderAuthMethod.DeviceCode -> activeDeviceAuthProviderId = provider.id
                                DebridProviderAuthMethod.ApiKey -> activeApiKeyProviderId = provider.id
                            }
                        },
                    )
                }
            }
        }

        activeDeviceAuthProviderId
            ?.let(DebridProviders::byId)
            ?.let { provider ->
                DebridDeviceAuthDialog(
                    provider = provider,
                    currentValue = settings.apiKeyFor(provider.id),
                    onConnected = { token -> DebridSettingsRepository.setProviderApiKey(provider.id, token) },
                    onDisconnect = { DebridSettingsRepository.setProviderApiKey(provider.id, "") },
                    onDismiss = { activeDeviceAuthProviderId = null },
                )
            }

        activeApiKeyProviderId
            ?.let(DebridProviders::byId)
            ?.let { provider ->
                DebridApiKeyDialog(
                    providerId = provider.id,
                    title = stringResource(Res.string.settings_debrid_dialog_title, provider.displayName),
                    subtitle = stringResource(Res.string.settings_debrid_dialog_subtitle, provider.displayName),
                    placeholder = stringResource(Res.string.settings_debrid_dialog_placeholder, provider.displayName),
                    currentValue = settings.apiKeyFor(provider.id),
                    onSave = { apiKey -> DebridSettingsRepository.setProviderApiKey(provider.id, apiKey) },
                    onDismiss = { activeApiKeyProviderId = null },
                )
            }
    }

    if (!settings.canResolvePlayableLinks) {
        debridLearnMoreFooterItem(isTablet)
        return
    }

    item {
        var showPrepareCountDialog by rememberSaveable { mutableStateOf(false) }
        val prepareLimit = settings.instantPlaybackPreparationLimit
        val prepareEnabled = prepareLimit > 0

        SettingsSection(
            title = stringResource(Res.string.settings_debrid_section_instant_playback),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_debrid_prepare_instant_playback),
                    description = stringResource(Res.string.settings_debrid_prepare_instant_playback_description),
                    checked = prepareEnabled,
                    enabled = settings.canResolvePlayableLinks,
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
        var activeStreamPicker by rememberSaveable { mutableStateOf<DebridStreamPicker?>(null) }
        val preferences = settings.streamPreferences
        val rows = debridRuleRows(preferences)

        SettingsSection(
            title = "Result Management",
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                DebridPreferenceRow(
                    isTablet = isTablet,
                    title = "Max results",
                    description = "Limit how many results appear.",
                    value = streamMaxResultsLabel(preferences.maxResults),
                    enabled = settings.canResolvePlayableLinks,
                    onClick = { activeStreamPicker = DebridStreamPicker.MAX_RESULTS },
                )
                SettingsGroupDivider(isTablet = isTablet)
                DebridPreferenceRow(
                    isTablet = isTablet,
                    title = "Sort results",
                    description = "Choose how results are ordered.",
                    value = sortProfileLabel(preferences.sortCriteria),
                    enabled = settings.canResolvePlayableLinks,
                    onClick = { activeStreamPicker = DebridStreamPicker.SORT_MODE },
                )
                SettingsGroupDivider(isTablet = isTablet)
                DebridPreferenceRow(
                    isTablet = isTablet,
                    title = "Per resolution limit",
                    description = "Cap repeated 2160p, 1080p, 720p results after sorting.",
                    value = streamMaxResultsLabel(preferences.maxPerResolution),
                    enabled = settings.canResolvePlayableLinks,
                    onClick = { activeStreamPicker = DebridStreamPicker.MAX_PER_RESOLUTION },
                )
                SettingsGroupDivider(isTablet = isTablet)
                DebridPreferenceRow(
                    isTablet = isTablet,
                    title = "Per quality limit",
                    description = "Cap repeated BluRay, WEB-DL, REMUX results after sorting.",
                    value = streamMaxResultsLabel(preferences.maxPerQuality),
                    enabled = settings.canResolvePlayableLinks,
                    onClick = { activeStreamPicker = DebridStreamPicker.MAX_PER_QUALITY },
                )
                SettingsGroupDivider(isTablet = isTablet)
                DebridPreferenceRow(
                    isTablet = isTablet,
                    title = "Size range",
                    description = "Filter results by file size.",
                    value = sizeRangeLabel(preferences),
                    enabled = settings.canResolvePlayableLinks,
                    onClick = { activeStreamPicker = DebridStreamPicker.SIZE_RANGE },
                )
                rows.forEach { row ->
                    SettingsGroupDivider(isTablet = isTablet)
                    DebridPreferenceRow(
                        isTablet = isTablet,
                        title = row.title,
                        description = row.description,
                        value = row.value,
                        enabled = settings.canResolvePlayableLinks,
                        onClick = { activeStreamPicker = row.picker },
                    )
                }
            }
        }

        activeStreamPicker?.let { picker ->
            DebridStreamPreferenceDialog(
                picker = picker,
                preferences = preferences,
                onPreferencesChanged = DebridSettingsRepository::setStreamPreferences,
                onDismiss = { activeStreamPicker = null },
            )
        }
    }

    item {
        var activeTemplateField by rememberSaveable { mutableStateOf<DebridTemplateField?>(null) }

        SettingsSection(
            title = stringResource(Res.string.settings_debrid_section_formatting),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                DebridPreferenceRow(
                    isTablet = isTablet,
                    title = stringResource(Res.string.settings_debrid_name_template),
                    description = stringResource(Res.string.settings_debrid_name_template_description),
                    value = templatePreview(
                        value = settings.streamNameTemplate,
                        defaultValue = DebridStreamFormatterDefaults.NAME_TEMPLATE,
                    ),
                    enabled = settings.canResolvePlayableLinks,
                    onClick = { activeTemplateField = DebridTemplateField.NAME },
                )
                SettingsGroupDivider(isTablet = isTablet)
                DebridPreferenceRow(
                    isTablet = isTablet,
                    title = stringResource(Res.string.settings_debrid_description_template),
                    description = stringResource(Res.string.settings_debrid_description_template_description),
                    value = templatePreview(
                        value = settings.streamDescriptionTemplate,
                        defaultValue = DebridStreamFormatterDefaults.DESCRIPTION_TEMPLATE,
                    ),
                    enabled = settings.canResolvePlayableLinks,
                    onClick = { activeTemplateField = DebridTemplateField.DESCRIPTION },
                )
                SettingsGroupDivider(isTablet = isTablet)
                DebridPreferenceRow(
                    isTablet = isTablet,
                    title = stringResource(Res.string.settings_debrid_formatter_reset_title),
                    description = stringResource(Res.string.settings_debrid_formatter_reset_subtitle),
                    value = stringResource(Res.string.action_reset),
                    enabled = settings.canResolvePlayableLinks,
                    onClick = DebridSettingsRepository::resetStreamTemplates,
                )
            }
        }

        when (activeTemplateField) {
            DebridTemplateField.NAME -> DebridTemplateDialog(
                title = stringResource(Res.string.settings_debrid_name_template),
                description = stringResource(Res.string.settings_debrid_name_template_description),
                currentValue = settings.streamNameTemplate,
                defaultValue = DebridStreamFormatterDefaults.NAME_TEMPLATE,
                onSave = DebridSettingsRepository::setStreamNameTemplate,
                onDismiss = { activeTemplateField = null },
            )
            DebridTemplateField.DESCRIPTION -> DebridTemplateDialog(
                title = stringResource(Res.string.settings_debrid_description_template),
                description = stringResource(Res.string.settings_debrid_description_template_description),
                currentValue = settings.streamDescriptionTemplate,
                defaultValue = DebridStreamFormatterDefaults.DESCRIPTION_TEMPLATE,
                onSave = DebridSettingsRepository::setStreamDescriptionTemplate,
                onDismiss = { activeTemplateField = null },
            )
            null -> Unit
        }
    }

    debridLearnMoreFooterItem(isTablet)
}

private fun LazyListScope.debridLearnMoreFooterItem(isTablet: Boolean) {
    item {
        val uriHandler = LocalUriHandler.current
        DebridLearnMoreFooter(
            isTablet = isTablet,
            onClick = { runCatching { uriHandler.openUri(CLOUD_SERVICES_FAQ_URL) } },
        )
    }
}

@Composable
private fun DebridLearnMoreFooter(
    isTablet: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = if (isTablet) 4.dp else 0.dp, bottom = if (isTablet) 10.dp else 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        TextButton(onClick = onClick) {
            Text("Learn more")
        }
    }
}

private enum class DebridTemplateField {
    NAME,
    DESCRIPTION,
}

private fun templatePreview(value: String, defaultValue: String): String {
    if (value.trim().isBlank() || value.trim() == defaultValue.trim()) return "Default format"
    val firstLine = value
        .lineSequence()
        .map { it.trim() }
        .firstOrNull { it.isNotBlank() }
        ?: return "Default format"
    return if (firstLine.length <= 28) firstLine else "${firstLine.take(28)}..."
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

                Text(
                    text = stringResource(Res.string.settings_debrid_prepare_stream_count_warning),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DebridTemplateDialog(
    title: String,
    description: String,
    currentValue: String,
    defaultValue: String,
    onSave: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by rememberSaveable(currentValue) { mutableStateOf(currentValue) }

    BasicAlertDialog(onDismissRequest = onDismiss) {
        DebridDialogSurface(title = title) {
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 140.dp, max = 280.dp),
                minLines = 5,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.75f),
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f),
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    disabledContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                TextButton(onClick = { draft = defaultValue }) {
                    Text(
                        text = stringResource(Res.string.action_reset),
                        maxLines = 1,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(
                            text = stringResource(Res.string.action_cancel),
                            maxLines = 1,
                        )
                    }
                    Button(
                        onClick = {
                            onSave(draft)
                            onDismiss()
                        },
                    ) {
                        Text(
                            text = stringResource(Res.string.action_save),
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DebridPreferenceRow(
    isTablet: Boolean,
    title: String,
    description: String,
    value: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val horizontalPadding = if (isTablet) 20.dp else 16.dp
    val verticalPadding = if (isTablet) 16.dp else 14.dp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(
            modifier = Modifier.weight(1f),
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
            color = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun DebridStreamPreferenceDialog(
    picker: DebridStreamPicker,
    preferences: DebridStreamPreferences,
    onPreferencesChanged: (DebridStreamPreferences) -> Unit,
    onDismiss: () -> Unit,
) {
    when (picker) {
        DebridStreamPicker.MAX_RESULTS -> DebridIntChoiceDialog(
            title = "Max results",
            selectedValue = preferences.maxResults,
            options = listOf(0, 5, 10, 20, 50),
            label = { streamMaxResultsLabel(it) },
            onSelected = { value -> onPreferencesChanged(preferences.copy(maxResults = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.MAX_PER_RESOLUTION -> DebridIntChoiceDialog(
            title = "Max results",
            selectedValue = preferences.maxPerResolution,
            options = listOf(0, 1, 2, 3, 5),
            label = { streamMaxResultsLabel(it) },
            onSelected = { value -> onPreferencesChanged(preferences.copy(maxPerResolution = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.MAX_PER_QUALITY -> DebridIntChoiceDialog(
            title = "Max results",
            selectedValue = preferences.maxPerQuality,
            options = listOf(0, 1, 2, 3, 5),
            label = { streamMaxResultsLabel(it) },
            onSelected = { value -> onPreferencesChanged(preferences.copy(maxPerQuality = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.SORT_MODE -> DebridSingleChoiceDialog(
            title = "Sort results",
            selectedValue = sortProfileFor(preferences.sortCriteria),
            options = listOf(
                DebridSortProfile.DEFAULT,
                DebridSortProfile.LARGEST,
                DebridSortProfile.SMALLEST,
                DebridSortProfile.AUDIO,
                DebridSortProfile.LANGUAGE,
            ),
            label = { sortProfileLabel(it) },
            onSelected = { value -> onPreferencesChanged(preferences.copy(sortCriteria = sortCriteriaForProfile(value))) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.SIZE_RANGE -> DebridSingleChoiceDialog(
            title = "Size range",
            selectedValue = preferences.sizeMinGb to preferences.sizeMaxGb,
            options = listOf(0 to 0, 0 to 5, 0 to 10, 5 to 20, 10 to 50, 20 to 100),
            label = { sizeRangeLabel(it.first, it.second) },
            onSelected = { value -> onPreferencesChanged(preferences.copy(sizeMinGb = value.first, sizeMaxGb = value.second)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.PREFERRED_RESOLUTIONS -> DebridMultiChoiceDialog(
            title = "Preferred resolutions",
            selectedValues = preferences.preferredResolutions,
            values = DebridStreamResolution.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(preferredResolutions = value.ifEmpty { DebridStreamResolution.defaultOrder })) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.REQUIRED_RESOLUTIONS -> DebridMultiChoiceDialog(
            title = "Required resolutions",
            selectedValues = preferences.requiredResolutions,
            values = DebridStreamResolution.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(requiredResolutions = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.EXCLUDED_RESOLUTIONS -> DebridMultiChoiceDialog(
            title = "Excluded resolutions",
            selectedValues = preferences.excludedResolutions,
            values = DebridStreamResolution.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(excludedResolutions = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.PREFERRED_QUALITIES -> DebridMultiChoiceDialog(
            title = "Preferred qualities",
            selectedValues = preferences.preferredQualities,
            values = DebridStreamQuality.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(preferredQualities = value.ifEmpty { DebridStreamQuality.defaultOrder })) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.REQUIRED_QUALITIES -> DebridMultiChoiceDialog(
            title = "Required qualities",
            selectedValues = preferences.requiredQualities,
            values = DebridStreamQuality.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(requiredQualities = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.EXCLUDED_QUALITIES -> DebridMultiChoiceDialog(
            title = "Excluded qualities",
            selectedValues = preferences.excludedQualities,
            values = DebridStreamQuality.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(excludedQualities = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.PREFERRED_VISUAL_TAGS -> DebridMultiChoiceDialog(
            title = "Preferred visual tags",
            selectedValues = preferences.preferredVisualTags,
            values = DebridStreamVisualTag.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(preferredVisualTags = value.ifEmpty { DebridStreamVisualTag.defaultOrder })) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.REQUIRED_VISUAL_TAGS -> DebridMultiChoiceDialog(
            title = "Required visual tags",
            selectedValues = preferences.requiredVisualTags,
            values = DebridStreamVisualTag.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(requiredVisualTags = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.EXCLUDED_VISUAL_TAGS -> DebridMultiChoiceDialog(
            title = "Excluded visual tags",
            selectedValues = preferences.excludedVisualTags,
            values = DebridStreamVisualTag.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(excludedVisualTags = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.PREFERRED_AUDIO_TAGS -> DebridMultiChoiceDialog(
            title = "Preferred audio tags",
            selectedValues = preferences.preferredAudioTags,
            values = DebridStreamAudioTag.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(preferredAudioTags = value.ifEmpty { DebridStreamAudioTag.defaultOrder })) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.REQUIRED_AUDIO_TAGS -> DebridMultiChoiceDialog(
            title = "Required audio tags",
            selectedValues = preferences.requiredAudioTags,
            values = DebridStreamAudioTag.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(requiredAudioTags = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.EXCLUDED_AUDIO_TAGS -> DebridMultiChoiceDialog(
            title = "Excluded audio tags",
            selectedValues = preferences.excludedAudioTags,
            values = DebridStreamAudioTag.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(excludedAudioTags = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.PREFERRED_AUDIO_CHANNELS -> DebridMultiChoiceDialog(
            title = "Preferred channels",
            selectedValues = preferences.preferredAudioChannels,
            values = DebridStreamAudioChannel.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(preferredAudioChannels = value.ifEmpty { DebridStreamAudioChannel.defaultOrder })) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.REQUIRED_AUDIO_CHANNELS -> DebridMultiChoiceDialog(
            title = "Required channels",
            selectedValues = preferences.requiredAudioChannels,
            values = DebridStreamAudioChannel.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(requiredAudioChannels = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.EXCLUDED_AUDIO_CHANNELS -> DebridMultiChoiceDialog(
            title = "Excluded channels",
            selectedValues = preferences.excludedAudioChannels,
            values = DebridStreamAudioChannel.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(excludedAudioChannels = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.PREFERRED_ENCODES -> DebridMultiChoiceDialog(
            title = "Preferred encodes",
            selectedValues = preferences.preferredEncodes,
            values = DebridStreamEncode.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(preferredEncodes = value.ifEmpty { DebridStreamEncode.defaultOrder })) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.REQUIRED_ENCODES -> DebridMultiChoiceDialog(
            title = "Required encodes",
            selectedValues = preferences.requiredEncodes,
            values = DebridStreamEncode.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(requiredEncodes = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.EXCLUDED_ENCODES -> DebridMultiChoiceDialog(
            title = "Excluded encodes",
            selectedValues = preferences.excludedEncodes,
            values = DebridStreamEncode.defaultOrder,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(excludedEncodes = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.PREFERRED_LANGUAGES -> DebridMultiChoiceDialog(
            title = "Preferred languages",
            selectedValues = preferences.preferredLanguages,
            values = DebridStreamLanguage.entries,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(preferredLanguages = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.REQUIRED_LANGUAGES -> DebridMultiChoiceDialog(
            title = "Required languages",
            selectedValues = preferences.requiredLanguages,
            values = DebridStreamLanguage.entries,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(requiredLanguages = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.EXCLUDED_LANGUAGES -> DebridMultiChoiceDialog(
            title = "Excluded languages",
            selectedValues = preferences.excludedLanguages,
            values = DebridStreamLanguage.entries,
            label = { it.label },
            onSelected = { value -> onPreferencesChanged(preferences.copy(excludedLanguages = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.REQUIRED_RELEASE_GROUPS -> DebridTextListDialog(
            title = "Required release groups",
            selectedValues = preferences.requiredReleaseGroups,
            onSelected = { value -> onPreferencesChanged(preferences.copy(requiredReleaseGroups = value)) },
            onDismiss = onDismiss,
        )
        DebridStreamPicker.EXCLUDED_RELEASE_GROUPS -> DebridTextListDialog(
            title = "Excluded release groups",
            selectedValues = preferences.excludedReleaseGroups,
            onSelected = { value -> onPreferencesChanged(preferences.copy(excludedReleaseGroups = value)) },
            onDismiss = onDismiss,
        )
    }
}

@Composable
private fun DebridIntChoiceDialog(
    title: String,
    selectedValue: Int,
    options: List<Int>,
    label: @Composable (Int) -> String,
    onSelected: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    DebridSingleChoiceDialog(
        title = title,
        selectedValue = selectedValue,
        options = options,
        label = label,
        onSelected = onSelected,
        onDismiss = onDismiss,
    )
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun <T> DebridSingleChoiceDialog(
    title: String,
    selectedValue: T,
    options: List<T>,
    label: @Composable (T) -> String,
    onSelected: (T) -> Unit,
    onDismiss: () -> Unit,
) {
    BasicAlertDialog(onDismissRequest = onDismiss) {
        DebridDialogSurface(title = title) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 420.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(options) { option ->
                    DebridDialogOptionRow(
                        text = label(option),
                        selected = option == selectedValue,
                        onClick = {
                            onSelected(option)
                            onDismiss()
                        },
                    )
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun <T> DebridMultiChoiceDialog(
    title: String,
    selectedValues: List<T>,
    values: List<T>,
    label: @Composable (T) -> String,
    onSelected: (List<T>) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember(selectedValues) { mutableStateOf(selectedValues) }
    BasicAlertDialog(onDismissRequest = onDismiss) {
        DebridDialogSurface(title = title) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 420.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(values) { option ->
                    val selected = option in draft
                    DebridDialogOptionRow(
                        text = label(option),
                        selected = selected,
                        showCheckbox = true,
                        onClick = {
                            draft = if (selected) {
                                draft - option
                            } else {
                                draft + option
                            }
                        },
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                TextButton(onClick = { draft = emptyList() }) {
                    Text(stringResource(Res.string.action_clear))
                }
                Button(
                    onClick = {
                        onSelected(draft)
                        onDismiss()
                    },
                ) {
                    Text(stringResource(Res.string.action_save))
                }
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DebridTextListDialog(
    title: String,
    selectedValues: List<String>,
    onSelected: (List<String>) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember(selectedValues) { mutableStateOf(selectedValues.joinToString("\n")) }
    BasicAlertDialog(onDismissRequest = onDismiss) {
        DebridDialogSurface(title = title) {
            Text(
                text = "Enter one group per line.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 120.dp),
                minLines = 4,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.75f),
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f),
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    disabledContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                TextButton(onClick = { value = "" }) {
                    Text(stringResource(Res.string.action_clear))
                }
                Button(
                    onClick = {
                        onSelected(value.split('\n', ',').map { it.trim() }.filter { it.isNotBlank() }.distinct())
                        onDismiss()
                    },
                ) {
                    Text(stringResource(Res.string.action_save))
                }
            }
        }
    }
}

@Composable
private fun DebridDialogSurface(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
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
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            content()
            Spacer(modifier = Modifier.height(2.dp))
        }
    }
}

@Composable
private fun DebridDialogOptionRow(
    text: String,
    selected: Boolean,
    showCheckbox: Boolean = false,
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
                text = text,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            if (showCheckbox) {
                Checkbox(
                    checked = selected,
                    onCheckedChange = { onClick() },
                )
            } else {
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
}

@Composable
private fun streamMaxResultsLabel(value: Int): String =
    if (value <= 0) "All results" else "$value results"

private fun sortProfileLabel(value: DebridSortProfile): String =
    when (value) {
        DebridSortProfile.DEFAULT -> "Default"
        DebridSortProfile.LARGEST -> "Largest first"
        DebridSortProfile.SMALLEST -> "Smallest first"
        DebridSortProfile.AUDIO -> "Best audio first"
        DebridSortProfile.LANGUAGE -> "Language first"
    }

private fun debridRuleRows(preferences: DebridStreamPreferences): List<DebridRuleRow> =
    listOf(
        DebridRuleRow(DebridStreamPicker.PREFERRED_RESOLUTIONS, "Preferred resolutions", "Sort selected resolutions first, in default order.", selectionCountLabel(preferences.preferredResolutions)),
        DebridRuleRow(DebridStreamPicker.REQUIRED_RESOLUTIONS, "Required resolutions", "Only show selected resolutions.", selectionCountLabel(preferences.requiredResolutions)),
        DebridRuleRow(DebridStreamPicker.EXCLUDED_RESOLUTIONS, "Excluded resolutions", "Hide selected resolutions.", selectionCountLabel(preferences.excludedResolutions)),
        DebridRuleRow(DebridStreamPicker.PREFERRED_QUALITIES, "Preferred qualities", "Sort selected qualities first, in default order.", selectionCountLabel(preferences.preferredQualities)),
        DebridRuleRow(DebridStreamPicker.REQUIRED_QUALITIES, "Required qualities", "Only show selected qualities.", selectionCountLabel(preferences.requiredQualities)),
        DebridRuleRow(DebridStreamPicker.EXCLUDED_QUALITIES, "Excluded qualities", "Hide selected qualities.", selectionCountLabel(preferences.excludedQualities)),
        DebridRuleRow(DebridStreamPicker.PREFERRED_VISUAL_TAGS, "Preferred visual tags", "Sort DV, HDR, 10bit, IMAX and similar tags.", selectionCountLabel(preferences.preferredVisualTags)),
        DebridRuleRow(DebridStreamPicker.REQUIRED_VISUAL_TAGS, "Required visual tags", "Require DV, HDR, 10bit, IMAX, SDR and similar tags.", selectionCountLabel(preferences.requiredVisualTags)),
        DebridRuleRow(DebridStreamPicker.EXCLUDED_VISUAL_TAGS, "Excluded visual tags", "Hide DV, HDR, 10bit, 3D and similar tags.", selectionCountLabel(preferences.excludedVisualTags)),
        DebridRuleRow(DebridStreamPicker.PREFERRED_AUDIO_TAGS, "Preferred audio tags", "Sort Atmos, TrueHD, DTS, AAC and similar tags.", selectionCountLabel(preferences.preferredAudioTags)),
        DebridRuleRow(DebridStreamPicker.REQUIRED_AUDIO_TAGS, "Required audio tags", "Require Atmos, TrueHD, DTS, AAC and similar tags.", selectionCountLabel(preferences.requiredAudioTags)),
        DebridRuleRow(DebridStreamPicker.EXCLUDED_AUDIO_TAGS, "Excluded audio tags", "Hide selected audio tags.", selectionCountLabel(preferences.excludedAudioTags)),
        DebridRuleRow(DebridStreamPicker.PREFERRED_AUDIO_CHANNELS, "Preferred channels", "Sort preferred channel layouts first.", selectionCountLabel(preferences.preferredAudioChannels)),
        DebridRuleRow(DebridStreamPicker.REQUIRED_AUDIO_CHANNELS, "Required channels", "Only show selected channel layouts.", selectionCountLabel(preferences.requiredAudioChannels)),
        DebridRuleRow(DebridStreamPicker.EXCLUDED_AUDIO_CHANNELS, "Excluded channels", "Hide selected channel layouts.", selectionCountLabel(preferences.excludedAudioChannels)),
        DebridRuleRow(DebridStreamPicker.PREFERRED_ENCODES, "Preferred encodes", "Sort AV1, HEVC, AVC and similar encodes.", selectionCountLabel(preferences.preferredEncodes)),
        DebridRuleRow(DebridStreamPicker.REQUIRED_ENCODES, "Required encodes", "Require AV1, HEVC, AVC and similar encodes.", selectionCountLabel(preferences.requiredEncodes)),
        DebridRuleRow(DebridStreamPicker.EXCLUDED_ENCODES, "Excluded encodes", "Hide selected encodes.", selectionCountLabel(preferences.excludedEncodes)),
        DebridRuleRow(DebridStreamPicker.PREFERRED_LANGUAGES, "Preferred languages", "Sort preferred audio languages first.", selectionCountLabel(preferences.preferredLanguages)),
        DebridRuleRow(DebridStreamPicker.REQUIRED_LANGUAGES, "Required languages", "Only show results with selected languages.", selectionCountLabel(preferences.requiredLanguages)),
        DebridRuleRow(DebridStreamPicker.EXCLUDED_LANGUAGES, "Excluded languages", "Hide results where every language is excluded.", selectionCountLabel(preferences.excludedLanguages)),
        DebridRuleRow(DebridStreamPicker.REQUIRED_RELEASE_GROUPS, "Required release groups", "Only show selected release groups.", selectionCountLabel(preferences.requiredReleaseGroups)),
        DebridRuleRow(DebridStreamPicker.EXCLUDED_RELEASE_GROUPS, "Excluded release groups", "Hide selected release groups.", selectionCountLabel(preferences.excludedReleaseGroups)),
    )

private fun selectionCountLabel(values: List<*>): String =
    if (values.isEmpty()) "Any" else "${values.size} selected"

private fun sizeRangeLabel(preferences: DebridStreamPreferences): String =
    sizeRangeLabel(preferences.sizeMinGb, preferences.sizeMaxGb)

private fun sizeRangeLabel(minGb: Int, maxGb: Int): String =
    when {
        minGb <= 0 && maxGb <= 0 -> "Any"
        minGb <= 0 -> "Up to ${maxGb}GB"
        maxGb <= 0 -> "${minGb}GB+"
        else -> "${minGb}-${maxGb}GB"
    }

private fun sortProfileFor(criteria: List<DebridStreamSortCriterion>): DebridSortProfile {
    val normalized = criteria.map { it.key to it.direction }
    return when {
        normalized == listOf(DebridStreamSortKey.SIZE to DebridStreamSortDirection.DESC) -> DebridSortProfile.LARGEST
        normalized == listOf(DebridStreamSortKey.SIZE to DebridStreamSortDirection.ASC) -> DebridSortProfile.SMALLEST
        normalized.take(2) == listOf(
            DebridStreamSortKey.AUDIO_TAG to DebridStreamSortDirection.DESC,
            DebridStreamSortKey.AUDIO_CHANNEL to DebridStreamSortDirection.DESC,
        ) -> DebridSortProfile.AUDIO
        normalized.firstOrNull() == DebridStreamSortKey.LANGUAGE to DebridStreamSortDirection.DESC -> DebridSortProfile.LANGUAGE
        else -> DebridSortProfile.DEFAULT
    }
}

private fun sortProfileLabel(criteria: List<DebridStreamSortCriterion>): String =
    sortProfileLabel(sortProfileFor(criteria))

private fun sortCriteriaForProfile(profile: DebridSortProfile): List<DebridStreamSortCriterion> =
    when (profile) {
        DebridSortProfile.DEFAULT -> DebridStreamSortCriterion.defaultOrder
        DebridSortProfile.LARGEST -> listOf(DebridStreamSortCriterion(DebridStreamSortKey.SIZE, DebridStreamSortDirection.DESC))
        DebridSortProfile.SMALLEST -> listOf(DebridStreamSortCriterion(DebridStreamSortKey.SIZE, DebridStreamSortDirection.ASC))
        DebridSortProfile.AUDIO -> listOf(
            DebridStreamSortCriterion(DebridStreamSortKey.AUDIO_TAG, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.AUDIO_CHANNEL, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.RESOLUTION, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.QUALITY, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.SIZE, DebridStreamSortDirection.DESC),
        )
        DebridSortProfile.LANGUAGE -> listOf(
            DebridStreamSortCriterion(DebridStreamSortKey.LANGUAGE, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.RESOLUTION, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.QUALITY, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.SIZE, DebridStreamSortDirection.DESC),
        )
    }

private data class DebridRuleRow(
    val picker: DebridStreamPicker,
    val title: String,
    val description: String,
    val value: String,
)

private enum class DebridSortProfile {
    DEFAULT,
    LARGEST,
    SMALLEST,
    AUDIO,
    LANGUAGE,
}

private enum class DebridStreamPicker {
    MAX_RESULTS,
    MAX_PER_RESOLUTION,
    MAX_PER_QUALITY,
    SORT_MODE,
    SIZE_RANGE,
    PREFERRED_RESOLUTIONS,
    REQUIRED_RESOLUTIONS,
    EXCLUDED_RESOLUTIONS,
    PREFERRED_QUALITIES,
    REQUIRED_QUALITIES,
    EXCLUDED_QUALITIES,
    PREFERRED_VISUAL_TAGS,
    REQUIRED_VISUAL_TAGS,
    EXCLUDED_VISUAL_TAGS,
    PREFERRED_AUDIO_TAGS,
    REQUIRED_AUDIO_TAGS,
    EXCLUDED_AUDIO_TAGS,
    PREFERRED_AUDIO_CHANNELS,
    REQUIRED_AUDIO_CHANNELS,
    EXCLUDED_AUDIO_CHANNELS,
    PREFERRED_ENCODES,
    REQUIRED_ENCODES,
    EXCLUDED_ENCODES,
    PREFERRED_LANGUAGES,
    REQUIRED_LANGUAGES,
    EXCLUDED_LANGUAGES,
    REQUIRED_RELEASE_GROUPS,
    EXCLUDED_RELEASE_GROUPS,
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DebridDeviceAuthDialog(
    provider: DebridProvider,
    currentValue: String,
    onConnected: (String) -> Unit,
    onDisconnect: () -> Unit,
    onDismiss: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    val clipboardManager = LocalClipboardManager.current
    val isConnected = currentValue.isNotBlank()
    var restartNonce by rememberSaveable(provider.id) { mutableStateOf(0) }
    var session by remember(provider.id, restartNonce, isConnected) { mutableStateOf<DebridDeviceAuthorization?>(null) }
    var isStarting by remember(provider.id, restartNonce, isConnected) { mutableStateOf(!isConnected) }
    var isPolling by remember(provider.id, restartNonce, isConnected) { mutableStateOf(false) }
    var statusMessage by remember(provider.id, restartNonce, isConnected) { mutableStateOf<String?>(null) }

    val startingMessage = stringResource(Res.string.settings_debrid_device_auth_starting)
    val waitingMessage = stringResource(Res.string.settings_debrid_device_auth_waiting)
    val failedMessage = stringResource(Res.string.settings_debrid_device_auth_failed)
    val missingConfigurationMessage = stringResource(Res.string.settings_debrid_device_auth_missing_configuration)
    val expiredMessage = stringResource(Res.string.settings_debrid_device_auth_expired)
    val codeCopiedMessage = stringResource(Res.string.settings_debrid_device_auth_code_copied)

    LaunchedEffect(provider.id, restartNonce, isConnected) {
        if (isConnected) {
            isStarting = false
            isPolling = false
            statusMessage = null
            session = null
            return@LaunchedEffect
        }
        isStarting = true
        isPolling = false
        statusMessage = null
        val startResult = runCatching {
            DebridProviderApis.apiFor(provider.id)?.startDeviceAuthorization("Nuvio")
        }.onFailure { error ->
            if (error is CancellationException) throw error
        }
        session = startResult.getOrNull()
        isStarting = false
        statusMessage = if (session == null) {
            startResult.exceptionOrNull()?.message?.takeIf { it.contains("PREMIUMIZE_CLIENT_ID") }
                ?.let { missingConfigurationMessage }
                ?: failedMessage
        } else {
            waitingMessage
        }
    }

    LaunchedEffect(session?.deviceCode, restartNonce, isConnected) {
        if (isConnected) return@LaunchedEffect
        val activeSession = session ?: return@LaunchedEffect
        while (true) {
            delay(activeSession.intervalSeconds.coerceAtLeast(1) * 1_000L)
            isPolling = true
            val result = runCatching {
                DebridProviderApis.apiFor(provider.id)
                    ?.redeemDeviceAuthorization(activeSession.deviceCode)
                    ?: DebridDeviceAuthorizationTokenResult.Unsupported
            }.getOrElse { error ->
                if (error is CancellationException) throw error
                if (error.isCancelledHttpRequest()) {
                    DebridDeviceAuthorizationTokenResult.Pending
                } else {
                    DebridDeviceAuthorizationTokenResult.Failed(null)
                }
            }
            isPolling = false
            when (result) {
                is DebridDeviceAuthorizationTokenResult.Authorized -> {
                    onConnected(result.accessToken)
                    onDismiss()
                    return@LaunchedEffect
                }

                DebridDeviceAuthorizationTokenResult.Pending -> {
                    statusMessage = waitingMessage
                }

                DebridDeviceAuthorizationTokenResult.Expired -> {
                    statusMessage = expiredMessage
                    return@LaunchedEffect
                }

                is DebridDeviceAuthorizationTokenResult.Failed -> {
                    statusMessage = result.message.toDeviceAuthStatusMessage(failedMessage)
                    return@LaunchedEffect
                }

                DebridDeviceAuthorizationTokenResult.Unsupported -> {
                    statusMessage = failedMessage
                    return@LaunchedEffect
                }
            }
        }
    }

    BasicAlertDialog(onDismissRequest = onDismiss) {
        DebridDialogSurface(
            title = stringResource(
                if (isConnected) Res.string.settings_debrid_disconnect_provider else Res.string.settings_debrid_connect_provider,
                provider.displayName,
            ),
        ) {
            if (isConnected) {
                Text(
                    text = stringResource(Res.string.settings_debrid_device_auth_connected, provider.displayName),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else if (isStarting) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    Text(
                        text = startingMessage,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                session?.let { activeSession ->
                    Text(
                        text = stringResource(Res.string.settings_debrid_device_auth_instructions),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                clipboardManager.setText(AnnotatedString(activeSession.userCode))
                                statusMessage = codeCopiedMessage
                            },
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = activeSession.userCode,
                                style = MaterialTheme.typography.headlineSmall,
                                color = MaterialTheme.colorScheme.onSurface,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = activeSession.friendlyVerificationUrl,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
                statusMessage?.let { message ->
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (isPolling) {
                            CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                        }
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (message == failedMessage || message == expiredMessage || message == missingConfigurationMessage) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(Res.string.action_cancel))
                }
                if (isConnected) {
                    Button(
                        onClick = {
                            onDisconnect()
                            onDismiss()
                        },
                    ) {
                        Text(stringResource(Res.string.settings_debrid_disconnect))
                    }
                }
                if (!isConnected && !isStarting && session == null) {
                    TextButton(onClick = { restartNonce += 1 }) {
                        Text(stringResource(Res.string.action_retry))
                    }
                }
                if (!isConnected) session?.let { activeSession ->
                    Button(
                        onClick = {
                            runCatching { uriHandler.openUri(activeSession.verificationUrl) }
                                .onFailure { statusMessage = failedMessage }
                        },
                        enabled = !isStarting,
                    ) {
                        Text(stringResource(Res.string.settings_debrid_device_auth_open))
                    }
                }
            }
        }
    }
}

private fun Throwable.isCancelledHttpRequest(): Boolean {
    val text = listOfNotNull(message, toString())
        .joinToString(" ")
        .lowercase()
    return "code=-999" in text ||
        ("nsurlerrordomain" in text && ("cancelled" in text || "canceled" in text))
}

private fun String?.toDeviceAuthStatusMessage(fallback: String): String {
    val value = this?.trim()?.takeIf { it.isNotBlank() } ?: return fallback
    val lower = value.lowercase()
    return if (
        value.length > 180 ||
        "exception in http request" in lower ||
        "nsurlerrordomain" in lower ||
        "userinfo=" in lower
    ) {
        fallback
    } else {
        value
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DebridApiKeyDialog(
    providerId: String,
    title: String,
    subtitle: String,
    placeholder: String,
    currentValue: String,
    onSave: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var draft by rememberSaveable(currentValue) { mutableStateOf(currentValue) }
    var isValidating by rememberSaveable(providerId) { mutableStateOf(false) }
    var validationMessage by rememberSaveable(providerId, currentValue) { mutableStateOf<String?>(null) }
    val normalizedDraft = draft.trim()
    val invalidMessage = stringResource(Res.string.settings_debrid_key_invalid)
    val saveAndDismiss: () -> Unit = {
        scope.launch {
            isValidating = true
            validationMessage = null
            val valid = normalizedDraft.isNotBlank() && runCatching {
                DebridCredentialValidator.validateProvider(providerId, normalizedDraft)
            }.getOrDefault(false)
            if (valid) {
                onSave(normalizedDraft)
                isValidating = false
                onDismiss()
            } else {
                validationMessage = invalidMessage
                isValidating = false
            }
        }
    }

    BasicAlertDialog(onDismissRequest = onDismiss) {
        DebridDialogSurface(title = title) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = draft,
                onValueChange = {
                    draft = it
                    validationMessage = null
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(placeholder) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.75f),
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f),
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    disabledContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
            validationMessage?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            ) {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(Res.string.action_cancel))
                }
                TextButton(
                    onClick = {
                        onSave("")
                        onDismiss()
                    },
                    enabled = !isValidating,
                ) {
                    Text(stringResource(Res.string.action_clear))
                }
                Button(
                    onClick = saveAndDismiss,
                    enabled = normalizedDraft.isNotBlank() && !isValidating,
                ) {
                    Text(
                        if (isValidating) {
                            stringResource(Res.string.action_saving)
                        } else {
                            stringResource(Res.string.action_save)
                        },
                    )
                }
            }
        }
    }
}

private fun maskDebridApiKey(key: String, notSetLabel: String): String {
    val trimmed = key.trim()
    if (trimmed.isBlank()) return notSetLabel
    return if (trimmed.length <= 4) "****" else "******${trimmed.takeLast(4)}"
}

private fun providerCredentialStatus(
    provider: DebridProvider,
    credential: String,
    notSetLabel: String,
    connectedLabel: String,
): String =
    when (provider.authMethod) {
        DebridProviderAuthMethod.DeviceCode -> if (credential.isBlank()) notSetLabel else connectedLabel
        DebridProviderAuthMethod.ApiKey -> maskDebridApiKey(credential, notSetLabel)
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
