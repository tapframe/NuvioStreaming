package com.nuvio.app.core.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight

data class NuvioTypeScale(
    val labelXs: TextStyle,
    val labelSm: TextStyle,
    val bodySm: TextStyle,
    val bodyMd: TextStyle,
    val bodyLg: TextStyle,
    val titleSm: TextStyle,
    val titleMd: TextStyle,
    val titleLg: TextStyle,
    val displaySm: TextStyle,
    val displayMd: TextStyle,
)

internal val LocalNuvioTypeScale = staticCompositionLocalOf {
    NuvioTypeScale(
        labelXs = TextStyle(fontSize = NuvioTokens.Type.labelXs, lineHeight = NuvioTokens.LineHeight.labelXs, fontWeight = FontWeight.Medium),
        labelSm = TextStyle(fontSize = NuvioTokens.Type.labelSm, lineHeight = NuvioTokens.LineHeight.labelSm, fontWeight = FontWeight.Medium),
        bodySm = TextStyle(fontSize = NuvioTokens.Type.bodySm, lineHeight = NuvioTokens.LineHeight.bodySm, fontWeight = FontWeight.Normal),
        bodyMd = TextStyle(fontSize = NuvioTokens.Type.bodyMd, lineHeight = NuvioTokens.LineHeight.bodyMd, fontWeight = FontWeight.Normal),
        bodyLg = TextStyle(fontSize = NuvioTokens.Type.bodyLg, lineHeight = NuvioTokens.LineHeight.bodyLg, fontWeight = FontWeight.Medium),
        titleSm = TextStyle(fontSize = NuvioTokens.Type.titleSm, lineHeight = NuvioTokens.LineHeight.titleSm, fontWeight = FontWeight.Bold),
        titleMd = TextStyle(fontSize = NuvioTokens.Type.titleMd, lineHeight = NuvioTokens.LineHeight.titleMd, fontWeight = FontWeight.Bold),
        titleLg = TextStyle(fontSize = NuvioTokens.Type.titleLg, lineHeight = NuvioTokens.LineHeight.titleLg, fontWeight = FontWeight.Bold),
        displaySm = TextStyle(fontSize = NuvioTokens.Type.displaySm, lineHeight = NuvioTokens.LineHeight.displaySm, fontWeight = FontWeight.ExtraBold),
        displayMd = TextStyle(fontSize = NuvioTokens.Type.displayMd, lineHeight = NuvioTokens.LineHeight.displayMd, fontWeight = FontWeight.ExtraBold),
    )
}

val MaterialTheme.nuvioTypeScale: NuvioTypeScale
    @Composable
    get() = LocalNuvioTypeScale.current
