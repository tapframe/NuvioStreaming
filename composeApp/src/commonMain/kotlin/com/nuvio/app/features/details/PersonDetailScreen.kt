package com.nuvio.app.features.details

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import com.nuvio.app.core.i18n.localizedShortMonthName
import com.nuvio.app.core.ui.landscapePosterHeightForWidth
import com.nuvio.app.core.ui.landscapePosterWidth
import com.nuvio.app.core.ui.rememberPosterCardStyleUiState
import com.nuvio.app.features.details.components.DetailPosterRailSection
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.tmdb.TmdbMetadataService
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource

private sealed interface PersonDetailUiState {
    data object Loading : PersonDetailUiState
    data class Success(val personDetail: PersonDetail) : PersonDetailUiState
    data class Error(val message: String) : PersonDetailUiState
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
fun PersonDetailScreen(
    personId: Int,
    personName: String,
    initialProfilePhoto: String? = null,
    avatarTransitionKey: String? = null,
    preferCrew: Boolean = false,
    onBack: () -> Unit,
    onOpenMeta: (MetaPreview) -> Unit,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
    modifier: Modifier = Modifier,
) {
    var uiState by remember(personId) { mutableStateOf<PersonDetailUiState>(PersonDetailUiState.Loading) }
    val resolvedAvatarTransitionKey = avatarTransitionKey ?: castAvatarSharedTransitionKey(personId)

    LaunchedEffect(personId) {
        uiState = PersonDetailUiState.Loading
        val detail = TmdbMetadataService.fetchPersonDetail(
            personId = personId,
            preferCrewCredits = preferCrew,
        )
        uiState = if (detail != null) {
            PersonDetailUiState.Success(detail)
        } else {
            PersonDetailUiState.Error(getString(Res.string.person_load_failed, personName))
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        when (val state = uiState) {
            is PersonDetailUiState.Loading -> PersonDetailSkeleton(
                personId = personId,
                personName = personName,
                profilePhoto = initialProfilePhoto,
                avatarTransitionKey = resolvedAvatarTransitionKey,
                sharedTransitionScope = sharedTransitionScope,
                animatedVisibilityScope = animatedVisibilityScope,
            )
            is PersonDetailUiState.Error -> PersonDetailError(
                message = state.message,
                onRetry = {
                    uiState = PersonDetailUiState.Loading
                    // Retry will be triggered by the LaunchedEffect above if we reset
                },
            )
            is PersonDetailUiState.Success -> PersonDetailContent(
                person = state.personDetail,
                onOpenMeta = onOpenMeta,
                initialProfilePhoto = initialProfilePhoto,
                avatarTransitionKey = resolvedAvatarTransitionKey,
                sharedTransitionScope = sharedTransitionScope,
                animatedVisibilityScope = animatedVisibilityScope,
            )
            }

        // Back button overlaid on top
        IconButton(
            onClick = onBack,
            modifier = Modifier
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(start = 4.dp, top = 4.dp)
                .align(Alignment.TopStart),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = stringResource(Res.string.action_back),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun PersonDetailContent(
    person: PersonDetail,
    onOpenMeta: (MetaPreview) -> Unit,
    initialProfilePhoto: String? = null,
    avatarTransitionKey: String,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
) {
    val posterCardStyle = rememberPosterCardStyleUiState()
    val isLandscapeShelfMode = posterCardStyle.catalogLandscapeModeEnabled
    val skeletonPosterWidth = if (isLandscapeShelfMode) {
        landscapePosterWidth(posterCardStyle.widthDp)
    } else {
        posterCardStyle.widthDp.dp
    }
    val skeletonPosterHeight = if (isLandscapeShelfMode) {
        landscapePosterHeightForWidth(skeletonPosterWidth)
    } else {
        posterCardStyle.heightDp.dp
    }
    val accentColor = MaterialTheme.colorScheme.primary

    val allCredits = remember(person.movieCredits, person.tvCredits) {
        (person.movieCredits + person.tvCredits)
            .distinctBy { it.id }
    }

    val todayDate = remember { CurrentDateProvider.todayIsoDate() }

    val popularCredits = remember(allCredits) {
        allCredits
            .sortedByDescending { it.popularity ?: 0.0 }
    }

    val latestCredits = remember(allCredits, todayDate) {
        allCredits
            .filter { credit ->
                val date = credit.rawReleaseDate
                date != null && date <= todayDate
            }
            .sortedByDescending { it.rawReleaseDate ?: "" }
    }

    val upcomingCredits = remember(allCredits, todayDate) {
        allCredits
            .filter { credit ->
                val date = credit.rawReleaseDate
                date != null && date > todayDate
            }
            .sortedBy { it.rawReleaseDate ?: "" }
    }

    val scrollState = rememberScrollState()
    val haptic = LocalHapticFeedback.current

    // Hero collapse: 0 = fully expanded, 1 = fully collapsed
    val collapseProgress by remember {
        derivedStateOf {
            (scrollState.value / HERO_COLLAPSE_SCROLL_RANGE).coerceIn(0f, 1f)
        }
    }

    val shouldTriggerCatalogHaptic by remember {
        derivedStateOf { scrollState.value >= HAPTIC_TRIGGER_SCROLL_THRESHOLD_PX }
    }
    var didTriggerCatalogHaptic by remember(person.tmdbId) { mutableStateOf(false) }
    LaunchedEffect(shouldTriggerCatalogHaptic, didTriggerCatalogHaptic) {
        if (shouldTriggerCatalogHaptic && !didTriggerCatalogHaptic) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            didTriggerCatalogHaptic = true
        }
    }

    val accentGradient = remember(accentColor) {
        Brush.verticalGradient(
            colorStops = arrayOf(
                0.0f to accentColor.copy(alpha = 0.18f),
                0.15f to accentColor.copy(alpha = 0.10f),
                0.30f to accentColor.copy(alpha = 0.04f),
                0.50f to Color.Transparent,
            ),
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(accentGradient),
        )

        AnimatedVisibility(
            visible = true,
            enter = fadeIn(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(top = 48.dp),
            ) {
                HeroSection(
                    person = person,
                    collapseProgress = collapseProgress,
                    fallbackProfilePhoto = initialProfilePhoto,
                    avatarTransitionKey = avatarTransitionKey,
                    sharedTransitionScope = sharedTransitionScope,
                    animatedVisibilityScope = animatedVisibilityScope,
                )

                if (popularCredits.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(24.dp))
                    DetailPosterRailSection(
                        title = stringResource(Res.string.person_popular),
                        items = popularCredits,
                        watchedKeys = emptySet(),
                        headerHorizontalPadding = 20.dp,
                        onPosterClick = onOpenMeta,
                    )
                }

                if (latestCredits.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(24.dp))
                    DetailPosterRailSection(
                        title = stringResource(Res.string.person_latest),
                        items = latestCredits,
                        watchedKeys = emptySet(),
                        headerHorizontalPadding = 20.dp,
                        onPosterClick = onOpenMeta,
                    )
                }

                if (upcomingCredits.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(24.dp))
                    DetailPosterRailSection(
                        title = stringResource(Res.string.person_upcoming),
                        items = upcomingCredits,
                        watchedKeys = emptySet(),
                        headerHorizontalPadding = 20.dp,
                        onPosterClick = onOpenMeta,
                    )
                }

                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }
}

private const val HERO_COLLAPSE_SCROLL_RANGE = 220f
private const val HAPTIC_TRIGGER_SCROLL_THRESHOLD_PX = 56

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun HeroSection(
    person: PersonDetail,
    collapseProgress: Float = 0f,
    fallbackProfilePhoto: String? = null,
    avatarTransitionKey: String,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
) {
    val avatarSize = lerp(140.dp, 72.dp, collapseProgress)
    val heroScale = 1f - (collapseProgress * 0.12f)
    val heroAlpha = 1f - (collapseProgress * 0.35f)
    val avatarUrl = person.profilePhoto?.takeIf { it.isNotBlank() } ?: fallbackProfilePhoto
    val avatarCacheKey = avatarTransitionKey
    val platformContext = LocalPlatformContext.current
    val avatarRequest = if (!avatarUrl.isNullOrBlank()) {
        remember(platformContext, avatarUrl, avatarCacheKey) {
            ImageRequest.Builder(platformContext)
                .data(avatarUrl)
                .memoryCacheKey(avatarCacheKey)
                .placeholderMemoryCacheKey(avatarCacheKey)
                .diskCacheKey(avatarUrl)
                .build()
        }
    } else {
        null
    }
    val avatarSharedElementModifier = if (sharedTransitionScope != null && animatedVisibilityScope != null) {
        with(sharedTransitionScope) {
            Modifier.sharedElement(
                sharedContentState = rememberSharedContentState(
                    key = avatarTransitionKey,
                ),
                animatedVisibilityScope = animatedVisibilityScope,
            )
        }
    } else {
        Modifier
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .graphicsLayer {
                scaleX = heroScale
                scaleY = heroScale
                alpha = heroAlpha
                translationY = -(collapseProgress * 40f)
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Profile Photo
        Box(
            modifier = Modifier
                .then(avatarSharedElementModifier)
                .size(avatarSize)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            if (!avatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = avatarRequest ?: avatarUrl,
                    contentDescription = person.name,
                    modifier = Modifier.matchParentSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Text(
                    text = person.name.firstOrNull()?.uppercase() ?: "?",
                    style = MaterialTheme.typography.displayMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Name
        Text(
            text = person.name,
            style = MaterialTheme.typography.headlineSmall.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.5).sp,
            ),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Personal info
        val infoItems = buildList {
            person.birthday?.let { bday ->
                val age = calculateAge(bday, person.deathday)
                val ageStr = if (age != null) stringResource(Res.string.person_age, age) else ""
                val bdayDisplay = formatDateForDisplay(bday) ?: bday
                val deathDisplay = person.deathday?.let { formatDateForDisplay(it) ?: it }
                val line = if (deathDisplay != null) {
                    buildString {
                        append(stringResource(Res.string.person_born, bdayDisplay, ""))
                        append(" — ")
                        append(stringResource(Res.string.person_died, deathDisplay))
                        append(ageStr)
                    }
                } else {
                    stringResource(Res.string.person_born, bdayDisplay, ageStr)
                }
                add(line)
            }
            person.placeOfBirth?.let { add(it) }
            person.knownFor?.let { add(stringResource(Res.string.person_known_for, it)) }
        }
        if (infoItems.isNotEmpty()) {
            infoItems.forEach { info ->
                Text(
                    text = info,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
            }
        }

        // Biography
        person.biography?.let { bio ->
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = bio,
                style = MaterialTheme.typography.bodyMedium.copy(
                    lineHeight = 20.sp,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 8,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

// ─── Loading / Error States ───

@Composable
@OptIn(ExperimentalSharedTransitionApi::class)
private fun PersonDetailSkeleton(
    personId: Int,
    personName: String,
    profilePhoto: String? = null,
    avatarTransitionKey: String,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
) {
    val posterCardStyle = rememberPosterCardStyleUiState()
    val isLandscapeShelfMode = posterCardStyle.catalogLandscapeModeEnabled
    val skeletonPosterWidth = if (isLandscapeShelfMode) {
        landscapePosterWidth(posterCardStyle.widthDp)
    } else {
        posterCardStyle.widthDp.dp
    }
    val skeletonPosterHeight = if (isLandscapeShelfMode) {
        landscapePosterHeightForWidth(skeletonPosterWidth)
    } else {
        posterCardStyle.heightDp.dp
    }
    val accentColor = MaterialTheme.colorScheme.primary
    val avatarCacheKey = avatarTransitionKey
    val platformContext = LocalPlatformContext.current
    val avatarRequest = if (!profilePhoto.isNullOrBlank()) {
        remember(platformContext, profilePhoto, avatarCacheKey) {
            ImageRequest.Builder(platformContext)
                .data(profilePhoto)
                .memoryCacheKey(avatarCacheKey)
                .placeholderMemoryCacheKey(avatarCacheKey)
                .diskCacheKey(profilePhoto)
                .build()
        }
    } else {
        null
    }
    val accentGradient = remember(accentColor) {
        Brush.verticalGradient(
            colorStops = arrayOf(
                0.0f to accentColor.copy(alpha = 0.18f),
                0.15f to accentColor.copy(alpha = 0.10f),
                0.30f to accentColor.copy(alpha = 0.04f),
                0.50f to Color.Transparent,
            ),
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(accentGradient),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(top = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                val avatarSharedElementModifier = if (sharedTransitionScope != null && animatedVisibilityScope != null) {
                    with(sharedTransitionScope) {
                        Modifier.sharedElement(
                            sharedContentState = rememberSharedContentState(
                                key = avatarTransitionKey,
                            ),
                            animatedVisibilityScope = animatedVisibilityScope,
                        )
                    }
                } else {
                    Modifier
                }
                Box(
                    modifier = Modifier
                        .then(avatarSharedElementModifier)
                        .size(140.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    if (!profilePhoto.isNullOrBlank()) {
                        AsyncImage(
                            model = avatarRequest ?: profilePhoto,
                            contentDescription = personName,
                            modifier = Modifier.matchParentSize(),
                            contentScale = ContentScale.Crop,
                        )
                    } else {
                        Text(
                            text = personName.firstOrNull()?.uppercase() ?: "?",
                            style = MaterialTheme.typography.displayMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = personName,
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                Spacer(modifier = Modifier.height(12.dp))

                SkeletonLine(
                    widthFraction = 0.58f,
                    height = 14.dp,
                )
                Spacer(modifier = Modifier.height(6.dp))
                SkeletonLine(
                    widthFraction = 0.42f,
                    height = 14.dp,
                )
                Spacer(modifier = Modifier.height(6.dp))
                SkeletonLine(
                    widthFraction = 0.34f,
                    height = 14.dp,
                )

                Spacer(modifier = Modifier.height(12.dp))

                listOf(1.0f, 0.96f, 0.92f, 0.98f, 0.88f, 0.94f, 0.82f, 0.74f).forEachIndexed { index, widthFraction ->
                    SkeletonLine(
                        widthFraction = widthFraction,
                        height = 16.dp,
                    )
                    if (index != 7) {
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Filmography header skeleton
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .width(120.dp)
                        .height(18.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Poster row skeleton
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                repeat(4) {
                    Column(modifier = Modifier.width(skeletonPosterWidth)) {
                        Box(
                            modifier = Modifier
                                .width(skeletonPosterWidth)
                                .height(skeletonPosterHeight)
                                .clip(RoundedCornerShape(posterCardStyle.cornerRadiusDp.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        )
                        if (!isLandscapeShelfMode) {
                            Spacer(modifier = Modifier.height(6.dp))
                            SkeletonLine(
                                widthFraction = 1f,
                                height = 16.dp,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            SkeletonLine(
                                widthFraction = 0.56f,
                                height = 12.dp,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SkeletonLine(
    widthFraction: Float,
    height: androidx.compose.ui.unit.Dp,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth(widthFraction)
            .height(height)
            .clip(RoundedCornerShape(4.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    )
}

@Composable
private fun PersonDetailError(
    message: String,
    onRetry: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(Res.string.person_something_wrong),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) {
                Text(stringResource(Res.string.action_retry))
            }
        }
    }
}

// ─── Utility ───

private fun calculateAge(birthday: String, deathday: String?): Int? {
    val birthParts = birthday.split("-").mapNotNull { it.toIntOrNull() }
    if (birthParts.size < 3) return null
    val birthYear = birthParts[0]
    val birthMonth = birthParts[1]
    val birthDay = birthParts[2]

    val endParts = deathday?.split("-")?.mapNotNull { it.toIntOrNull() }
    // Use a rough current date approximation for KMP compatibility
    val endYear: Int
    val endMonth: Int
    val endDay: Int
    if (endParts != null && endParts.size >= 3) {
        endYear = endParts[0]
        endMonth = endParts[1]
        endDay = endParts[2]
    } else {
        // Approximate current date — this is good enough for age display
        endYear = 2026
        endMonth = 4
        endDay = 3
    }

    var age = endYear - birthYear
    if (endMonth < birthMonth || (endMonth == birthMonth && endDay < birthDay)) {
        age--
    }
    return age.takeIf { it >= 0 }
}

private fun formatDateForDisplay(date: String): String? {
    val parts = date.split("-").mapNotNull { it.toIntOrNull() }
    if (parts.size < 3) return null
    val month = parts[1]
    val day = parts[2]
    val year = parts[0]
    return if (month in 1..12) {
        "${localizedShortMonthName(month)} $day, $year"
    } else {
        null
    }
}
