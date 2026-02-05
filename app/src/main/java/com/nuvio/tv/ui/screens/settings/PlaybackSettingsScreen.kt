@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.settings

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.IconButton
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Switch
import androidx.tv.material3.SwitchDefaults
import androidx.tv.material3.Text
import com.nuvio.tv.data.local.LibassRenderType
import com.nuvio.tv.data.local.PlayerSettings
import com.nuvio.tv.ui.theme.NuvioColors
import kotlinx.coroutines.launch

@Composable
fun PlaybackSettingsScreen(
    viewModel: PlaybackSettingsViewModel = hiltViewModel(),
    onBackPress: () -> Unit = {}
) {
    val playerSettings by viewModel.playerSettings.collectAsState(initial = PlayerSettings())
    val coroutineScope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NuvioColors.Background)
            .padding(horizontal = 48.dp, vertical = 24.dp)
    ) {
        // Header with back button
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            IconButton(onClick = onBackPress) {
                Icon(
                    imageVector = Icons.Default.ArrowBack,
                    contentDescription = "Back",
                    tint = NuvioColors.TextPrimary
                )
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Text(
                text = "Playback Settings",
                style = MaterialTheme.typography.headlineLarge,
                color = NuvioColors.TextPrimary
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Configure video playback and subtitle options",
            style = MaterialTheme.typography.bodyMedium,
            color = NuvioColors.TextSecondary,
            modifier = Modifier.padding(start = 56.dp)
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Settings list
        TvLazyColumn(
            contentPadding = PaddingValues(top = 4.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Subtitle Settings Section Header
            item {
                Text(
                    text = "Subtitle Settings",
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioColors.TextSecondary,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }

            // Libass Toggle
            item {
                ToggleSettingsItem(
                    icon = Icons.Default.Subtitles,
                    title = "Use libass for ASS/SSA subtitles",
                    subtitle = "Enable native libass rendering for advanced ASS/SSA subtitle features including animations, positioning, and styling",
                    isChecked = playerSettings.useLibass,
                    onCheckedChange = { enabled ->
                        coroutineScope.launch {
                            viewModel.setUseLibass(enabled)
                        }
                    }
                )
            }

            // Libass Render Type Selection (only visible when libass is enabled)
            if (playerSettings.useLibass) {
                item {
                    Text(
                        text = "Libass Render Mode",
                        style = MaterialTheme.typography.titleMedium,
                        color = NuvioColors.TextSecondary,
                        modifier = Modifier.padding(vertical = 8.dp, horizontal = 0.dp)
                    )
                }

                item {
                    RenderTypeSettingsItem(
                        title = "Overlay OpenGL (Recommended)",
                        subtitle = "Best quality with HDR support. Renders subtitles on a separate thread.",
                        isSelected = playerSettings.libassRenderType == LibassRenderType.OVERLAY_OPEN_GL,
                        onClick = {
                            coroutineScope.launch {
                                viewModel.setLibassRenderType(LibassRenderType.OVERLAY_OPEN_GL)
                            }
                        }
                    )
                }

                item {
                    RenderTypeSettingsItem(
                        title = "Overlay Canvas",
                        subtitle = "HDR support with canvas rendering. May block UI thread.",
                        isSelected = playerSettings.libassRenderType == LibassRenderType.OVERLAY_CANVAS,
                        onClick = {
                            coroutineScope.launch {
                                viewModel.setLibassRenderType(LibassRenderType.OVERLAY_CANVAS)
                            }
                        }
                    )
                }

                item {
                    RenderTypeSettingsItem(
                        title = "Effects OpenGL",
                        subtitle = "Animation support using Media3 effects. Faster than Canvas.",
                        isSelected = playerSettings.libassRenderType == LibassRenderType.EFFECTS_OPEN_GL,
                        onClick = {
                            coroutineScope.launch {
                                viewModel.setLibassRenderType(LibassRenderType.EFFECTS_OPEN_GL)
                            }
                        }
                    )
                }

                item {
                    RenderTypeSettingsItem(
                        title = "Effects Canvas",
                        subtitle = "Animation support using Media3 effects with Canvas rendering.",
                        isSelected = playerSettings.libassRenderType == LibassRenderType.EFFECTS_CANVAS,
                        onClick = {
                            coroutineScope.launch {
                                viewModel.setLibassRenderType(LibassRenderType.EFFECTS_CANVAS)
                            }
                        }
                    )
                }

                item {
                    RenderTypeSettingsItem(
                        title = "Standard Cues",
                        subtitle = "Basic subtitle rendering without animation support. Most compatible.",
                        isSelected = playerSettings.libassRenderType == LibassRenderType.CUES,
                        onClick = {
                            coroutineScope.launch {
                                viewModel.setLibassRenderType(LibassRenderType.CUES)
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun ToggleSettingsItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    isChecked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    
    Card(
        onClick = { onCheckedChange(!isChecked) },
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
        colors = CardDefaults.colors(
            containerColor = NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.FocusBackground
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(12.dp)
            )
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(12.dp)),
        scale = CardDefaults.scale(focusedScale = 1.02f)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isFocused) NuvioColors.Primary else NuvioColors.TextSecondary,
                modifier = Modifier.size(28.dp)
            )

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioColors.TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = NuvioColors.TextSecondary
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Switch(
                checked = isChecked,
                onCheckedChange = null, // Handled by Card onClick
                colors = SwitchDefaults.colors(
                    checkedThumbColor = NuvioColors.Primary,
                    checkedTrackColor = NuvioColors.Primary.copy(alpha = 0.5f),
                    uncheckedThumbColor = NuvioColors.TextSecondary,
                    uncheckedTrackColor = NuvioColors.BackgroundCard
                )
            )
        }
    }
}

@Composable
private fun RenderTypeSettingsItem(
    title: String,
    subtitle: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
        colors = CardDefaults.colors(
            containerColor = if (isSelected) NuvioColors.Primary.copy(alpha = 0.15f) else NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.FocusBackground
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(12.dp)
            ),
            border = if (isSelected) Border(
                border = BorderStroke(2.dp, NuvioColors.Primary),
                shape = RoundedCornerShape(12.dp)
            ) else Border.None
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(12.dp)),
        scale = CardDefaults.scale(focusedScale = 1.02f)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (isSelected) NuvioColors.Primary else NuvioColors.TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = NuvioColors.TextSecondary
                )
            }
            
            if (isSelected) {
                Spacer(modifier = Modifier.width(16.dp))
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = NuvioColors.Primary,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}
