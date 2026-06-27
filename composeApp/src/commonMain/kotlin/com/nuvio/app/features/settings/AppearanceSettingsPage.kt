package com.nuvio.app.features.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.AppTheme
import com.nuvio.app.core.ui.NuvioBottomSheetActionRow
import com.nuvio.app.core.ui.NuvioBottomSheetDivider
import com.nuvio.app.core.ui.NuvioModalBottomSheet
import com.nuvio.app.core.ui.dismissNuvioBottomSheet
import com.nuvio.app.core.ui.labelRes
import com.nuvio.app.core.ui.ThemeColors
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.cd_selected
import nuvio.composeapp.generated.resources.collections_header
import nuvio.composeapp.generated.resources.compose_settings_page_continue_watching
import nuvio.composeapp.generated.resources.compose_settings_page_homescreen
import nuvio.composeapp.generated.resources.compose_settings_page_meta_screen
import nuvio.composeapp.generated.resources.compose_settings_page_poster_customization
import nuvio.composeapp.generated.resources.compose_settings_page_streams
import nuvio.composeapp.generated.resources.settings_appearance_app_language
import nuvio.composeapp.generated.resources.settings_appearance_app_language_sheet_title
import nuvio.composeapp.generated.resources.settings_appearance_amoled_black
import nuvio.composeapp.generated.resources.settings_appearance_amoled_description
import nuvio.composeapp.generated.resources.settings_appearance_continue_watching_description
import nuvio.composeapp.generated.resources.settings_appearance_liquid_glass
import nuvio.composeapp.generated.resources.settings_appearance_liquid_glass_description
import nuvio.composeapp.generated.resources.settings_appearance_poster_customization_description
import nuvio.composeapp.generated.resources.settings_appearance_section_display
import nuvio.composeapp.generated.resources.settings_appearance_section_home
import nuvio.composeapp.generated.resources.settings_appearance_section_theme
import nuvio.composeapp.generated.resources.settings_content_discovery_collections_description
import nuvio.composeapp.generated.resources.settings_content_discovery_homescreen_description
import nuvio.composeapp.generated.resources.settings_content_discovery_meta_screen_description
import nuvio.composeapp.generated.resources.compose_settings_root_streams_description
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState

