package com.nuvio.app.features.parentsguide

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

private val previewData = ParentsGuideData(
    identity = ParentsGuideIdentity("movie", "Fictional preview"),
    guide = ParentsGuide(
        id = "preview",
        overallStatus = ParentsGuideStatus.PARTIAL,
        overallSummary = "Preview-only information with several content advisories.",
        categories = listOf(
            ParentsGuideCategory(
                ParentsGuideCategoryType.SEX_NUDITY,
                severity = ParentsGuideSeverity.MODERATE,
                scenes = listOf(ParentsGuideScene("A concise preview description.", spoilerLevel = ParentsGuideSpoilerLevel.NONE)),
            ),
            ParentsGuideCategory(
                ParentsGuideCategoryType.VIOLENCE_GORE,
                severity = ParentsGuideSeverity.SEVERE,
                scenes = listOf(ParentsGuideScene("A long preview description used to verify wrapping at large text sizes without horizontal overflow.", startSeconds = 862, spoilerLevel = ParentsGuideSpoilerLevel.MAJOR)),
            ),
        ),
        sources = listOf(ParentsGuideSource("moderator_entry", "Preview source", attributionText = "Preview only")),
    ),
)

@Composable
private fun PreviewFrame(content: @Composable () -> Unit) {
    MaterialTheme { Box(Modifier.width(390.dp).padding(16.dp)) { content() } }
}

@Preview
@Composable
private fun ParentsGuideCollapsedPreview() = PreviewFrame {
    ParentsGuideSection(ParentsGuideUiState.Available(previewData), onRetry = {}, onContribute = {})
}

@Preview
@Composable
private fun ParentsGuideExpandedPreview() = PreviewFrame {
    ParentsGuideSection(ParentsGuideUiState.Available(previewData), initiallyExpanded = true, onRetry = {}, onContribute = {})
}

@Preview
@Composable
private fun ParentsGuideSevereCategoryPreview() = PreviewFrame {
    ParentsGuideCategoryRow(previewData.guide.categories[1], expanded = true, showSpoilers = true, showTimestamps = true, onToggle = {})
}

@Preview
@Composable
private fun ParentsGuideUnavailablePreview() = PreviewFrame {
    ParentsGuideSection(ParentsGuideUiState.Unavailable(), initiallyExpanded = true, onRetry = {}, onContribute = {})
}

@Preview
@Composable
private fun ParentsGuideLoadingPreview() = PreviewFrame {
    ParentsGuideSection(ParentsGuideUiState.Loading, initiallyExpanded = true, onRetry = {}, onContribute = {})
}

@Preview
@Composable
private fun ParentsGuideErrorPreview() = PreviewFrame {
    ParentsGuideSection(ParentsGuideUiState.Error(), initiallyExpanded = true, onRetry = {}, onContribute = {})
}

@Preview(fontScale = 1.8f)
@Composable
private fun ParentsGuideLargeTextPreview() = PreviewFrame {
    ParentsGuideCategoryRow(previewData.guide.categories[1], expanded = true, showSpoilers = true, showTimestamps = true, onToggle = {})
}

@Preview
@Composable
private fun ParentsGuideRtlPreview() {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        PreviewFrame { ParentsGuideSection(ParentsGuideUiState.Available(previewData), initiallyExpanded = true, onRetry = {}, onContribute = {}) }
    }
}
