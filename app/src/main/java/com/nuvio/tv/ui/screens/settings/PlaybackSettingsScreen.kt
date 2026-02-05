@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.FormatBold
import androidx.compose.material.icons.filled.FormatSize
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.VerticalAlignBottom
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import android.view.KeyEvent
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
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
import com.nuvio.tv.data.local.AVAILABLE_SUBTITLE_LANGUAGES
import com.nuvio.tv.data.local.LibassRenderType
import com.nuvio.tv.data.local.PlayerSettings
import com.nuvio.tv.ui.theme.NuvioColors
import kotlinx.coroutines.launch

// Preset colors for subtitle customization
private val SUBTITLE_COLORS = listOf(
    Color.White,
    Color.Yellow,
    Color.Cyan,
    Color.Green,
    Color.Magenta,
    Color(0xFFFF6B6B), // Coral
    Color(0xFFFFA500), // Orange
    Color(0xFF90EE90), // Light Green
)

private val BACKGROUND_COLORS = listOf(
    Color.Transparent,
    Color.Black,
    Color(0x80000000), // Semi-transparent black
    Color(0xFF1A1A1A), // Dark gray
    Color(0xFF2D2D2D), // Gray
)

private val OUTLINE_COLORS = listOf(
    Color.Black,
    Color(0xFF1A1A1A),
    Color(0xFF333333),
    Color.White,
)

