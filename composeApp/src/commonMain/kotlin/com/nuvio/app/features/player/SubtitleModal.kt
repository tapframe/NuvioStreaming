package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvio
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.addon_title
import nuvio.composeapp.generated.resources.compose_player_built_in
import nuvio.composeapp.generated.resources.compose_player_fetch_subtitles
import nuvio.composeapp.generated.resources.compose_player_languages
import nuvio.composeapp.generated.resources.compose_player_none
import nuvio.composeapp.generated.resources.compose_player_style
import nuvio.composeapp.generated.resources.compose_player_subtitles
import nuvio.composeapp.generated.resources.settings_playback_option_forced
import nuvio.composeapp.generated.resources.subtitle_language_unknown
import org.jetbrains.compose.resources.stringResource

@Composable
fun SubtitleModal(
    visible: Boolean,
    subtitleTracks: List<SubtitleTrack>,
    selectedSubtitleIndex: Int,
    addonSubtitles: List<AddonSubtitle>,
    subtitleSessionKey: String,
    isLoadingAddonSubtitles: Boolean,
    preferredSubtitleLanguage: String,
    secondaryPreferredSubtitleLanguage: String?,
    subtitleStyle: SubtitleStyleState,
    subtitleDelayMs: Int,
    selectedAddonSubtitle: AddonSubtitle?,
    subtitleAutoSyncState: SubtitleAutoSyncUiState,
    onBuiltInTrackSelected: (Int) -> Unit,
    onAddonSubtitleSelected: (AddonSubtitle) -> Unit,
    onFetchAddonSubtitles: () -> Unit,
    onStyleChanged: (SubtitleStyleState) -> Unit,
    onSubtitleDelayChanged: (Int) -> Unit,
    onSubtitleDelayReset: () -> Unit,
    onAutoSyncCapture: () -> Unit,
    onAutoSyncCueSelected: (SubtitleSyncCue) -> Unit,
    onAutoSyncReload: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val addonIdentityRegistry = remember(subtitleSessionKey) { AddonSubtitleSessionRegistry() }
    val optionLazyKeyRegistry = remember(subtitleSessionKey) { SubtitleOptionLazyKeyRegistry() }
    val sessionAddonSubtitles = remember(addonIdentityRegistry, addonSubtitles, selectedAddonSubtitle) {
        addonIdentityRegistry.reconcile(
            subtitles = addonSubtitles,
            pinnedSubtitle = selectedAddonSubtitle,
        )
    }
    val selectedAddonIdentity = selectedAddonSubtitle?.let(addonIdentityRegistry::identityOf)
    val playbackLanguageKey = selectedSubtitleLanguageKey(
        subtitleTracks = subtitleTracks,
        selectedSubtitleIndex = selectedSubtitleIndex,
        selectedAddonSubtitle = selectedAddonSubtitle,
    )
    val playbackOptionKey = selectedSubtitleOptionKey(
        subtitleTracks = subtitleTracks,
        selectedSubtitleIndex = selectedSubtitleIndex,
        selectedAddonIdentity = selectedAddonIdentity,
    )
    val languageItems = remember(
        subtitleTracks,
        sessionAddonSubtitles,
        preferredSubtitleLanguage,
        secondaryPreferredSubtitleLanguage,
        subtitleStyle.showOnlyPreferredLanguages,
        playbackLanguageKey,
    ) {
        buildSubtitleLanguageItems(
            subtitleTracks = subtitleTracks,
            addonSubtitles = sessionAddonSubtitles.map { it.subtitle },
            preferredLanguage = preferredSubtitleLanguage,
            secondaryPreferredLanguage = secondaryPreferredSubtitleLanguage,
            showOnlyPreferredLanguages = subtitleStyle.showOnlyPreferredLanguages,
            selectedLanguageKey = playbackLanguageKey,
        )
    }
    val initialLanguageKey = playbackLanguageKey.takeIf { key -> languageItems.any { it.key == key } }
        ?: languageItems.firstOrNull { it.key != SubtitleOffLanguageKey }?.key
        ?: SubtitleOffLanguageKey
    var selectionState by remember(visible, subtitleSessionKey) {
        mutableStateOf(
            SubtitleModalSelectionState.fromPlayback(
                languageKey = initialLanguageKey,
                optionKey = playbackOptionKey,
            ),
        )
    }
    val activeLanguageKey = selectionState.activeLanguageKey
    val options = remember(activeLanguageKey, subtitleTracks, sessionAddonSubtitles) {
        buildSubtitleSelectionOptions(activeLanguageKey, subtitleTracks, sessionAddonSubtitles)
    }
    val selectedOptionKey = selectionState.requestedOptionKey
    val styleVisible = activeLanguageKey != SubtitleOffLanguageKey &&
        selectedOptionKey != null && options.any { it.key == selectedOptionKey }
    val languageListState = rememberLazyListState()
    val optionListState = rememberLazyListState()
    var initialScrollPending by remember(visible, subtitleSessionKey) { mutableStateOf(visible) }

    LaunchedEffect(languageItems, playbackLanguageKey, playbackOptionKey) {
        if (!selectionState.isUserOwned && languageItems.none { it.key == selectionState.activeLanguageKey }) {
            val fallbackLanguageKey = playbackLanguageKey.takeIf { key -> languageItems.any { it.key == key } }
                ?: languageItems.firstOrNull { it.key != SubtitleOffLanguageKey }?.key
                ?: SubtitleOffLanguageKey
            selectionState = SubtitleModalSelectionState.fromPlayback(
                languageKey = fallbackLanguageKey,
                optionKey = playbackOptionKey,
            )
        }
    }

    LaunchedEffect(playbackLanguageKey, playbackOptionKey) {
        if (playbackOptionKey != null || playbackLanguageKey == SubtitleOffLanguageKey) {
            selectionState = selectionState.observePlayback(playbackLanguageKey, playbackOptionKey)
        }
    }

    LaunchedEffect(visible, languageItems, options, selectedOptionKey, subtitleSessionKey) {
        if (!visible || !initialScrollPending) return@LaunchedEffect
        languageItems.indexOfFirst { it.key == activeLanguageKey }.takeIf { it >= 0 }?.let { index ->
            languageListState.scrollToItem(index)
        }
        if (selectedOptionKey == null) {
            initialScrollPending = false
        } else {
            options.indexOfFirst { it.key == selectedOptionKey }.takeIf { it >= 0 }?.let { index ->
                optionListState.scrollToItem(index)
                initialScrollPending = false
            }
        }
    }

    PlayerOverlayScaffold(
        visible = visible,
        onDismiss = onDismiss,
        modifier = modifier,
        contentPadding = PaddingValues(start = 52.dp, end = 52.dp, top = 36.dp, bottom = 76.dp),
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val railMaxHeight = (maxHeight - 72.dp).coerceAtLeast(120.dp)

            Column(
                modifier = Modifier.align(Alignment.BottomStart),
                verticalArrangement = Arrangement.Bottom,
            ) {
                Text(
                    text = stringResource(Res.string.compose_player_subtitles),
                    color = Color.White,
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.padding(bottom = 12.dp),
                )

                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    SubtitleRail(
                        title = stringResource(Res.string.compose_player_languages),
                        width = 200.dp,
                    ) {
                        LazyColumn(
                            state = languageListState,
                            modifier = Modifier.heightIn(max = railMaxHeight),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                            contentPadding = PaddingValues(vertical = 8.dp),
                        ) {
                            items(languageItems, key = { subtitleLanguageLazyListKey(it.key) }) { item ->
                                SubtitleLanguageRow(
                                    item = item,
                                    selected = item.key == activeLanguageKey,
                                    onClick = {
                                        val availableOptions = buildSubtitleSelectionOptions(
                                            item.key,
                                            subtitleTracks,
                                            sessionAddonSubtitles,
                                        )
                                        val optionKeyInLanguage = playbackOptionKey?.takeIf { key ->
                                            availableOptions.any { it.key == key }
                                        }
                                        selectionState = selectionState.selectLanguage(
                                            languageKey = item.key,
                                            optionKeyInLanguage = optionKeyInLanguage,
                                        )
                                        if (item.key == SubtitleOffLanguageKey) {
                                            onBuiltInTrackSelected(-1)
                                        }
                                    },
                                )
                            }
                        }
                    }

                    SubtitleRail(
                        title = stringResource(Res.string.compose_player_subtitles),
                        width = 300.dp,
                    ) {
                        when {
                            options.isEmpty() -> {
                                when (
                                    subtitleOptionsRailEmptyContent(
                                        selectedLanguageKey = activeLanguageKey,
                                        hasAvailableLanguages = languageItems.size > 1,
                                        isLoadingAddonSubtitles = isLoadingAddonSubtitles,
                                    )
                                ) {
                                    SubtitleOptionsRailEmptyContent.NONE -> {
                                        SubtitleRailEmptyState(
                                            text = stringResource(Res.string.compose_player_none),
                                        )
                                    }

                                    SubtitleOptionsRailEmptyContent.LOADING -> {
                                        PlayerModalLoading(modifier = Modifier.padding(vertical = 24.dp))
                                    }

                                    SubtitleOptionsRailEmptyContent.FETCH -> {
                                        SubtitleRailEmptyState(
                                            text = stringResource(Res.string.compose_player_fetch_subtitles),
                                            onClick = onFetchAddonSubtitles,
                                        )
                                    }
                                }
                            }

                            else -> {
                                LazyColumn(
                                    state = optionListState,
                                    modifier = Modifier.heightIn(max = railMaxHeight),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                    contentPadding = PaddingValues(vertical = 8.dp),
                                ) {
                                    items(options, key = { optionLazyKeyRegistry.keyFor(it.key) }) { option ->
                                        SubtitleOptionRow(
                                            option = option,
                                            pointerInputKey = optionLazyKeyRegistry.keyFor(option.key),
                                            selected = option.key == selectedOptionKey,
                                            onClick = {
                                                selectionState = selectionState.selectOption(
                                                    languageKey = activeLanguageKey,
                                                    optionKey = option.key,
                                                )
                                                when (option) {
                                                    is SubtitleSelectionOption.BuiltIn -> {
                                                        onBuiltInTrackSelected(option.track.index)
                                                    }

                                                    is SubtitleSelectionOption.Addon -> {
                                                        onAddonSubtitleSelected(option.subtitle)
                                                    }
                                                }
                                            },
                                        )
                                    }
                                }
                            }
                        }
                    }

                    AnimatedVisibility(
                        visible = styleVisible,
                        enter = fadeIn(),
                        exit = fadeOut(),
                    ) {
                        SubtitleRail(
                            title = stringResource(Res.string.compose_player_style),
                            width = 280.dp,
                        ) {
                            Column(
                                modifier = Modifier
                                    .heightIn(max = railMaxHeight)
                                    .verticalScroll(rememberScrollState()),
                            ) {
                                SubtitleStylePanel(
                                    style = subtitleStyle,
                                    subtitleDelayMs = subtitleDelayMs,
                                    selectedAddonSubtitle = selectedAddonSubtitle,
                                    subtitleAutoSyncState = subtitleAutoSyncState,
                                    isCompact = railMaxHeight < 420.dp,
                                    showHeader = false,
                                    onStyleChanged = onStyleChanged,
                                    onSubtitleDelayChanged = onSubtitleDelayChanged,
                                    onSubtitleDelayReset = onSubtitleDelayReset,
                                    onAutoSyncCapture = onAutoSyncCapture,
                                    onAutoSyncCueSelected = onAutoSyncCueSelected,
                                    onAutoSyncReload = onAutoSyncReload,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

internal class SubtitleOptionLazyKeyRegistry {
    private val addonKeys = mutableMapOf<AddonSubtitleSessionIdentity, String>()
    private var nextAddonToken = 1L

    fun keyFor(key: SubtitleSelectionKey): String = when (key) {
        is SubtitleSelectionKey.BuiltIn -> {
            "subtitle-option-builtin:${key.trackIndex}:${key.trackId.length}:${key.trackId}"
        }

        is SubtitleSelectionKey.Addon -> addonKeys.getOrPut(key.identity) {
            "subtitle-option-addon-${nextAddonToken++}"
        }
    }
}

internal fun subtitleLanguageLazyListKey(languageKey: String): String = when (languageKey) {
    SubtitleOffLanguageKey -> "subtitle-language-off"
    SubtitleUnknownLanguageKey -> "subtitle-language-unknown"
    else -> "subtitle-language:${languageKey.length}:$languageKey"
}

internal fun isUnhandledTap(
    standardClickWasHandled: Boolean,
    downX: Float,
    downY: Float,
    upX: Float,
    upY: Float,
    touchSlop: Float,
): Boolean {
    if (standardClickWasHandled) return false
    val deltaX = upX - downX
    val deltaY = upY - downY
    return deltaX * deltaX + deltaY * deltaY <= touchSlop * touchSlop
}

private suspend fun PointerInputScope.detectUnhandledTap(
    handledClickCount: () -> Int,
    positionInRoot: (Offset) -> Offset?,
    onUnhandledClick: () -> Unit,
) {
    awaitEachGesture {
        val down = awaitFirstDown(
            requireUnconsumed = false,
            pass = PointerEventPass.Initial,
        )
        val downPositionInRoot = positionInRoot(down.position) ?: return@awaitEachGesture
        val handledClickCountOnDown = handledClickCount()

        var upPositionInRoot: Offset? = null
        var cancelled = false
        while (upPositionInRoot == null && !cancelled) {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            if (event.changes.size != 1) {
                cancelled = true
                continue
            }
            val change = event.changes.firstOrNull { it.id == down.id }
            if (change == null) {
                cancelled = true
            } else if (!change.pressed) {
                upPositionInRoot = positionInRoot(change.position)
                if (upPositionInRoot == null) cancelled = true
            }
        }

        val resolvedUpPositionInRoot = upPositionInRoot
        if (!cancelled && resolvedUpPositionInRoot != null) {
            awaitPointerEvent(PointerEventPass.Final)
        }
        val standardClickWasHandled = handledClickCount() != handledClickCountOnDown
        if (
            !cancelled &&
            resolvedUpPositionInRoot != null &&
            isUnhandledTap(
                standardClickWasHandled = standardClickWasHandled,
                downX = downPositionInRoot.x,
                downY = downPositionInRoot.y,
                upX = resolvedUpPositionInRoot.x,
                upY = resolvedUpPositionInRoot.y,
                touchSlop = viewConfiguration.touchSlop,
            )
        ) {
            onUnhandledClick()
        }
    }
}

@Composable
private fun Modifier.clickableIncludingFlingStop(
    pointerInputKey: Any,
    onClick: () -> Unit,
): Modifier {
    // A scrollable consumes the first stationary touch that stops a fling. Keep clickable for
    // semantics/ripple, then invoke the same row only when clickable did not handle that tap.
    var handledClickCount by remember(pointerInputKey) { mutableIntStateOf(0) }
    var layoutCoordinates by remember(pointerInputKey) { mutableStateOf<LayoutCoordinates?>(null) }
    val currentOnClick by rememberUpdatedState(onClick)

    return onGloballyPositioned { layoutCoordinates = it }
        .pointerInput(pointerInputKey) {
            detectUnhandledTap(
                handledClickCount = { handledClickCount },
                positionInRoot = { position ->
                    layoutCoordinates
                        ?.takeIf { it.isAttached }
                        ?.localToRoot(position)
                },
                onUnhandledClick = { currentOnClick() },
            )
        }
        .clickable {
            handledClickCount++
            currentOnClick()
        }
}

@Composable
private fun SubtitleRail(
    title: String,
    width: Dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = MaterialTheme.nuvio

    Column(
        modifier = Modifier.width(width),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = title,
            color = tokens.colors.textMuted,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        content()
    }
}

@Composable
private fun SubtitleLanguageRow(
    item: SubtitleLanguageItem,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val label = when (item.key) {
        SubtitleOffLanguageKey -> stringResource(Res.string.compose_player_none)
        SubtitleUnknownLanguageKey -> stringResource(Res.string.subtitle_language_unknown)
        else -> languageLabelForCode(item.key)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) tokens.colors.accent else Color.Transparent)
            .clickableIncludingFlingStop(item.key, onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier.weight(1f, fill = false),
            color = if (selected) tokens.colors.onAccent else Color.White,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (item.count > 0) {
            Text(
                text = item.count.toString(),
                modifier = Modifier
                    .padding(start = 6.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        if (selected) Color.White.copy(alpha = 0.18f)
                        else tokens.colors.accent.copy(alpha = 0.85f),
                    )
                    .padding(horizontal = 8.dp, vertical = 3.dp),
                color = tokens.colors.onAccent,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun SubtitleOptionRow(
    option: SubtitleSelectionOption,
    pointerInputKey: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val sourceLabel: String
    val title: String
    val metadata: String?

    when (option) {
        is SubtitleSelectionOption.BuiltIn -> {
            sourceLabel = stringResource(Res.string.compose_player_built_in)
            title = localizedTrackDisplayName(
                option.track.label,
                option.track.language,
                option.track.index,
            )
            metadata = if (option.track.isForced) {
                stringResource(Res.string.settings_playback_option_forced)
            } else {
                null
            }
        }

        is SubtitleSelectionOption.Addon -> {
            sourceLabel = option.subtitle.addonName ?: stringResource(Res.string.addon_title)
            title = languageLabelForCode(option.subtitle.language)
            metadata = option.subtitle.display.takeIf { it.isNotBlank() && it != title }
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) tokens.colors.accent else Color.Transparent)
            .clickableIncludingFlingStop(pointerInputKey, onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            SubtitleSourceChip(label = sourceLabel, selected = selected)
            Text(
                text = title,
                color = if (selected) tokens.colors.onAccent else Color.White,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            metadata?.let {
                Text(
                    text = it,
                    color = if (selected) tokens.colors.onAccent.copy(alpha = 0.72f) else tokens.colors.textMuted,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = tokens.colors.onAccent,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .size(20.dp),
            )
        }
    }
}

@Composable
private fun SubtitleSourceChip(
    label: String,
    selected: Boolean,
) {
    val tokens = MaterialTheme.nuvio
    val shape = RoundedCornerShape(999.dp)

    Box(
        modifier = Modifier
            .clip(shape)
            .background(
                if (selected) tokens.colors.onAccent.copy(alpha = 0.14f)
                else Color.White.copy(alpha = 0.08f),
            )
            .then(
                if (selected) {
                    Modifier.border(1.dp, tokens.colors.onAccent.copy(alpha = 0.22f), shape)
                } else {
                    Modifier
                },
            )
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = label,
            color = if (selected) tokens.colors.onAccent.copy(alpha = 0.9f) else Color.White.copy(alpha = 0.78f),
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SubtitleRailEmptyState(
    text: String,
    onClick: (() -> Unit)? = null,
) {
    val tokens = MaterialTheme.nuvio

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .then(onClick?.let { Modifier.clickable(onClick = it) } ?: Modifier)
            .padding(horizontal = 6.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onClick != null) {
            Icon(
                imageVector = Icons.Rounded.CloudDownload,
                contentDescription = null,
                tint = tokens.colors.textMuted,
                modifier = Modifier.size(20.dp),
            )
        }
        Text(
            text = text,
            color = tokens.colors.textMuted,
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}
