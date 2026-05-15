package com.nuvio.app.features.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.home.components.ContinueWatchingStylePreview
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingSectionStyle
import com.nuvio.app.features.watchprogress.ContinueWatchingSortMode
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.settings_continue_watching_resume_prompt_description
import nuvio.composeapp.generated.resources.settings_continue_watching_resume_prompt_title
import nuvio.composeapp.generated.resources.settings_continue_watching_blur_next_up_description
import nuvio.composeapp.generated.resources.settings_continue_watching_blur_next_up_title
import nuvio.composeapp.generated.resources.settings_continue_watching_show_unaired_next_up_description
import nuvio.composeapp.generated.resources.settings_continue_watching_show_unaired_next_up_title
import nuvio.composeapp.generated.resources.settings_continue_watching_section_card_style
import nuvio.composeapp.generated.resources.settings_continue_watching_section_on_launch
import nuvio.composeapp.generated.resources.settings_continue_watching_section_sort_order
import nuvio.composeapp.generated.resources.settings_continue_watching_section_up_next_behavior
import nuvio.composeapp.generated.resources.settings_continue_watching_section_visibility
import nuvio.composeapp.generated.resources.settings_continue_watching_show_description
import nuvio.composeapp.generated.resources.settings_continue_watching_show_title
import nuvio.composeapp.generated.resources.settings_continue_watching_sort_mode_default
import nuvio.composeapp.generated.resources.settings_continue_watching_sort_mode_default_desc
import nuvio.composeapp.generated.resources.settings_continue_watching_sort_mode_streaming
import nuvio.composeapp.generated.resources.settings_continue_watching_sort_mode_streaming_desc
import nuvio.composeapp.generated.resources.settings_continue_watching_sort_mode_title
import nuvio.composeapp.generated.resources.settings_continue_watching_style_poster
import nuvio.composeapp.generated.resources.settings_continue_watching_style_poster_description
import nuvio.composeapp.generated.resources.settings_continue_watching_style_wide
import nuvio.composeapp.generated.resources.settings_continue_watching_style_wide_description
import nuvio.composeapp.generated.resources.settings_continue_watching_up_next_description
import nuvio.composeapp.generated.resources.settings_continue_watching_up_next_title
import nuvio.composeapp.generated.resources.settings_continue_watching_use_episode_thumbnails_description
import nuvio.composeapp.generated.resources.settings_continue_watching_use_episode_thumbnails_title
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

internal fun LazyListScope.continueWatchingSettingsContent(
    isTablet: Boolean,
    isVisible: Boolean,
    style: ContinueWatchingSectionStyle,
    upNextFromFurthestEpisode: Boolean,
    useEpisodeThumbnails: Boolean,
    showUnairedNextUp: Boolean,
    blurNextUp: Boolean,
    showResumePromptOnLaunch: Boolean,
    sortMode: ContinueWatchingSortMode,
) {
    item {
        SettingsSection(
            title = stringResource(Res.string.settings_continue_watching_section_visibility),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_continue_watching_show_title),
                    description = stringResource(Res.string.settings_continue_watching_show_description),
                    checked = isVisible,
                    isTablet = isTablet,
                    onCheckedChange = ContinueWatchingPreferencesRepository::setVisible,
                )
            }
        }
    }
    item {
        SettingsSection(
            title = stringResource(Res.string.settings_continue_watching_section_card_style),
            isTablet = isTablet,
        ) {
            ContinueWatchingStyleSelector(
                isTablet = isTablet,
                selectedStyle = style,
                onStyleSelected = ContinueWatchingPreferencesRepository::setStyle,
            )
        }
    }
    item {
        SettingsSection(
            title = stringResource(Res.string.settings_continue_watching_section_up_next_behavior),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_continue_watching_use_episode_thumbnails_title),
                    description = stringResource(Res.string.settings_continue_watching_use_episode_thumbnails_description),
                    checked = useEpisodeThumbnails,
                    isTablet = isTablet,
                    onCheckedChange = ContinueWatchingPreferencesRepository::setUseEpisodeThumbnails,
                )
                SettingsGroupDivider(isTablet = isTablet)
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_continue_watching_up_next_title),
                    description = stringResource(Res.string.settings_continue_watching_up_next_description),
                    checked = upNextFromFurthestEpisode,
                    isTablet = isTablet,
                    onCheckedChange = ContinueWatchingPreferencesRepository::setUpNextFromFurthestEpisode,
                )
                SettingsGroupDivider(isTablet = isTablet)
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_continue_watching_show_unaired_next_up_title),
                    description = stringResource(Res.string.settings_continue_watching_show_unaired_next_up_description),
                    checked = showUnairedNextUp,
                    isTablet = isTablet,
                    onCheckedChange = ContinueWatchingPreferencesRepository::setShowUnairedNextUp,
                )
                if (useEpisodeThumbnails) {
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsSwitchRow(
                        title = stringResource(Res.string.settings_continue_watching_blur_next_up_title),
                        description = stringResource(Res.string.settings_continue_watching_blur_next_up_description),
                        checked = blurNextUp,
                        isTablet = isTablet,
                        onCheckedChange = ContinueWatchingPreferencesRepository::setBlurNextUp,
                    )
                }
            }
        }
    }
    item {
        SettingsSection(
            title = stringResource(Res.string.settings_continue_watching_section_on_launch),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_continue_watching_resume_prompt_title),
                    description = stringResource(Res.string.settings_continue_watching_resume_prompt_description),
                    checked = showResumePromptOnLaunch,
                    isTablet = isTablet,
                    onCheckedChange = ContinueWatchingPreferencesRepository::setShowResumePromptOnLaunch,
                )
            }
        }
    }
    item {
        var showSortModeSheet by remember { mutableStateOf(false) }
        SettingsSection(
            title = stringResource(Res.string.settings_continue_watching_section_sort_order),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                val currentModeLabel = stringResource(
                    when (sortMode) {
                        ContinueWatchingSortMode.DEFAULT -> Res.string.settings_continue_watching_sort_mode_default
                        ContinueWatchingSortMode.STREAMING_STYLE -> Res.string.settings_continue_watching_sort_mode_streaming
                    }
                )
                SettingsNavigationRow(
                    title = stringResource(Res.string.settings_continue_watching_sort_mode_title),
                    description = currentModeLabel,
                    isTablet = isTablet,
                    onClick = { showSortModeSheet = true },
                )
            }
        }

        if (showSortModeSheet) {
            ContinueWatchingSortModeDialog(
                currentMode = sortMode,
                onModeSelected = { mode ->
                    ContinueWatchingPreferencesRepository.setSortMode(mode)
                    showSortModeSheet = false
                },
                onDismiss = { showSortModeSheet = false },
            )
        }
    }
}

