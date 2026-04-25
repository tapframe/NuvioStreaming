package com.nuvio.app.features.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nuvio.app.features.home.components.ContinueWatchingStylePreview
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingSectionStyle
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.settings_continue_watching_resume_prompt_description
import nuvio.composeapp.generated.resources.settings_continue_watching_resume_prompt_title
import nuvio.composeapp.generated.resources.settings_continue_watching_section_card_style
import nuvio.composeapp.generated.resources.settings_continue_watching_section_on_launch
import nuvio.composeapp.generated.resources.settings_continue_watching_section_up_next_behavior
import nuvio.composeapp.generated.resources.settings_continue_watching_section_visibility
import nuvio.composeapp.generated.resources.settings_continue_watching_show_description
import nuvio.composeapp.generated.resources.settings_continue_watching_show_title
import nuvio.composeapp.generated.resources.settings_continue_watching_style_poster
import nuvio.composeapp.generated.resources.settings_continue_watching_style_poster_description
import nuvio.composeapp.generated.resources.settings_continue_watching_style_wide
import nuvio.composeapp.generated.resources.settings_continue_watching_style_wide_description
import nuvio.composeapp.generated.resources.settings_continue_watching_up_next_description
import nuvio.composeapp.generated.resources.settings_continue_watching_up_next_title
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

internal fun LazyListScope.continueWatchingSettingsContent(
    isTablet: Boolean,
    isVisible: Boolean,
    style: ContinueWatchingSectionStyle,
    upNextFromFurthestEpisode: Boolean,
    showResumePromptOnLaunch: Boolean,
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
                    title = stringResource(Res.string.settings_continue_watching_up_next_title),
                    description = stringResource(Res.string.settings_continue_watching_up_next_description),
                    checked = upNextFromFurthestEpisode,
                    isTablet = isTablet,
                    onCheckedChange = ContinueWatchingPreferencesRepository::setUpNextFromFurthestEpisode,
                )
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
