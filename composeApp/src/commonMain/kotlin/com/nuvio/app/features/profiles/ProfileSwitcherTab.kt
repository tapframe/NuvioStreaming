package com.nuvio.app.features.profiles

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Backspace
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.NuvioAsyncImage as AsyncImage
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.isIos
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource
import kotlin.math.max
import kotlin.math.min

@Composable
fun ProfileSwitcherTab(
    selected: Boolean,
    onClick: () -> Unit,
    onProfileSelected: (NuvioProfile) -> Unit,
    onAddProfileRequested: () -> Unit,
    triggerContent: (@Composable (selected: Boolean) -> Unit)? = null,
    openPopupOnClick: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    val profileState by ProfileRepository.state.collectAsStateWithLifecycle()
    val activeProfile = profileState.activeProfile
    val profiles = profileState.profiles
    val avatars by AvatarRepository.avatars.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        AvatarRepository.fetchAvatars()
        AvatarRepository.refreshAvatars()
    }

    val haptic = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current

    var showPopup by remember { mutableStateOf(false) }
    // Keep popup composed while exit animation plays
    var popupVisible by remember { mutableStateOf(false) }
    var pinProfile by remember { mutableStateOf<NuvioProfile?>(null) }
    var dragTargetProfileIndex by remember { mutableStateOf<Int?>(null) }
    var triggerCoordinates by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val profileBubbleBounds = remember(profiles.map { it.profileIndex }) {
        mutableStateMapOf<Int, Rect>()
    }

    fun performProfileHoldHaptic() {
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }

    fun performProfileHoverHaptic() {
        if (isIos) {
            ProfileHoverHapticFeedback.perform()
        } else {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }

    fun updateDragTarget(localPosition: Offset) {
        val trigger = triggerCoordinates ?: return
        val screenPosition = trigger.localToScreen(localPosition)
        val nextTargetProfileIndex = profileBubbleBounds.entries
            .firstOrNull { (_, bounds) -> bounds.contains(screenPosition) }
            ?.key
        if (nextTargetProfileIndex != null && nextTargetProfileIndex != dragTargetProfileIndex) {
            performProfileHoverHaptic()
        }
        dragTargetProfileIndex = nextTargetProfileIndex
    }

    fun chooseProfile(profile: NuvioProfile) {
        if (profile.pinEnabled) {
            pinProfile = profile
        } else {
            onProfileSelected(profile)
            showPopup = false
        }
    }

    fun chooseDragTarget() {
        val profile = profiles.firstOrNull { it.profileIndex == dragTargetProfileIndex }
        dragTargetProfileIndex = null
        if (profile != null) {
            chooseProfile(profile)
        }
    }

    // Popup entrance/exit animation
    val popupAlpha = remember { Animatable(0f) }
    val popupScale = remember { Animatable(0.5f) }
    val popupTranslateY = remember { Animatable(40f) }

    LaunchedEffect(showPopup) {
        if (showPopup) {
            popupVisible = true
            launch { popupAlpha.animateTo(1f, tween(220, easing = FastOutSlowInEasing)) }
            launch {
                popupScale.animateTo(
                    1f,
                    spring(
                        dampingRatio = Spring.DampingRatioMediumBouncy,
                        stiffness = Spring.StiffnessMedium,
                    ),
                )
            }
            launch {
                popupTranslateY.animateTo(
                    0f,
                    spring(
                        dampingRatio = Spring.DampingRatioMediumBouncy,
                        stiffness = Spring.StiffnessMedium,
                    ),
                )
            }
        } else {
            ProfileHoverHapticFeedback.release()
            // Animate out
            launch { popupAlpha.animateTo(0f, tween(180, easing = FastOutSlowInEasing)) }
            launch { popupScale.animateTo(0.85f, tween(200, easing = FastOutSlowInEasing)) }
            launch {
                popupTranslateY.animateTo(30f, tween(200, easing = FastOutSlowInEasing))
                // Remove from composition after animation completes
                popupVisible = false
                pinProfile = null
                dragTargetProfileIndex = null
            }
        }
    }

    Box(
        modifier = modifier
            .onGloballyPositioned { triggerCoordinates = it }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = {
                    if (openPopupOnClick && profiles.isNotEmpty()) {
                        showPopup = true
                    } else {
                        onClick()
                    }
                },
            )
            .pointerInput(profiles) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { startOffset ->
                        if (profiles.isNotEmpty()) {
                            performProfileHoldHaptic()
                            ProfileHoverHapticFeedback.prepare()
                            showPopup = true
                            updateDragTarget(startOffset)
                        }
                    },
                    onDrag = { change, _ ->
                        change.consume()
                        updateDragTarget(change.position)
                    },
                    onDragEnd = {
                        ProfileHoverHapticFeedback.release()
                        chooseDragTarget()
                    },
                    onDragCancel = {
                        ProfileHoverHapticFeedback.release()
                        dragTargetProfileIndex = null
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        if (triggerContent != null) {
            triggerContent(selected)
        } else {
            ActiveProfileMiniAvatar(
                profile = activeProfile,
                avatars = avatars,
                selected = selected,
                size = 28,
            )
        }

        // Floating profile popup (stays composed during exit animation)
        if (popupVisible && profiles.isNotEmpty()) {
            Popup(
                alignment = Alignment.BottomCenter,
                offset = IntOffset(0, with(density) { -NuvioTokens.Space.s64.roundToPx() }),
                properties = PopupProperties(focusable = true),
                onDismissRequest = { showPopup = false },
            ) {
                Box(
                    modifier = Modifier
                        .imePadding()
                        .graphicsLayer {
                            alpha = popupAlpha.value
                            scaleX = popupScale.value
                            scaleY = popupScale.value
                            translationY = popupTranslateY.value
                        }
                        .shadow(tokens.elevation.overlay, tokens.shapes.sheet)
                        .background(
                            tokens.colors.surfaceSheet,
                            tokens.shapes.sheet,
                        )
                        .padding(tokens.spacing.sheetPadding),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        // Profile avatars row
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(tokens.spacing.cardPadding),
                            verticalAlignment = Alignment.Top,
                        ) {
                            profiles.forEachIndexed { index, profile ->
                                val isActive =
                                    profile.profileIndex == activeProfile?.profileIndex
                                val isPinTarget =
                                    pinProfile?.profileIndex == profile.profileIndex
                                val isDragTarget =
                                    dragTargetProfileIndex == profile.profileIndex

                                PopupProfileBubble(
                                    profile = profile,
                                    avatars = avatars,
                                    isActive = isActive,
                                    isSelected = isPinTarget || isDragTarget,
                                    delayMs = index * 50,
                                    onBoundsChanged = { bounds ->
                                        profileBubbleBounds[profile.profileIndex] = bounds
                                    },
                                    onClick = {
                                        chooseProfile(profile)
                                    },
                                )
                            }

                            if (profiles.size < 4) {
                                PopupAddProfileBubble(
                                    delayMs = profiles.size * 50,
                                    onClick = {
                                        showPopup = false
                                        onAddProfileRequested()
                                    },
                                )
                            }
                        }

                        // Inline PIN entry for locked profiles
                        AnimatedVisibility(
                            visible = pinProfile != null,
                            enter = expandVertically(
                                animationSpec = spring(
                                    dampingRatio = Spring.DampingRatioLowBouncy,
                                    stiffness = Spring.StiffnessMediumLow,
                                ),
                            ) + fadeIn(tween(200)),
                            exit = shrinkVertically(tween(150)) + fadeOut(tween(100)),
                        ) {
                            pinProfile?.let { profile ->
                                InlinePinEntry(
                                    profileName = profile.name,
                                    onVerified = {
                                        onProfileSelected(profile)
                                        showPopup = false
                                    },
                                    onCancel = { pinProfile = null },
                                    verifyPin = { pin ->
                                        ProfileRepository.verifyPin(profile.profileIndex, pin)
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SidebarProfileSwitcherStack(
    onProfileSelected: (NuvioProfile) -> Unit,
    onAddProfileRequested: () -> Unit,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val profileState by ProfileRepository.state.collectAsStateWithLifecycle()
    val activeProfile = profileState.activeProfile
    val profiles = profileState.profiles
    val avatars by AvatarRepository.avatars.collectAsStateWithLifecycle()
    var pinProfile by remember { mutableStateOf<NuvioProfile?>(null) }

    LaunchedEffect(Unit) {
        AvatarRepository.fetchAvatars()
        AvatarRepository.refreshAvatars()
    }

    fun chooseProfile(profile: NuvioProfile) {
        if (profile.profileIndex == activeProfile?.profileIndex) {
            onDismissRequest()
            return
        }
        if (profile.pinEnabled) {
            pinProfile = profile
        } else {
            onProfileSelected(profile)
            onDismissRequest()
        }
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        profiles.forEach { profile ->
            SidebarProfileSwitcherRow(
                profile = profile,
                avatars = avatars,
                isActive = profile.profileIndex == activeProfile?.profileIndex,
                onClick = { chooseProfile(profile) },
            )
        }

        if (profiles.size < 4) {
            SidebarAddProfileRow(
                onClick = {
                    onDismissRequest()
                    onAddProfileRequested()
                },
            )
        }

        AnimatedVisibility(
            visible = pinProfile != null,
            enter = expandVertically() + fadeIn(tween(160)),
            exit = shrinkVertically(tween(120)) + fadeOut(tween(90)),
        ) {
            pinProfile?.let { profile ->
                SidebarCompactPinEntry(
                    profileName = profile.name,
                    onVerified = {
                        onProfileSelected(profile)
                        pinProfile = null
                        onDismissRequest()
                    },
                    onCancel = { pinProfile = null },
                    verifyPin = { pin ->
                        ProfileRepository.verifyPin(profile.profileIndex, pin)
                    },
                )
            }
        }
    }
}

@Composable
private fun SidebarProfileSwitcherRow(
    profile: NuvioProfile,
    avatars: List<AvatarCatalogItem>,
    isActive: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(40.dp)
            .clip(tokens.shapes.compactCard)
            .background(
                if (isActive) {
                    tokens.colors.overlaySelected
                } else {
                    tokens.colors.surface.copy(alpha = 0f)
                },
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(30.dp),
            contentAlignment = Alignment.Center,
        ) {
            ActiveProfileMiniAvatar(
                profile = profile,
                avatars = avatars,
                selected = isActive,
                size = 26,
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = profile.name.ifBlank {
                stringResource(Res.string.profile_label_number, profile.profileIndex)
            },
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.labelMedium,
            color = if (isActive) tokens.colors.textPrimary else tokens.colors.textMuted,
            fontWeight = if (isActive) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (profile.pinEnabled) {
            Icon(
                imageVector = Icons.Rounded.Lock,
                contentDescription = null,
                tint = tokens.colors.textMuted,
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

@Composable
private fun SidebarAddProfileRow(
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(40.dp)
            .clip(tokens.shapes.compactCard)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(tokens.shapes.avatar)
                .background(tokens.colors.surfaceCard),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = stringResource(Res.string.compose_profile_add_profile),
                tint = tokens.colors.textMuted,
                modifier = Modifier.size(16.dp),
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = stringResource(Res.string.compose_profile_add_profile),
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.labelMedium,
            color = tokens.colors.textMuted,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SidebarCompactPinEntry(
    profileName: String,
    onVerified: () -> Unit,
    onCancel: () -> Unit,
    verifyPin: suspend (String) -> PinVerifyResult,
) {
    val tokens = MaterialTheme.nuvio
    var pin by remember(profileName) { mutableStateOf("") }
    var error by remember(profileName) { mutableStateOf<String?>(null) }
    var isVerifying by remember(profileName) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(tokens.shapes.compactCard)
            .background(tokens.colors.surfaceCard.copy(alpha = 0.72f))
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(Res.string.pin_enter_for, profileName),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.colors.textMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(4) { index ->
                val filled = index < pin.length
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(tokens.shapes.avatar)
                        .then(
                            if (filled) {
                                Modifier.background(tokens.colors.accent)
                            } else {
                                Modifier.border(tokens.borders.thin, tokens.colors.borderDefault, tokens.shapes.avatar)
                            },
                        ),
                )
            }
        }

        AnimatedVisibility(
            visible = error != null,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut(),
        ) {
            Text(
                text = error.orEmpty(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.colors.danger,
                textAlign = TextAlign.Center,
                maxLines = 2,
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        SidebarCompactPinKeypad(
            onDigit = { digit ->
                if (pin.length < 4 && !isVerifying) {
                    error = null
                    pin += digit
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    if (pin.length == 4) {
                        isVerifying = true
                        scope.launch {
                            val result = verifyPin(pin)
                            if (result.unlocked) {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onVerified()
                            } else {
                                error = if (result.retryAfterSeconds > 0) {
                                    getString(Res.string.pin_locked_try_again, result.retryAfterSeconds)
                                } else {
                                    getString(Res.string.pin_incorrect)
                                }
                                pin = ""
                            }
                            isVerifying = false
                        }
                    }
                }
            },
            onBackspace = {
                if (pin.isNotEmpty() && !isVerifying) {
                    pin = pin.dropLast(1)
                    error = null
                }
            },
        )

        Text(
            text = stringResource(Res.string.pin_cancel),
            style = MaterialTheme.typography.labelSmall,
            color = tokens.colors.accent,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clip(tokens.shapes.compactCard)
                .clickable(onClick = onCancel)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun SidebarCompactPinKeypad(
    onDigit: (String) -> Unit,
    onBackspace: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("", "0", "⌫"),
    )

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            ) {
                row.forEach { key ->
                    when (key) {
                        "" -> Spacer(modifier = Modifier.size(30.dp))
                        "⌫" -> {
                            Box(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(tokens.shapes.avatar)
                                    .background(tokens.colors.surface)
                                    .clickable(onClick = onBackspace),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.Backspace,
                                    contentDescription = stringResource(Res.string.pin_backspace),
                                    tint = tokens.colors.textPrimary,
                                    modifier = Modifier.size(14.dp),
                                )
                            }
                        }
                        else -> {
                            Box(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(tokens.shapes.avatar)
                                    .background(tokens.colors.surface)
                                    .clickable { onDigit(key) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = key,
                                    style = MaterialTheme.typography.labelLarge,
                                    color = tokens.colors.textPrimary,
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PopupAddProfileBubble(
    delayMs: Int,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val itemAlpha = remember { Animatable(0f) }
    val itemScale = remember { Animatable(0.4f) }

    LaunchedEffect(Unit) {
        delay(delayMs.toLong())
        launch { itemAlpha.animateTo(1f, tween(200, easing = FastOutSlowInEasing)) }
        launch {
            itemScale.animateTo(
                1f,
                spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessMedium,
                ),
            )
        }
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .graphicsLayer {
                alpha = itemAlpha.value
                scaleX = itemScale.value
                scaleY = itemScale.value
            }
            .clip(tokens.shapes.compactCard)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(NuvioTokens.Space.s4),
    ) {
        Box(
            modifier = Modifier
                .size(tokens.components.avatarSize)
                .clip(tokens.shapes.avatar)
                .background(tokens.colors.surfaceCard)
                .border(tokens.borders.thin + NuvioTokens.Space.hairline, tokens.colors.borderDefault.copy(alpha = tokens.opacity.medium), tokens.shapes.avatar),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = stringResource(Res.string.compose_profile_add_profile),
                tint = tokens.colors.textMuted,
                modifier = Modifier.size(tokens.icons.md + NuvioTokens.Space.s2),
            )
        }

        Spacer(modifier = Modifier.height(NuvioTokens.Space.s4))

        Text(
            text = stringResource(Res.string.compose_profile_add_profile),
            style = MaterialTheme.typography.labelSmall.copy(fontSize = NuvioTokens.Type.labelXs),
            color = tokens.colors.textMuted,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            modifier = Modifier.width(56.dp),
        )
    }
}

@Composable
private fun PopupProfileBubble(
    profile: NuvioProfile,
    avatars: List<AvatarCatalogItem>,
    isActive: Boolean,
    isSelected: Boolean,
    delayMs: Int,
    onBoundsChanged: (Rect) -> Unit,
    onClick: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val avatarColor = remember(profile.avatarColorHex) { parseHexColor(profile.avatarColorHex) }
    val avatarItem = remember(profile.avatarId, avatars) {
        profile.avatarId?.let { id -> avatars.find { it.id == id } }
    }
    val avatarImageUrl = remember(profile.avatarUrl, avatarItem) {
        profileAvatarImageUrl(profile, avatarItem)
    }

    // Per-item entrance animation
    val itemAlpha = remember { Animatable(0f) }
    val itemScale = remember { Animatable(0.4f) }
    LaunchedEffect(Unit) {
        delay(delayMs.toLong())
        launch { itemAlpha.animateTo(1f, tween(200, easing = FastOutSlowInEasing)) }
        launch {
            itemScale.animateTo(
                1f,
                spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessMedium,
                ),
            )
        }
    }

    val pressScale by animateFloatAsState(
        targetValue = if (isSelected) 1.08f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow,
        ),
        label = "pressScale",
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .onGloballyPositioned { coordinates ->
                onBoundsChanged(coordinates.boundsOnScreen())
            }
            .graphicsLayer {
                alpha = itemAlpha.value
                scaleX = itemScale.value * pressScale
                scaleY = itemScale.value * pressScale
            }
            .clip(tokens.shapes.compactCard)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(NuvioTokens.Space.s4),
    ) {
        Box(
            modifier = Modifier.size(52.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(tokens.shapes.avatar)
                    .background(
                        if (avatarImageUrl != null) {
                            avatarItem?.bgColor?.let { parseHexColor(it) } ?: avatarColor
                        } else {
                            avatarColor.copy(alpha = 0.15f)
                        },
                    )
                    .then(
                        when {
                            isSelected -> Modifier.border(
                                tokens.borders.medium + NuvioTokens.Space.hairline,
                                tokens.colors.borderSelected,
                                tokens.shapes.avatar,
                            )
                            isActive -> Modifier.border(
                                tokens.borders.medium,
                                avatarColor.copy(alpha = 0.6f),
                                tokens.shapes.avatar,
                            )
                            avatarImageUrl == null -> Modifier.border(
                                tokens.borders.thin + NuvioTokens.Space.hairline,
                                avatarColor.copy(alpha = 0.3f),
                                tokens.shapes.avatar,
                            )
                            else -> Modifier
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (avatarImageUrl != null) {
                    AsyncImage(
                        model = avatarImageUrl,
                        contentDescription = profile.name,
                        modifier = Modifier.size(48.dp).clip(tokens.shapes.avatar),
                        contentScale = ContentScale.Crop,
                    )
                } else if (profile.name.isNotBlank()) {
                    Text(
                        text = profile.name.take(1).uppercase(),
                        style = MaterialTheme.typography.titleMedium.copy(fontSize = NuvioTokens.Type.titleSm),
                        color = avatarColor,
                        fontWeight = FontWeight.Bold,
                    )
                } else {
                    Icon(
                        imageVector = Icons.Rounded.Person,
                        contentDescription = null,
                        tint = avatarColor,
                        modifier = Modifier.size(tokens.icons.lg),
                    )
                }
            }

            // Lock badge for PIN-protected profiles
            if (profile.pinEnabled) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(18.dp)
                        .clip(tokens.shapes.avatar)
                        .background(tokens.colors.surfacePopover)
                        .border(tokens.borders.thin + NuvioTokens.Space.hairline, tokens.colors.surfaceSheet, tokens.shapes.avatar),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Lock,
                        contentDescription = null,
                        tint = tokens.colors.textMuted,
                        modifier = Modifier.size(10.dp),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(NuvioTokens.Space.s4))

        Text(
            text = profile.name.ifBlank {
                stringResource(Res.string.profile_label_number, profile.profileIndex)
            },
            style = MaterialTheme.typography.labelSmall.copy(fontSize = NuvioTokens.Type.labelXs),
            color = if (isSelected) tokens.colors.accent else tokens.colors.textMuted,
            fontWeight = if (isActive || isSelected) FontWeight.Bold else FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(56.dp),
        )
    }
}

private fun LayoutCoordinates.boundsOnScreen(): Rect {
    val topLeft = localToScreen(Offset.Zero)
    val bottomRight = localToScreen(Offset(size.width.toFloat(), size.height.toFloat()))
    return Rect(
        left = min(topLeft.x, bottomRight.x),
        top = min(topLeft.y, bottomRight.y),
        right = max(topLeft.x, bottomRight.x),
        bottom = max(topLeft.y, bottomRight.y),
    )
}

/**
 * Compact inline PIN entry shown inside the popup when a PIN-protected
 * profile is tapped.
 */
@Composable
private fun InlinePinEntry(
    profileName: String,
    onVerified: () -> Unit,
    onCancel: () -> Unit,
    verifyPin: suspend (String) -> PinVerifyResult,
) {
    val tokens = MaterialTheme.nuvio
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var isVerifying by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(top = tokens.spacing.cardPadding),
    ) {
        Text(
            text = stringResource(Res.string.pin_enter_for, profileName),
            style = MaterialTheme.typography.labelMedium,
            color = tokens.colors.textMuted,
        )

        Spacer(modifier = Modifier.height(NuvioTokens.Space.s14))

        // PIN dots with bounce animation
        Row(horizontalArrangement = Arrangement.spacedBy(tokens.spacing.listGap)) {
            repeat(4) { index ->
                val filled = index < pin.length
                val dotScale = remember { Animatable(1f) }
                LaunchedEffect(filled) {
                    if (filled) {
                        dotScale.snapTo(1.4f)
                        dotScale.animateTo(
                            1f,
                            spring(
                                dampingRatio = Spring.DampingRatioMediumBouncy,
                                stiffness = Spring.StiffnessHigh,
                            ),
                        )
                    }
                }

                val dotColor = when {
                    error != null -> tokens.colors.danger
                    filled -> tokens.colors.accent
                    else -> tokens.colors.borderDefault
                }
                Box(
                    modifier = Modifier
                        .graphicsLayer {
                            scaleX = dotScale.value
                            scaleY = dotScale.value
                        }
                        .size(NuvioTokens.Space.s14)
                        .clip(tokens.shapes.avatar)
                        .then(
                            if (filled) Modifier.background(dotColor)
                            else Modifier.border(tokens.borders.medium, dotColor, tokens.shapes.avatar),
                        ),
                )
            }
        }

        // Error text
        AnimatedVisibility(
            visible = error != null,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut(),
        ) {
            Text(
                text = error.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.colors.danger,
                modifier = Modifier.padding(top = tokens.spacing.controlGap),
            )
        }

        Spacer(modifier = Modifier.height(NuvioTokens.Space.s14))

        // Compact number pad
        CompactPinKeypad(
            onDigit = { digit ->
                if (pin.length < 4 && !isVerifying) {
                    error = null
                    pin += digit
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    if (pin.length == 4) {
                        isVerifying = true
                        scope.launch {
                            val result = verifyPin(pin)
                            if (result.unlocked) {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onVerified()
                            } else {
                                error = if (result.retryAfterSeconds > 0) {
                                    getString(Res.string.pin_locked_try_again, result.retryAfterSeconds)
                                } else {
                                    getString(Res.string.pin_incorrect)
                                }
                                pin = ""
                            }
                            isVerifying = false
                        }
                    }
                }
            },
            onBackspace = {
                if (pin.isNotEmpty() && !isVerifying) {
                    pin = pin.dropLast(1)
                    error = null
                }
            },
        )

        Spacer(modifier = Modifier.height(tokens.spacing.controlGap))

        Text(
            text = stringResource(Res.string.pin_cancel),
            style = MaterialTheme.typography.labelMedium,
            color = tokens.colors.accent,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clip(tokens.shapes.compactCard)
                .clickable(onClick = onCancel)
                .padding(horizontal = tokens.spacing.cardPadding, vertical = NuvioTokens.Space.s6),
        )
    }
}

@Composable
private fun CompactPinKeypad(
    onDigit: (String) -> Unit,
    onBackspace: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("", "0", "⌫"),
    )

    Column(verticalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap)) {
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(tokens.spacing.controlGap, Alignment.CenterHorizontally),
            ) {
                row.forEach { key ->
                    when (key) {
                        "" -> Spacer(modifier = Modifier.size(tokens.components.avatarSize))
                        "⌫" -> {
                            Box(
                                modifier = Modifier
                                    .size(tokens.components.avatarSize)
                                    .clip(tokens.shapes.avatar)
                                    .background(tokens.colors.surfaceCard)
                                    .clickable(onClick = onBackspace),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.Backspace,
                                    contentDescription = stringResource(Res.string.pin_backspace),
                                    tint = tokens.colors.textPrimary,
                                    modifier = Modifier.size(tokens.icons.md),
                                )
                            }
                        }
                        else -> {
                            Box(
                                modifier = Modifier
                                    .size(tokens.components.avatarSize)
                                    .clip(tokens.shapes.avatar)
                                    .background(tokens.colors.surfaceCard)
                                    .clickable { onDigit(key) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = key,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = tokens.colors.textPrimary,
                                    fontWeight = FontWeight.Medium,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ActiveProfileMiniAvatar(
    profile: NuvioProfile?,
    avatars: List<AvatarCatalogItem>,
    selected: Boolean,
    size: Int = 24,
) {
    val tokens = MaterialTheme.nuvio
    if (profile == null) {
        Icon(
            imageVector = Icons.Rounded.Person,
            contentDescription = stringResource(Res.string.compose_nav_profile),
            modifier = Modifier.size(size.dp),
        )
        return
    }

    val avatarColor = remember(profile.avatarColorHex) { parseHexColor(profile.avatarColorHex) }
    val avatarItem = remember(profile.avatarId, avatars) {
        profile.avatarId?.let { id -> avatars.find { it.id == id } }
    }
    val avatarImageUrl = remember(profile.avatarUrl, avatarItem) {
        profileAvatarImageUrl(profile, avatarItem)
    }

    val borderColor = if (selected) {
        tokens.colors.borderSelected
    } else {
        avatarColor.copy(alpha = 0.5f)
    }

    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(tokens.shapes.avatar)
            .background(
                if (avatarImageUrl != null) {
                    avatarItem?.bgColor?.let { parseHexColor(it) } ?: avatarColor
                } else {
                    avatarColor.copy(alpha = 0.15f)
                },
            )
            .border(tokens.borders.thin + NuvioTokens.Space.hairline, borderColor, tokens.shapes.avatar),
        contentAlignment = Alignment.Center,
    ) {
        if (avatarImageUrl != null) {
            AsyncImage(
                model = avatarImageUrl,
                contentDescription = profile.name,
                modifier = Modifier.size(size.dp).clip(tokens.shapes.avatar),
                contentScale = ContentScale.Crop,
            )
        } else if (profile.name.isNotBlank()) {
            Text(
                text = profile.name.take(1).uppercase(),
                fontSize = (size * 0.45f).sp,
                color = avatarColor,
                fontWeight = FontWeight.Bold,
            )
        } else {
            Icon(
                imageVector = Icons.Rounded.Person,
                contentDescription = null,
                tint = avatarColor,
                modifier = Modifier.size((size * 0.6f).dp),
            )
        }
    }
}