@Composable
fun PlaybackSettingsScreen(
    viewModel: PlaybackSettingsViewModel = hiltViewModel(),
    onBackPress: () -> Unit = {}
) {
    val playerSettings by viewModel.playerSettings.collectAsState(initial = PlayerSettings())
    val coroutineScope = rememberCoroutineScope()
    
    // Dialog states
    var showLanguageDialog by remember { mutableStateOf(false) }
    var showSecondaryLanguageDialog by remember { mutableStateOf(false) }
    var showTextColorDialog by remember { mutableStateOf(false) }
    var showBackgroundColorDialog by remember { mutableStateOf(false) }
    var showOutlineColorDialog by remember { mutableStateOf(false) }

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
            // Subtitle Style Settings Section Header
            item {
                Text(
                    text = "Subtitles",
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioColors.TextSecondary,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }
            
            // Preferred Language
            item {
                val languageName = AVAILABLE_SUBTITLE_LANGUAGES.find { 
                    it.code == playerSettings.subtitleStyle.preferredLanguage 
                }?.name ?: "English"
                
                NavigationSettingsItem(
                    icon = Icons.Default.Language,
                    title = "Preferred Language",
                    subtitle = languageName,
                    onClick = { showLanguageDialog = true }
                )
            }
            
            // Secondary Preferred Language
            item {
                val secondaryLanguageName = playerSettings.subtitleStyle.secondaryPreferredLanguage?.let { code ->
                    AVAILABLE_SUBTITLE_LANGUAGES.find { it.code == code }?.name
                } ?: "Not set"
                
                NavigationSettingsItem(
                    icon = Icons.Default.Language,
                    title = "Secondary Preferred Language",
                    subtitle = secondaryLanguageName,
                    onClick = { showSecondaryLanguageDialog = true }
                )
            }
            
            // Size Slider
            item {
                SliderSettingsItem(
                    icon = Icons.Default.FormatSize,
                    title = "Size",
                    value = playerSettings.subtitleStyle.size,
                    valueText = "${playerSettings.subtitleStyle.size}%",
                    minValue = 50,
                    maxValue = 200,
                    step = 10,
                    onValueChange = { newSize ->
                        coroutineScope.launch {
                            viewModel.setSubtitleSize(newSize)
                        }
                    }
                )
            }
            
            // Vertical Offset Slider
            item {
                SliderSettingsItem(
                    icon = Icons.Default.VerticalAlignBottom,
                    title = "Vertical Offset",
                    value = playerSettings.subtitleStyle.verticalOffset,
                    valueText = "${playerSettings.subtitleStyle.verticalOffset}%",
                    minValue = 0,
                    maxValue = 50,
                    step = 1,
                    onValueChange = { newOffset ->
                        coroutineScope.launch {
                            viewModel.setSubtitleVerticalOffset(newOffset)
                        }
                    }
                )
            }
            
            // Bold Toggle
            item {
                ToggleSettingsItem(
                    icon = Icons.Default.FormatBold,
                    title = "Bold",
                    subtitle = "Use bold font weight for subtitles",
                    isChecked = playerSettings.subtitleStyle.bold,
                    onCheckedChange = { bold ->
                        coroutineScope.launch {
                            viewModel.setSubtitleBold(bold)
                        }
                    }
                )
            }
            
            // Text Color
            item {
                ColorSettingsItem(
                    icon = Icons.Default.Palette,
                    title = "Text Color",
                    currentColor = Color(playerSettings.subtitleStyle.textColor),
                    onClick = { showTextColorDialog = true }
                )
            }
            
            // Background Color
            item {
                ColorSettingsItem(
                    icon = Icons.Default.Palette,
                    title = "Background Color",
                    currentColor = Color(playerSettings.subtitleStyle.backgroundColor),
                    showTransparent = playerSettings.subtitleStyle.backgroundColor == Color.Transparent.toArgb(),
                    onClick = { showBackgroundColorDialog = true }
                )
            }
            
            // Outline Toggle
            item {
                ToggleSettingsItem(
                    icon = Icons.Default.ClosedCaption,
                    title = "Outline",
                    subtitle = "Add outline around subtitle text for better visibility",
                    isChecked = playerSettings.subtitleStyle.outlineEnabled,
                    onCheckedChange = { enabled ->
                        coroutineScope.launch {
                            viewModel.setSubtitleOutlineEnabled(enabled)
                        }
                    }
                )
            }
            
            // Outline Color (only show when outline is enabled)
            if (playerSettings.subtitleStyle.outlineEnabled) {
                item {
                    ColorSettingsItem(
                        icon = Icons.Default.Palette,
                        title = "Outline Color",
                        currentColor = Color(playerSettings.subtitleStyle.outlineColor),
                        onClick = { showOutlineColorDialog = true }
                    )
                }
                
            }
            
            // Advanced Subtitle Settings Section Header
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Advanced Subtitle Rendering",
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
    
    // Language Selection Dialog
    if (showLanguageDialog) {
        LanguageSelectionDialog(
            title = "Preferred Language",
            selectedLanguage = playerSettings.subtitleStyle.preferredLanguage,
            showNoneOption = false,
            onLanguageSelected = { language ->
                language?.let {
                    coroutineScope.launch {
                        viewModel.setSubtitlePreferredLanguage(it)
                    }
                }
                showLanguageDialog = false
            },
            onDismiss = { showLanguageDialog = false }
        )
    }
    
    // Secondary Language Selection Dialog
    if (showSecondaryLanguageDialog) {
        LanguageSelectionDialog(
            title = "Secondary Preferred Language",
            selectedLanguage = playerSettings.subtitleStyle.secondaryPreferredLanguage,
            showNoneOption = true,
            onLanguageSelected = { language ->
                coroutineScope.launch {
                    viewModel.setSubtitleSecondaryLanguage(language)
                }
                showSecondaryLanguageDialog = false
            },
            onDismiss = { showSecondaryLanguageDialog = false }
        )
    }
    
    // Text Color Selection Dialog
    if (showTextColorDialog) {
        ColorSelectionDialog(
            title = "Text Color",
            colors = SUBTITLE_COLORS,
            selectedColor = Color(playerSettings.subtitleStyle.textColor),
            onColorSelected = { color ->
                coroutineScope.launch {
                    viewModel.setSubtitleTextColor(color.toArgb())
                }
                showTextColorDialog = false
            },
            onDismiss = { showTextColorDialog = false }
        )
    }
    
    // Background Color Selection Dialog
    if (showBackgroundColorDialog) {
        ColorSelectionDialog(
            title = "Background Color",
            colors = BACKGROUND_COLORS,
            selectedColor = Color(playerSettings.subtitleStyle.backgroundColor),
            showTransparentOption = true,
            onColorSelected = { color ->
                coroutineScope.launch {
                    viewModel.setSubtitleBackgroundColor(color.toArgb())
                }
                showBackgroundColorDialog = false
            },
            onDismiss = { showBackgroundColorDialog = false }
        )
    }
    
    // Outline Color Selection Dialog
    if (showOutlineColorDialog) {
        ColorSelectionDialog(
            title = "Outline Color",
            colors = OUTLINE_COLORS,
            selectedColor = Color(playerSettings.subtitleStyle.outlineColor),
            onColorSelected = { color ->
                coroutineScope.launch {
                    viewModel.setSubtitleOutlineColor(color.toArgb())
                }
                showOutlineColorDialog = false
            },
            onDismiss = { showOutlineColorDialog = false }
        )
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

@Composable
private fun NavigationSettingsItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    
    Card(
        onClick = onClick,
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

            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = NuvioColors.TextSecondary,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@Composable
private fun SliderSettingsItem(
    icon: ImageVector,
    title: String,
    value: Int,
    valueText: String,
    minValue: Int,
    maxValue: Int,
    step: Int,
    onValueChange: (Int) -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    
    Card(
        onClick = { },
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused }
            .onKeyEvent { event ->
                if (event.nativeKeyEvent.action != KeyEvent.ACTION_DOWN) return@onKeyEvent false
                when (event.nativeKeyEvent.keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        val newValue = (value - step).coerceAtLeast(minValue)
                        if (newValue != value) onValueChange(newValue)
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        val newValue = (value + step).coerceAtMost(maxValue)
                        if (newValue != value) onValueChange(newValue)
                        true
                    }
                    else -> false
                }
            },
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
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (isFocused) NuvioColors.Primary else NuvioColors.TextSecondary,
                    modifier = Modifier.size(28.dp)
                )

                Spacer(modifier = Modifier.width(16.dp))

                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioColors.TextPrimary,
                    modifier = Modifier.weight(1f)
                )

                Text(
                    text = valueText,
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioColors.Primary
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Custom slider controls for TV - use Row with focusable buttons
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                // Decrease button
                var decreaseFocused by remember { mutableStateOf(false) }
                Card(
                    onClick = { 
                        val newValue = (value - step).coerceAtLeast(minValue)
                        onValueChange(newValue)
                    },
                    modifier = Modifier
                        .onFocusChanged { decreaseFocused = it.isFocused },
                    colors = CardDefaults.colors(
                        containerColor = NuvioColors.BackgroundElevated,
                        focusedContainerColor = NuvioColors.Primary
                    ),
                    border = CardDefaults.border(
                        focusedBorder = Border(
                            border = BorderStroke(2.dp, NuvioColors.FocusRing),
                            shape = CircleShape
                        )
                    ),
                    shape = CardDefaults.shape(shape = CircleShape),
                    scale = CardDefaults.scale(focusedScale = 1.15f)
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Remove,
                            contentDescription = "Decrease",
                            tint = if (decreaseFocused) NuvioColors.OnPrimary else NuvioColors.TextPrimary,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
                
                // Progress bar
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(NuvioColors.BackgroundElevated)
                ) {
                    val progress = ((value - minValue).toFloat() / (maxValue - minValue).toFloat()).coerceIn(0f, 1f)
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(NuvioColors.Primary)
                    )
                }
                
                // Increase button
                var increaseFocused by remember { mutableStateOf(false) }
                Card(
                    onClick = { 
                        val newValue = (value + step).coerceAtMost(maxValue)
                        onValueChange(newValue)
                    },
                    modifier = Modifier
                        .onFocusChanged { increaseFocused = it.isFocused },
                    colors = CardDefaults.colors(
                        containerColor = NuvioColors.BackgroundElevated,
                        focusedContainerColor = NuvioColors.Primary
                    ),
                    border = CardDefaults.border(
                        focusedBorder = Border(
                            border = BorderStroke(2.dp, NuvioColors.FocusRing),
                            shape = CircleShape
                        )
                    ),
                    shape = CardDefaults.shape(shape = CircleShape),
                    scale = CardDefaults.scale(focusedScale = 1.15f)
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Increase",
                            tint = if (increaseFocused) NuvioColors.OnPrimary else NuvioColors.TextPrimary,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ColorSettingsItem(
    icon: ImageVector,
    title: String,
    currentColor: Color,
    showTransparent: Boolean = false,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    
    Card(
        onClick = onClick,
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

            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = NuvioColors.TextPrimary,
                modifier = Modifier.weight(1f)
            )

            // Color preview
            if (showTransparent || currentColor.alpha == 0f) {
                // Transparent indicator (checkered pattern simulation)
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(Color.Gray)
                        .border(2.dp, NuvioColors.Border, CircleShape)
                ) {
                    // Diagonal line to indicate transparency
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                brush = androidx.compose.ui.graphics.Brush.linearGradient(
                                    colors = listOf(Color.White, Color.Gray, Color.White)
                                )
                            )
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(currentColor)
                        .border(2.dp, NuvioColors.Border, CircleShape)
                )
            }
        }
    }
}

