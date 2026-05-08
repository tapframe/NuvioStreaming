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
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
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
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource

@Composable
fun ProfileSwitcherTab(
    selected: Boolean,
    onClick: () -> Unit,
    onProfileSelected: (NuvioProfile) -> Unit,
    onAddProfileRequested: () -> Unit,
    triggerContent: (@Composable (selected: Boolean) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
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
            // Animate out
            launch { popupAlpha.animateTo(0f, tween(180, easing = FastOutSlowInEasing)) }
            launch { popupScale.animateTo(0.85f, tween(200, easing = FastOutSlowInEasing)) }
            launch {
                popupTranslateY.animateTo(30f, tween(200, easing = FastOutSlowInEasing))
                // Remove from composition after animation completes
                popupVisible = false
                pinProfile = null
            }
        }
    }

    Box(
        modifier = modifier
            .pointerInput(profiles) {
                detectTapGestures(
                    onTap = { onClick() },
                    onLongPress = {
                        if (profiles.isNotEmpty()) {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            showPopup = true
                        }
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
                offset = IntOffset(0, with(density) { -64.dp.roundToPx() }),
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
                        .shadow(16.dp, RoundedCornerShape(28.dp))
                        .background(
                            MaterialTheme.colorScheme.surfaceContainerHigh,
                            RoundedCornerShape(28.dp),
                        )
                        .padding(16.dp),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        // Profile avatars row
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            profiles.forEachIndexed { index, profile ->
                                val isActive =
                                    profile.profileIndex == activeProfile?.profileIndex
                                val isPinTarget =
                                    pinProfile?.profileIndex == profile.profileIndex

                                PopupProfileBubble(
                                    profile = profile,
                                    avatars = avatars,
                                    isActive = isActive,
                                    isSelected = isPinTarget,
                                    delayMs = index * 50,
                                    onClick = {
                                        if (profile.pinEnabled) {
                                            pinProfile = profile
                                        } else {
                                            onProfileSelected(profile)
                                            showPopup = false
                                        }
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
private fun PopupAddProfileBubble(
    delayMs: Int,
    onClick: () -> Unit,
) {
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
            .clip(RoundedCornerShape(16.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = stringResource(Res.string.compose_profile_add_profile),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(22.dp),
            )
        }

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = stringResource(Res.string.compose_profile_add_profile),
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
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
    onClick: () -> Unit,
) {
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
        targetValue = if (isSelected) 1.15f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow,
        ),
        label = "pressScale",
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .graphicsLayer {
                alpha = itemAlpha.value
                scaleX = itemScale.value * pressScale
                scaleY = itemScale.value * pressScale
            }
            .clip(RoundedCornerShape(16.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(4.dp),
    ) {
        Box(
            modifier = Modifier.size(52.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
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
                                2.5.dp,
                                MaterialTheme.colorScheme.primary,
                                CircleShape,
                            )
                            isActive -> Modifier.border(
                                2.dp,
                                avatarColor.copy(alpha = 0.6f),
                                CircleShape,
                            )
                            avatarImageUrl == null -> Modifier.border(
                                1.5.dp,
                                avatarColor.copy(alpha = 0.3f),
                                CircleShape,
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
                        modifier = Modifier.size(48.dp).clip(CircleShape),
                        contentScale = ContentScale.Crop,
                    )
                } else if (profile.name.isNotBlank()) {
                    Text(
                        text = profile.name.take(1).uppercase(),
                        style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp),
                        color = avatarColor,
                        fontWeight = FontWeight.Bold,
                    )
                } else {
                    Icon(
                        imageVector = Icons.Rounded.Person,
                        contentDescription = null,
                        tint = avatarColor,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }

            // Lock badge for PIN-protected profiles
            if (profile.pinEnabled) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(18.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .border(1.5.dp, MaterialTheme.colorScheme.surfaceContainerHigh, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(10.dp),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = profile.name.ifBlank {
                stringResource(Res.string.profile_label_number, profile.profileIndex)
            },
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
            color = if (isSelected) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = if (isActive || isSelected) FontWeight.Bold else FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(56.dp),
        )
    }
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
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var isVerifying by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(top = 16.dp),
    ) {
        Text(
            text = stringResource(Res.string.pin_enter_for, profileName),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(14.dp))

        // PIN dots with bounce animation
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
                    error != null -> MaterialTheme.colorScheme.error
                    filled -> MaterialTheme.colorScheme.primary
                    else -> MaterialTheme.colorScheme.outline
                }
                Box(
                    modifier = Modifier
                        .graphicsLayer {
                            scaleX = dotScale.value
                            scaleY = dotScale.value
                        }
                        .size(14.dp)
                        .clip(CircleShape)
                        .then(
                            if (filled) Modifier.background(dotColor)
                            else Modifier.border(2.dp, dotColor, CircleShape),
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
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

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

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = stringResource(Res.string.pin_cancel),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onCancel)
                .padding(horizontal = 16.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun CompactPinKeypad(
    onDigit: (String) -> Unit,
    onBackspace: () -> Unit,
) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("", "0", "⌫"),
    )

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            ) {
                row.forEach { key ->
                    when (key) {
                        "" -> Spacer(modifier = Modifier.size(48.dp))
                        "⌫" -> {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .clickable(onClick = onBackspace),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.Backspace,
                                    contentDescription = stringResource(Res.string.pin_backspace),
                                    tint = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                        else -> {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .clickable { onDigit(key) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = key,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
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
        MaterialTheme.colorScheme.primary
    } else {
        avatarColor.copy(alpha = 0.5f)
    }

    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(
                if (avatarImageUrl != null) {
                    avatarItem?.bgColor?.let { parseHexColor(it) } ?: avatarColor
                } else {
                    avatarColor.copy(alpha = 0.15f)
                },
            )
            .border(1.5.dp, borderColor, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (avatarImageUrl != null) {
            AsyncImage(
                model = avatarImageUrl,
                contentDescription = profile.name,
                modifier = Modifier.size(size.dp).clip(CircleShape),
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
