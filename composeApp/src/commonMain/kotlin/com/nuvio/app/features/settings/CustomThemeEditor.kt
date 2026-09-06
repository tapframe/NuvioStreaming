package com.nuvio.app.features.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import com.nuvio.app.core.ui.CustomThemeColors
import com.nuvio.app.core.ui.NuvioInputField
import com.nuvio.app.core.ui.NuvioModalBottomSheet
import com.nuvio.app.core.ui.NuvioPrimaryButton
import com.nuvio.app.core.ui.NuvioTheme
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.dismissNuvioBottomSheet
import com.nuvio.app.core.ui.formatHexColor
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.parseHexColor
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_cancel
import nuvio.composeapp.generated.resources.custom_theme_color_number
import nuvio.composeapp.generated.resources.custom_theme_hex_error
import nuvio.composeapp.generated.resources.custom_theme_hex_title
import nuvio.composeapp.generated.resources.custom_theme_save
import nuvio.composeapp.generated.resources.custom_theme_subtitle
import nuvio.composeapp.generated.resources.custom_theme_title
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun CustomThemeEditor(
    initialColors: CustomThemeColors,
    onSave: (CustomThemeColors) -> Unit,
    onDismiss: () -> Unit,
) {
    NuvioTheme {
        CustomThemeEditorSheet(initialColors, onSave, onDismiss)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CustomThemeEditorSheet(
    initialColors: CustomThemeColors,
    onSave: (CustomThemeColors) -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var encodedColors by rememberSaveable { mutableStateOf(initialColors.encode()) }
    var selectedIndex by rememberSaveable { mutableStateOf(0) }
    val colors = CustomThemeColors.decode(encodedColors)
    var hexCode by rememberSaveable(selectedIndex) { mutableStateOf(formatHexColor(colors.colors[selectedIndex])) }
    val validHex = parseHexColor(hexCode) != null
    fun dismiss() {
        scope.launch { dismissNuvioBottomSheet(sheetState, onDismiss) }
    }

    NuvioModalBottomSheet(
        onDismissRequest = ::dismiss,
        sheetState = sheetState,
        fullHeight = true,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().fillMaxHeight(0.94f)
                .imePadding().navigationBarsPadding()
                .padding(horizontal = tokens.spacing.sheetPadding),
            verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
        ) {
            Text(
                text = stringResource(Res.string.custom_theme_title),
                style = MaterialTheme.typography.titleLarge,
                color = tokens.colors.textPrimary,
            )
            Column(
                modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s16),
            ) {
                Text(
                    text = stringResource(Res.string.custom_theme_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.colors.textSecondary,
                )
                CustomThemePreview(colors)
                Row(horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8)) {
                    colors.colors.forEachIndexed { index, color ->
                        ThemeColorSlot(
                            index = index,
                            color = color,
                            selected = selectedIndex == index,
                            onClick = { selectedIndex = index },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                ThemeColorPicker(
                    color = colors.colors[selectedIndex],
                    colorIndex = selectedIndex,
                    onColorChanged = {
                        encodedColors = colors.withColor(selectedIndex, it).encode()
                        hexCode = formatHexColor(it)
                    },
                )
                Column(verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s8)) {
                    val hexLabel = stringResource(Res.string.custom_theme_hex_title)
                    Text(
                        text = hexLabel,
                        style = MaterialTheme.typography.labelLarge,
                        color = tokens.colors.textPrimary,
                    )
                    NuvioInputField(
                        value = hexCode,
                        onValueChange = { value ->
                            hexCode = value
                            parseHexColor(value)?.let { encodedColors = colors.withColor(selectedIndex, it).encode() }
                        },
                        placeholder = "#B75AFF",
                        modifier = Modifier.semantics { contentDescription = hexLabel },
                    )
                    if (!validHex) {
                        Text(
                            text = stringResource(Res.string.custom_theme_hex_error),
                            style = MaterialTheme.typography.bodySmall,
                            color = tokens.colors.danger,
                        )
                    }
                }
            }
            Row(
                modifier = Modifier.padding(bottom = NuvioTokens.Space.s12),
                horizontalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s12),
            ) {
                TextButton(onClick = ::dismiss, modifier = Modifier.height(NuvioTokens.Space.s48 + NuvioTokens.Space.s4)) {
                    Text(stringResource(Res.string.action_cancel))
                }
                NuvioPrimaryButton(
                    text = stringResource(Res.string.custom_theme_save),
                    modifier = Modifier.weight(1f),
                    enabled = validHex,
                    onClick = {
                        onSave(colors)
                        dismiss()
                    },
                )
            }
        }
    }
}

@Composable
private fun ThemeColorSlot(
    index: Int,
    color: Int,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    Column(
        modifier = modifier
            .clip(tokens.shapes.compactCard)
            .border(
                tokens.borders.medium,
                if (selected) tokens.colors.textPrimary else tokens.colors.borderDefault,
                tokens.shapes.compactCard,
            )
            .selectable(selected, role = Role.RadioButton, onClick = onClick)
            .padding(NuvioTokens.Space.s8),
        verticalArrangement = Arrangement.spacedBy(NuvioTokens.Space.s6),
    ) {
        Box(
            Modifier.fillMaxWidth().height(NuvioTokens.Space.s32)
                .clip(tokens.shapes.compactCard).background(Color(color or 0xFF000000.toInt())),
        )
        Text(
            text = stringResource(Res.string.custom_theme_color_number, index + 1),
            style = MaterialTheme.typography.labelMedium,
            color = tokens.colors.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = formatHexColor(color),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.colors.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