@Composable
private fun LanguageSelectionDialog(
    title: String,
    selectedLanguage: String?,
    showNoneOption: Boolean,
    onLanguageSelected: (String?) -> Unit,
    onDismiss: () -> Unit
) {
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Card(
            onClick = { },
            colors = CardDefaults.colors(
                containerColor = NuvioColors.BackgroundCard
            ),
            shape = CardDefaults.shape(shape = RoundedCornerShape(16.dp))
        ) {
            Column(
                modifier = Modifier
                    .width(400.dp)
                    .padding(24.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.headlineSmall,
                    color = NuvioColors.TextPrimary
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                TvLazyColumn(
                    modifier = Modifier.height(400.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (showNoneOption) {
                        item {
                            LanguageOptionItem(
                                name = "None",
                                code = null,
                                isSelected = selectedLanguage == null,
                                onClick = { onLanguageSelected(null) }
                            )
                        }
                    }
                    
                    items(AVAILABLE_SUBTITLE_LANGUAGES.size) { index ->
                        val language = AVAILABLE_SUBTITLE_LANGUAGES[index]
                        LanguageOptionItem(
                            name = language.name,
                            code = language.code,
                            isSelected = selectedLanguage == language.code,
                            onClick = { onLanguageSelected(language.code) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LanguageOptionItem(
    name: String,
    code: String?,
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
            containerColor = if (isSelected) NuvioColors.Primary.copy(alpha = 0.2f) else NuvioColors.BackgroundElevated,
            focusedContainerColor = NuvioColors.FocusBackground
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(8.dp)
            )
        ),
        shape = CardDefaults.shape(shape = RoundedCornerShape(8.dp)),
        scale = CardDefaults.scale(focusedScale = 1.02f)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                color = if (isSelected) NuvioColors.Primary else NuvioColors.TextPrimary,
                modifier = Modifier.weight(1f)
            )
            
            if (code != null) {
                Text(
                    text = code.uppercase(),
                    style = MaterialTheme.typography.bodySmall,
                    color = NuvioColors.TextSecondary
                )
            }
            
            if (isSelected) {
                Spacer(modifier = Modifier.width(12.dp))
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = NuvioColors.Primary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

@Composable
private fun ColorSelectionDialog(
    title: String,
    colors: List<Color>,
    selectedColor: Color,
    showTransparentOption: Boolean = false,
    onColorSelected: (Color) -> Unit,
    onDismiss: () -> Unit
) {
    val focusRequester = remember { FocusRequester() }
    
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .background(NuvioColors.BackgroundCard, RoundedCornerShape(16.dp))
                .padding(24.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                color = NuvioColors.TextPrimary
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Color grid using TvLazyRow for proper TV focus
            TvLazyRow(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.focusRequester(focusRequester)
            ) {
                items(colors.size) { index ->
                    val color = colors[index]
                    ColorOption(
                        color = color,
                        isSelected = color.toArgb() == selectedColor.toArgb(),
                        isTransparent = color.alpha == 0f,
                        onClick = { onColorSelected(color) }
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Cancel button
            Card(
                onClick = onDismiss,
                colors = CardDefaults.colors(
                    containerColor = NuvioColors.BackgroundElevated,
                    focusedContainerColor = NuvioColors.Primary
                ),
                border = CardDefaults.border(
                    focusedBorder = Border(
                        border = BorderStroke(2.dp, NuvioColors.FocusRing),
                        shape = RoundedCornerShape(8.dp)
                    )
                ),
                shape = CardDefaults.shape(shape = RoundedCornerShape(8.dp)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Cancel",
                    style = MaterialTheme.typography.bodyLarge,
                    color = NuvioColors.TextPrimary,
                    modifier = Modifier
                        .padding(12.dp)
                        .fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
    
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
}

@Composable
private fun ColorOption(
    color: Color,
    isSelected: Boolean,
    isTransparent: Boolean = false,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    
    Card(
        onClick = onClick,
        modifier = Modifier
            .size(48.dp)
            .onFocusChanged { isFocused = it.isFocused },
        colors = CardDefaults.colors(
            containerColor = Color.Transparent
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(3.dp, NuvioColors.FocusRing),
                shape = CircleShape
            ),
            border = if (isSelected) Border(
                border = BorderStroke(3.dp, NuvioColors.Primary),
                shape = CircleShape
            ) else Border.None
        ),
        shape = CardDefaults.shape(shape = CircleShape),
        scale = CardDefaults.scale(focusedScale = 1.15f)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.fillMaxSize()
        ) {
            if (isTransparent) {
                // Checkered pattern for transparent
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color.Gray)
                        .border(1.dp, NuvioColors.Border, CircleShape)
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(color)
                        .border(1.dp, NuvioColors.Border, CircleShape)
                )
            }
            
            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = "Selected",
                    tint = if (color == Color.White || color == Color.Yellow) Color.Black else Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}