internal fun LazyListScope.appearanceSettingsContent(
    isTablet: Boolean,
    selectedTheme: AppTheme,
    onThemeSelected: (AppTheme) -> Unit,
    amoledEnabled: Boolean,
    onAmoledToggle: (Boolean) -> Unit,
    liquidGlassNativeTabBarSupported: Boolean,
    liquidGlassNativeTabBarEnabled: Boolean,
    onLiquidGlassNativeTabBarToggle: (Boolean) -> Unit,
    selectedAppLanguage: AppLanguage,
    onAppLanguageSelected: (AppLanguage) -> Unit,
    onHomescreenClick: () -> Unit,
    onMetaScreenClick: () -> Unit,
    onStreamsClick: () -> Unit,
    onCollectionsClick: () -> Unit,
    onContinueWatchingClick: () -> Unit,
    onPosterCustomizationClick: () -> Unit,
) {
    item {
        SettingsSection(
            title = stringResource(Res.string.settings_appearance_section_theme),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                val themes = listOf(AppTheme.WHITE) + AppTheme.entries.filterNot { it == AppTheme.WHITE }
                val horizontalPadding = if (isTablet) 20.dp else 16.dp
                val verticalPadding = if (isTablet) 18.dp else 14.dp
                val themeSpacing = if (isTablet) 16.dp else 12.dp
                BoxWithConstraints(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = horizontalPadding,
                            vertical = verticalPadding,
                        ),
                ) {
                    val preferredColumns = if (isTablet) 4 else 3
                    val minThemeCellWidth = if (isTablet) 92.dp else 78.dp
                    val themeColumns = ((maxWidth + themeSpacing) / (minThemeCellWidth + themeSpacing))
                        .toInt()
                        .coerceAtLeast(1)
                        .coerceAtMost(preferredColumns)

                    Column(
                        verticalArrangement = Arrangement.spacedBy(themeSpacing),
                    ) {
                        themes.chunked(themeColumns).forEach { rowThemes ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(themeSpacing),
                            ) {
                                rowThemes.forEach { theme ->
                                    ThemeChip(
                                        theme = theme,
                                        isSelected = theme == selectedTheme,
                                        onClick = { onThemeSelected(theme) },
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                repeat(themeColumns - rowThemes.size) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    item {
        var showLanguageSheet by remember { mutableStateOf(false) }
        SettingsSection(
            title = stringResource(Res.string.settings_appearance_section_display),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsSwitchRow(
                    title = stringResource(Res.string.settings_appearance_amoled_black),
                    description = stringResource(Res.string.settings_appearance_amoled_description),
                    checked = amoledEnabled,
                    isTablet = isTablet,
                    onCheckedChange = onAmoledToggle,
                )
                if (liquidGlassNativeTabBarSupported) {
                    SettingsGroupDivider(isTablet = isTablet)
                    SettingsSwitchRow(
                        title = stringResource(Res.string.settings_appearance_liquid_glass),
                        description = stringResource(Res.string.settings_appearance_liquid_glass_description),
                        checked = liquidGlassNativeTabBarEnabled,
                        isTablet = isTablet,
                        onCheckedChange = onLiquidGlassNativeTabBarToggle,
                    )
                }
                SettingsGroupDivider(isTablet = isTablet)
                SettingsNavigationRow(
                    title = stringResource(Res.string.settings_appearance_app_language),
                    description = stringResource(selectedAppLanguage.labelRes),
                    isTablet = isTablet,
                    onClick = { showLanguageSheet = true },
                )
            }
        }

        if (showLanguageSheet) {
            AppearanceLanguageBottomSheet(
                selectedLanguage = selectedAppLanguage,
                onLanguageSelected = {
                    onAppLanguageSelected(it)
                    showLanguageSheet = false
                },
                onDismiss = { showLanguageSheet = false },
            )
        }
    }

    item {
        SettingsSection(
            title = stringResource(Res.string.settings_appearance_section_home),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsNavigationRow(
                    title = stringResource(Res.string.compose_settings_page_homescreen),
                    description = stringResource(Res.string.settings_content_discovery_homescreen_description),
                    isTablet = isTablet,
                    onClick = onHomescreenClick,
                )
                SettingsGroupDivider(isTablet = isTablet)
                SettingsNavigationRow(
                    title = stringResource(Res.string.collections_header),
                    description = stringResource(Res.string.settings_content_discovery_collections_description),
                    isTablet = isTablet,
                    onClick = onCollectionsClick,
                )
                SettingsGroupDivider(isTablet = isTablet)
                SettingsNavigationRow(
                    title = stringResource(Res.string.compose_settings_page_continue_watching),
                    description = stringResource(Res.string.settings_appearance_continue_watching_description),
                    isTablet = isTablet,
                    onClick = onContinueWatchingClick,
                )
                SettingsGroupDivider(isTablet = isTablet)
                SettingsNavigationRow(
                    title = stringResource(Res.string.compose_settings_page_poster_customization),
                    description = stringResource(Res.string.settings_appearance_poster_customization_description),
                    isTablet = isTablet,
                    onClick = onPosterCustomizationClick,
                )
            }
        }
    }
    item {
        SettingsSection(
            title = stringResource(Res.string.compose_settings_page_streams),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsNavigationRow(
                    title = stringResource(Res.string.compose_settings_page_streams),
                    description = stringResource(Res.string.compose_settings_root_streams_description),
                    isTablet = isTablet,
                    onClick = onStreamsClick,
                )
            }
        }
    }
    item {
        SettingsSection(
            title = stringResource(Res.string.compose_settings_page_meta_screen),
            isTablet = isTablet,
        ) {
            SettingsGroup(isTablet = isTablet) {
                SettingsNavigationRow(
                    title = stringResource(Res.string.compose_settings_page_meta_screen),
                    description = stringResource(Res.string.settings_content_discovery_meta_screen_description),
                    isTablet = isTablet,
                    onClick = onMetaScreenClick,
                )
            }
        }
    }
}

private data class AppLanguageSheetOption(
    val language: AppLanguage,
    val labelRes: StringResource,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppearanceLanguageBottomSheet(
    selectedLanguage: AppLanguage,
    onLanguageSelected: (AppLanguage) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val coroutineScope = rememberCoroutineScope()
    val options = remember {
        AppLanguage.entries.map { language ->
            AppLanguageSheetOption(
                language = language,
                labelRes = language.labelRes,
            )
        }
    }

    NuvioModalBottomSheet(
        onDismissRequest = {
            coroutineScope.launch {
                dismissNuvioBottomSheet(sheetState = sheetState, onDismiss = onDismiss)
            }
        },
        sheetState = sheetState,
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
        ) {
            item {
                Text(
                    text = stringResource(Res.string.settings_appearance_app_language_sheet_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                )
            }

            itemsIndexed(options) { index, option ->
                if (index > 0) {
                    NuvioBottomSheetDivider()
                }
                NuvioBottomSheetActionRow(
                    title = stringResource(option.labelRes),
                    onClick = {
                        onLanguageSelected(option.language)
                        coroutineScope.launch {
                            dismissNuvioBottomSheet(sheetState = sheetState, onDismiss = onDismiss)
                        }
                    },
                    trailingContent = {
                        if (option.language == selectedLanguage) {
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

@Composable
private fun ThemeChip(
    theme: AppTheme,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = ThemeColors.getColorPalette(theme)

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .then(
                    if (isSelected) {
                        Modifier.border(
                            width = 1.5.dp,
                            color = palette.focusRing,
                            shape = RoundedCornerShape(14.dp),
                        )
                    } else {
                        Modifier
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(palette.secondary),
                contentAlignment = Alignment.Center,
            ) {
                if (isSelected) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = stringResource(Res.string.cd_selected),
                        tint = palette.onSecondary,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = stringResource(theme.labelRes),
            style = MaterialTheme.typography.labelMedium,
            color = if (isSelected) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(modifier = Modifier.height(4.dp))

        Box(
            modifier = Modifier
                .size(width = 36.dp, height = 3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(palette.focusRing),
        )
    }
}
