package com.nuvio.app.features.player.sponsorblock

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * SponsorBlock settings section to be embedded in the player settings screen.
 *
 * Follows the same visual pattern as existing settings sections (e.g., Skip Intro settings).
 */
@Composable
fun SponsorBlockSettingsSection(
    modifier: Modifier = Modifier,
) {
    val settings by SponsorBlockSettingsRepository.settings.collectAsState()

    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        // Master toggle
        SettingsToggleRow(
            title = "SponsorBlock",
            subtitle = "Skip crowd-sourced sponsor segments automatically",
            checked = settings.enabled,
            onCheckedChange = { SponsorBlockSettingsRepository.setEnabled(it) },
        )

        if (settings.enabled) {
            // Auto-skip toggle
            SettingsToggleRow(
                title = "Auto-skip segments",
                subtitle = "Automatically skip without showing the button",
                checked = settings.autoSkip,
                onCheckedChange = { SponsorBlockSettingsRepository.setAutoSkip(it) },
            )

            // Show button toggle
            SettingsToggleRow(
                title = "Show skip button",
                subtitle = "Display a skip button when a segment is detected",
                checked = settings.showSkipButton,
                onCheckedChange = { SponsorBlockSettingsRepository.setShowSkipButton(it) },
            )

            // Show notification toggle
            SettingsToggleRow(
                title = "Show notification",
                subtitle = "Brief toast when a segment is skipped",
                checked = settings.showNotification,
                onCheckedChange = { SponsorBlockSettingsRepository.setShowNotification(it) },
            )

            // Privacy API toggle
            SettingsToggleRow(
                title = "Privacy mode",
                subtitle = "Use hash-based API to avoid sending full video IDs",
                checked = settings.usePrivacyApi,
                onCheckedChange = { SponsorBlockSettingsRepository.setUsePrivacyApi(it) },
            )

            // Category selection
            Text(
                text = "Categories to skip",
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
            )

            SponsorBlockCategory.entries.forEach { category ->
                CategoryCheckboxRow(
                    category = category,
                    checked = category in settings.categories,
                    onCheckedChange = { SponsorBlockSettingsRepository.toggleCategory(category) },
                )
            }
        }
    }
}

@Composable
private fun SettingsToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
    }
}

@Composable
private fun CategoryCheckboxRow(
    category: SponsorBlockCategory,
    checked: Boolean,
    onCheckedChange: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onCheckedChange() }
            .padding(vertical = 4.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = { onCheckedChange() },
        )
        Text(
            text = category.displayLabel,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}
