@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Switch
import androidx.tv.material3.SwitchDefaults
import androidx.tv.material3.Text
import com.nuvio.tv.ui.theme.NuvioColors

@Composable
fun TmdbSettingsScreen(
    viewModel: TmdbSettingsViewModel = hiltViewModel(),
    onBackPress: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    BackHandler { onBackPress() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NuvioColors.Background)
            .padding(horizontal = 48.dp, vertical = 24.dp)
    ) {
        Text(
            text = "TMDB Enrichment",
            style = MaterialTheme.typography.headlineLarge,
            color = NuvioColors.TextPrimary
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Choose which metadata fields should come from TMDB",
            style = MaterialTheme.typography.bodyMedium,
            color = NuvioColors.TextSecondary
        )

        Spacer(modifier = Modifier.height(32.dp))

        TvLazyColumn(
            contentPadding = PaddingValues(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                ToggleCard(
                    title = "Enable TMDB Enrichment",
                    subtitle = "Use TMDB as a metadata source to enhance addon data",
                    checked = uiState.enabled,
                    onToggle = { viewModel.onEvent(TmdbSettingsEvent.ToggleEnabled(it)) }
                )
            }

            item {
                ToggleCard(
                    title = "Artwork",
                    subtitle = "Logo and backdrop images from TMDB",
                    checked = uiState.useArtwork,
                    enabled = uiState.enabled,
                    onToggle = { viewModel.onEvent(TmdbSettingsEvent.ToggleArtwork(it)) }
                )
            }

            item {
                ToggleCard(
                    title = "Basic Info",
                    subtitle = "Description, genres, and rating from TMDB",
                    checked = uiState.useBasicInfo,
                    enabled = uiState.enabled,
                    onToggle = { viewModel.onEvent(TmdbSettingsEvent.ToggleBasicInfo(it)) }
                )
            }

            item {
                ToggleCard(
                    title = "Details",
                    subtitle = "Runtime, release date, country, and language from TMDB",
                    checked = uiState.useDetails,
                    enabled = uiState.enabled,
                    onToggle = { viewModel.onEvent(TmdbSettingsEvent.ToggleDetails(it)) }
                )
            }

            item {
                ToggleCard(
                    title = "Credits",
                    subtitle = "Cast with photos, director, and writer from TMDB",
                    checked = uiState.useCredits,
                    enabled = uiState.enabled,
                    onToggle = { viewModel.onEvent(TmdbSettingsEvent.ToggleCredits(it)) }
                )
            }

            item {
                ToggleCard(
                    title = "Productions",
                    subtitle = "Production companies from TMDB",
                    checked = uiState.useProductions,
                    enabled = uiState.enabled,
                    onToggle = { viewModel.onEvent(TmdbSettingsEvent.ToggleProductions(it)) }
                )
            }

            item {
                ToggleCard(
                    title = "Networks",
                    subtitle = "Networks with logos from TMDB",
                    checked = uiState.useNetworks,
                    enabled = uiState.enabled,
                    onToggle = { viewModel.onEvent(TmdbSettingsEvent.ToggleNetworks(it)) }
                )
            }

            item {
                ToggleCard(
                    title = "Episodes",
                    subtitle = "Episode titles, overviews, thumbnails, and runtime from TMDB",
                    checked = uiState.useEpisodes,
                    enabled = uiState.enabled,
                    onToggle = { viewModel.onEvent(TmdbSettingsEvent.ToggleEpisodes(it)) }
                )
            }
        }
    }
}

@Composable
private fun ToggleCard(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean = true,
    onToggle: (Boolean) -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    val disabledAlpha = 0.5f

    Card(
        onClick = { if (enabled) onToggle(!checked) },
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
        colors = CardDefaults.colors(
            containerColor = if (isFocused) NuvioColors.FocusBackground else NuvioColors.BackgroundCard
        ),
        shape = CardDefaults.shape(RoundedCornerShape(12.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioColors.TextPrimary.copy(alpha = if (enabled) 1f else disabledAlpha)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = NuvioColors.TextSecondary.copy(alpha = if (enabled) 1f else disabledAlpha)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Switch(
                checked = checked,
                enabled = enabled,
                onCheckedChange = { onToggle(it) },
                colors = SwitchDefaults.colors(
                    checkedThumbColor = NuvioColors.Secondary,
                    checkedTrackColor = NuvioColors.Secondary.copy(alpha = 0.3f),
                    uncheckedThumbColor = Color.Gray
                )
            )
        }
    }
}
