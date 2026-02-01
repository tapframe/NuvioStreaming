package com.nuvio.tv.ui.screens.addon

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.nuvio.tv.domain.model.Addon
import com.nuvio.tv.ui.components.LoadingIndicator
import com.nuvio.tv.ui.theme.NuvioColors

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun AddonManagerScreen(
    viewModel: AddonManagerViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(NuvioColors.Background)
    ) {
        TvLazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 36.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            item {
                Text(
                    text = "Addons",
                    style = MaterialTheme.typography.headlineMedium,
                    color = NuvioColors.TextPrimary
                )
            }

            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .animateContentSize(),
                    colors = CardDefaults.cardColors(containerColor = NuvioColors.BackgroundCard),
                    shape = RoundedCornerShape(18.dp)
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            text = "Install addon",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = NuvioColors.TextPrimary
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TextField(
                                value = uiState.installUrl,
                                onValueChange = viewModel::onInstallUrlChange,
                                placeholder = { Text(text = "https://example.com") },
                                modifier = Modifier.weight(1f)
                            )
                            Button(
                                onClick = viewModel::installAddon,
                                enabled = !uiState.isInstalling,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = NuvioColors.Primary,
                                    contentColor = NuvioColors.OnPrimary
                                )
                            ) {
                                Text(text = if (uiState.isInstalling) "Installing" else "Install")
                            }
                        }

                        AnimatedVisibility(visible = uiState.error != null) {
                            Text(
                                text = uiState.error.orEmpty(),
                                style = MaterialTheme.typography.bodyMedium,
                                color = NuvioColors.Error,
                                modifier = Modifier.padding(top = 10.dp)
                            )
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Installed",
                        style = MaterialTheme.typography.titleLarge,
                        color = NuvioColors.TextPrimary
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    if (uiState.isLoading) {
                        LoadingIndicator(modifier = Modifier.height(24.dp))
                    }
                }
            }

            if (uiState.installedAddons.isEmpty() && !uiState.isLoading) {
                item {
                    Text(
                        text = "No addons installed. Add one to get started.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = NuvioColors.TextSecondary
                    )
                }
            } else {
                items(
                    items = uiState.installedAddons,
                    key = { addon -> addon.id }
                ) { addon ->
                    AddonCard(
                        addon = addon,
                        onRemove = { viewModel.removeAddon(addon.baseUrl) }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun AddonCard(
    addon: Addon,
    onRemove: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize(),
        colors = CardDefaults.cardColors(containerColor = NuvioColors.BackgroundCard),
        shape = RoundedCornerShape(18.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = addon.name,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = NuvioColors.TextPrimary
                    )
                    Text(
                        text = "v${addon.version}",
                        style = MaterialTheme.typography.bodySmall,
                        color = NuvioColors.TextSecondary
                    )
                }
                Button(
                    onClick = onRemove,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Transparent,
                        contentColor = NuvioColors.TextSecondary
                    )
                ) {
                    Text(text = "Remove")
                }
            }

            if (!addon.description.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = addon.description ?: "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = NuvioColors.TextSecondary
                )
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = addon.baseUrl,
                style = MaterialTheme.typography.bodySmall,
                color = NuvioColors.TextTertiary
            )

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Catalogs: ${addon.catalogs.size} • Types: ${addon.types.joinToString { it.toApiString() }}",
                style = MaterialTheme.typography.bodySmall,
                color = NuvioColors.TextTertiary
            )
        }
    }
}