@Composable
private fun ContinueWatchingStyleSelector(
    isTablet: Boolean,
    selectedStyle: ContinueWatchingSectionStyle,
    onStyleSelected: (ContinueWatchingSectionStyle) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ContinueWatchingSectionStyle.entries.forEach { style ->
            Box(modifier = Modifier.weight(1f)) {
                ContinueWatchingStyleOption(
                    style = style,
                    selected = selectedStyle == style,
                    isTablet = isTablet,
                    onClick = { onStyleSelected(style) },
                )
            }
        }
    }
}

@Composable
private fun ContinueWatchingStyleOption(
    style: ContinueWatchingSectionStyle,
    selected: Boolean,
    isTablet: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        color = if (selected) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
        } else {
            MaterialTheme.colorScheme.surface
        },
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (selected) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 4.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                Icon(
                    imageVector = Icons.Rounded.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.alpha(if (selected) 1f else 0f),
                )
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(148.dp),
                contentAlignment = Alignment.Center,
            ) {
                ContinueWatchingStylePreview(
                    style = style,
                    isSelected = selected,
                )
            }
            Text(
                text = stringResource(style.labelRes),
                style = MaterialTheme.typography.bodyMedium,
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stringResource(style.descriptionRes),
                style = if (isTablet) MaterialTheme.typography.bodySmall else MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private val ContinueWatchingSectionStyle.labelRes: StringResource
    get() = when (this) {
        ContinueWatchingSectionStyle.Wide -> Res.string.settings_continue_watching_style_wide
        ContinueWatchingSectionStyle.Poster -> Res.string.settings_continue_watching_style_poster
    }

private val ContinueWatchingSectionStyle.descriptionRes: StringResource
    get() = when (this) {
        ContinueWatchingSectionStyle.Wide -> Res.string.settings_continue_watching_style_wide_description
        ContinueWatchingSectionStyle.Poster -> Res.string.settings_continue_watching_style_poster_description
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ContinueWatchingSortModeDialog(
    currentMode: ContinueWatchingSortMode,
    onModeSelected: (ContinueWatchingSortMode) -> Unit,
    onDismiss: () -> Unit,
) {
    val options = listOf(
        Triple(
            ContinueWatchingSortMode.DEFAULT,
            Res.string.settings_continue_watching_sort_mode_default,
            Res.string.settings_continue_watching_sort_mode_default_desc,
        ),
        Triple(
            ContinueWatchingSortMode.STREAMING_STYLE,
            Res.string.settings_continue_watching_sort_mode_streaming,
            Res.string.settings_continue_watching_sort_mode_streaming_desc,
        ),
    )

    BasicAlertDialog(
        onDismissRequest = onDismiss,
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
                    text = stringResource(Res.string.settings_continue_watching_sort_mode_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    options.forEach { (mode, titleRes, descriptionRes) ->
                        val isSelected = mode == currentMode
                        val containerColor = if (isSelected) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                        } else {
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                        }

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onModeSelected(mode) },
                            shape = RoundedCornerShape(12.dp),
                            color = containerColor,
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = stringResource(titleRes),
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MaterialTheme.colorScheme.onSurface,
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = stringResource(descriptionRes),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
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
