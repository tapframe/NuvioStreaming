package com.nuvio.app.features.settings

import co.touchlab.kermit.Logger
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CollectionsBookmark
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.NuvioPrimaryButton
import com.nuvio.app.core.ui.NuvioSurfaceCard
import com.nuvio.app.core.ui.NuvioModalBottomSheet
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.core.ui.NuvioAsyncImage
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.library.LibraryItem
import com.nuvio.app.features.library.LibraryRepository
import com.nuvio.app.features.library.LibraryUiState
import com.nuvio.app.features.profiles.AvatarCatalogItem
import com.nuvio.app.features.profiles.AvatarRepository
import com.nuvio.app.features.profiles.NuvioProfile
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.profiles.parseHexColor
import com.nuvio.app.features.profiles.profileAvatarImageUrl
import com.nuvio.app.features.watched.WatchedClock
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watched.WatchedUiState
import com.nuvio.app.features.watched.watchedItemKey
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import com.nuvio.app.features.watchprogress.WatchProgressUiState
import kotlin.math.roundToInt
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

private val profileInsightsLog = Logger.withTag("ProfileInsights")

internal fun LazyListScope.profileInsightsContent(
    isTablet: Boolean,
    onSwitchProfile: (() -> Unit)?,
    onEditProfile: (() -> Unit)?,
) {
    item {
        ProfileInsightsBody(
            isTablet = isTablet,
            onSwitchProfile = onSwitchProfile,
            onEditProfile = onEditProfile,
        )
    }
}

@Composable
private fun ProfileInsightsBody(
    isTablet: Boolean,
    onSwitchProfile: (() -> Unit)?,
    onEditProfile: (() -> Unit)?,
) {
    val profileState by ProfileRepository.state.collectAsStateWithLifecycle()
    val avatars by AvatarRepository.avatars.collectAsStateWithLifecycle()
    val watchProgressState by remember {
        WatchProgressRepository.ensureLoaded()
        WatchProgressRepository.uiState
    }.collectAsStateWithLifecycle()
    val watchedState by remember {
        WatchedRepository.ensureLoaded()
        WatchedRepository.uiState
    }.collectAsStateWithLifecycle()
    val fullyWatchedSeriesKeys by WatchedRepository.fullyWatchedSeriesKeys.collectAsStateWithLifecycle()
    val libraryState by remember {
        LibraryRepository.ensureLoaded()
        LibraryRepository.uiState
    }.collectAsStateWithLifecycle()
    val todayIsoDate = remember { CurrentDateProvider.todayIsoDate() }

    LaunchedEffect(Unit) {
        AvatarRepository.fetchAvatars()
    }

    val activeProfile = profileState.activeProfile
    val activeProfileIndex = activeProfile?.profileIndex ?: ProfileRepository.activeProfileId
    val avatarItem = remember(activeProfile?.avatarId, avatars) {
        activeProfile
            ?.avatarId
            ?.let { avatarId -> avatars.firstOrNull { avatar -> avatar.id == avatarId } }
    }
    val profileNameFallback = stringResource(Res.string.compose_nav_profile)
    val profileName = activeProfile
        ?.name
        ?.trim()
        ?.takeIf { it.isNotBlank() }
        ?: profileNameFallback
    val stats = remember(activeProfileIndex, watchProgressState, watchedState, fullyWatchedSeriesKeys, libraryState, todayIsoDate) {
        runCatching {
            buildProfileInsightsStats(
                watchProgressState = watchProgressState,
                watchedState = watchedState,
                fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
                libraryState = libraryState,
                todayIsoDate = todayIsoDate,
            )
        }.onFailure { error ->
            profileInsightsLog.e(error) { "Failed to build profile insights stats profile=$activeProfileIndex" }
        }.getOrElse {
            emptyProfileInsightsStats()
        }
    }
    val continueTitle = stringResource(Res.string.profile_insights_stat_continue)
    val completedTitle = stringResource(Res.string.profile_insights_stat_completed)
    val ongoingTitle = stringResource(Res.string.profile_insights_stat_ongoing)
    val libraryTitle = stringResource(Res.string.profile_insights_stat_library)
    val upcomingTitle = stringResource(Res.string.profile_insights_stat_upcoming)
    val insightCollections = remember(
        activeProfileIndex,
        watchProgressState,
        watchedState,
        fullyWatchedSeriesKeys,
        libraryState,
        todayIsoDate,
        continueTitle,
        completedTitle,
        ongoingTitle,
        libraryTitle,
        upcomingTitle,
    ) {
        runCatching {
            buildProfileInsightCollections(
                watchProgressState = watchProgressState,
                watchedState = watchedState,
                fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
                libraryState = libraryState,
                todayIsoDate = todayIsoDate,
                continueTitle = continueTitle,
                completedTitle = completedTitle,
                ongoingTitle = ongoingTitle,
                libraryTitle = libraryTitle,
                upcomingTitle = upcomingTitle,
            )
        }.onFailure { error ->
            profileInsightsLog.e(error) { "Failed to build profile insight collections profile=$activeProfileIndex" }
        }.getOrElse {
            emptyProfileInsightCollections(
                continueTitle = continueTitle,
                completedTitle = completedTitle,
                ongoingTitle = ongoingTitle,
                libraryTitle = libraryTitle,
                upcomingTitle = upcomingTitle,
            )
        }
    }
    var selectedInsightCollection by remember { mutableStateOf<ProfileInsightCollection?>(null) }
    LaunchedEffect(activeProfileIndex) {
        selectedInsightCollection = null
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(if (isTablet) 18.dp else 14.dp),
    ) {
        if (onSwitchProfile != null || onEditProfile != null) {
            ProfileManagementActions(
                isTablet = isTablet,
                onSwitchProfile = onSwitchProfile,
                onEditProfile = onEditProfile,
            )
        }
        ProfileInsightsHero(
            profile = activeProfile,
            avatarItem = avatarItem,
            profileName = profileName,
            stats = stats,
            isTablet = isTablet,
        )
        SettingsSection(
            title = stringResource(Res.string.profile_insights_section_overview),
            isTablet = isTablet,
        ) {
            ProfileInsightsStatsGrid(
                stats = stats,
                isTablet = isTablet,
                isCollectionAvailable = { kind ->
                    insightCollections[kind]?.items?.isNotEmpty() == true
                },
                onCollectionClick = { kind ->
                    selectedInsightCollection = insightCollections[kind]
                        ?.takeIf { collection -> collection.items.isNotEmpty() }
                },
            )
        }
        SettingsSection(
            title = stringResource(Res.string.profile_insights_section_taste),
            isTablet = isTablet,
        ) {
            ProfileTasteCard(stats = stats)
        }
    }

    selectedInsightCollection?.let { collection ->
        ProfileInsightCollectionSheet(
            collection = collection,
            isTablet = isTablet,
            onDismiss = { selectedInsightCollection = null },
        )
    }

}

@Composable
private fun ProfileManagementActions(
    isTablet: Boolean,
    onSwitchProfile: (() -> Unit)?,
    onEditProfile: (() -> Unit)?,
) {
    val tokens = MaterialTheme.nuvio
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = tokens.spacing.controlGap),
        horizontalArrangement = Arrangement.spacedBy(if (isTablet) 14.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onSwitchProfile != null) {
            NuvioPrimaryButton(
                text = stringResource(Res.string.profile_insights_switch_profile),
                onClick = onSwitchProfile,
                modifier = Modifier.weight(1f),
            )
        }
        if (onEditProfile != null) {
            OutlinedButton(
                onClick = onEditProfile,
                modifier = Modifier
                    .weight(1f)
                    .height(54.dp),
                shape = tokens.shapes.button,
                border = BorderStroke(1.dp, tokens.colors.borderSubtle),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = tokens.colors.textPrimary,
                ),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Edit,
                    contentDescription = null,
                    tint = tokens.colors.accent,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stringResource(Res.string.profile_insights_edit_profile),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun ProfileInsightsHero(
    profile: NuvioProfile?,
    avatarItem: AvatarCatalogItem?,
    profileName: String,
    stats: ProfileInsightsStats,
    isTablet: Boolean,
) {
    val tokens = MaterialTheme.nuvio
    val accent = profile?.avatarColorHex?.let(::parseHexColor) ?: tokens.colors.accent
    val avatarImageUrl = remember(profile, avatarItem) {
        profile?.let { profileAvatarImageUrl(it, avatarItem) }
    }
    val shape = RoundedCornerShape(if (isTablet) 34.dp else 28.dp)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        Color(0xFF0E1727),
                        accent.copy(alpha = 0.42f),
                        tokens.colors.surface,
                    ),
                ),
            )
            .border(1.dp, Color.White.copy(alpha = 0.12f), shape),
    ) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            accent.copy(alpha = 0.34f),
                            Color.Transparent,
                        ),
                        radius = 760f,
                    ),
                ),
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Black.copy(alpha = 0.04f),
                            Color.Black.copy(alpha = 0.56f),
                        ),
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(if (isTablet) 24.dp else 18.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ProfileHeroAvatar(
                    profileName = profileName,
                    avatarImageUrl = avatarImageUrl,
                    avatarColor = accent,
                    avatarBackgroundColor = avatarItem?.bgColor?.let(::parseHexColor) ?: accent,
                    isTablet = isTablet,
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = stringResource(Res.string.profile_insights_title, profileName),
                        style = if (isTablet) {
                            MaterialTheme.typography.headlineMedium
                        } else {
                            MaterialTheme.typography.headlineSmall
                        },
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(Res.string.profile_insights_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.74f),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ProfileHeroMetric(
                    value = stats.continueCount.toString(),
                    label = stringResource(Res.string.profile_insights_stat_continue),
                    modifier = Modifier.weight(1f),
                )
                ProfileHeroMetric(
                    value = stats.libraryCount.toString(),
                    label = stringResource(Res.string.profile_insights_stat_library),
                    modifier = Modifier.weight(1f),
                )
                ProfileHeroMetric(
                    value = stats.upcomingCount.toString(),
                    label = stringResource(Res.string.profile_insights_stat_upcoming),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ProfileHeroAvatar(
    profileName: String,
    avatarImageUrl: String?,
    avatarColor: Color,
    avatarBackgroundColor: Color,
    isTablet: Boolean,
) {
    val size = if (isTablet) 92.dp else 78.dp
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(
                if (avatarImageUrl.isNullOrBlank()) {
                    avatarColor.copy(alpha = 0.18f)
                } else {
                    avatarBackgroundColor
                },
            )
            .border(1.5.dp, Color.White.copy(alpha = 0.28f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (!avatarImageUrl.isNullOrBlank()) {
            NuvioAsyncImage(
                imageUrl = avatarImageUrl,
                contentDescription = profileName,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
                animateIfPossible = true,
            )
        } else {
            Text(
                text = profileName.take(1).uppercase(),
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun ProfileHeroMetric(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White.copy(alpha = 0.10f))
            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(18.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White.copy(alpha = 0.70f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ProfileInsightsStatsGrid(
    stats: ProfileInsightsStats,
    isTablet: Boolean,
    isCollectionAvailable: (ProfileInsightCollectionKind) -> Boolean,
    onCollectionClick: (ProfileInsightCollectionKind) -> Unit,
) {
    val tiles = listOf(
        ProfileInsightTile(
            icon = Icons.Rounded.PlayArrow,
            value = stats.continueCount.toString(),
            label = stringResource(Res.string.profile_insights_stat_continue),
            caption = stringResource(Res.string.profile_insights_stat_continue_caption),
            collectionKind = ProfileInsightCollectionKind.Continue,
        ),
        ProfileInsightTile(
            icon = Icons.Rounded.CollectionsBookmark,
            value = stats.upcomingCount.toString(),
            label = stringResource(Res.string.profile_insights_stat_upcoming),
            caption = stringResource(Res.string.profile_insights_stat_upcoming_caption),
            collectionKind = ProfileInsightCollectionKind.Upcoming,
        ),
        ProfileInsightTile(
            icon = Icons.Rounded.Favorite,
            value = stats.completedCount.toString(),
            label = stringResource(Res.string.profile_insights_stat_completed),
            caption = stringResource(Res.string.profile_insights_stat_completed_caption),
            collectionKind = ProfileInsightCollectionKind.Completed,
        ),
        ProfileInsightTile(
            icon = Icons.Rounded.Sync,
            value = stats.ongoingSeriesCount.toString(),
            label = stringResource(Res.string.profile_insights_stat_ongoing),
            caption = stringResource(Res.string.profile_insights_stat_ongoing_caption),
            collectionKind = ProfileInsightCollectionKind.Ongoing,
        ),
        ProfileInsightTile(
            icon = Icons.Rounded.CollectionsBookmark,
            value = stats.libraryCount.toString(),
            label = stringResource(Res.string.profile_insights_stat_library),
            caption = stringResource(Res.string.profile_insights_stat_library_caption),
            collectionKind = ProfileInsightCollectionKind.Library,
        ),
        ProfileInsightTile(
            icon = Icons.Rounded.AutoAwesome,
            value = profileInsightDurationLabel(stats.trackedDurationMs),
            label = stringResource(Res.string.profile_insights_stat_time),
            caption = stringResource(Res.string.profile_insights_stat_time_caption),
        ),
    )
    val columns = if (isTablet) 3 else 2

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        tiles.chunked(columns).forEach { rowTiles ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                rowTiles.forEach { tile ->
                    ProfileInsightStatCard(
                        tile = tile,
                        onClick = tile.collectionKind
                            ?.takeIf(isCollectionAvailable)
                            ?.let { kind -> { onCollectionClick(kind) } },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(columns - rowTiles.size) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun ProfileInsightStatCard(
    tile: ProfileInsightTile,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    Surface(
        modifier = modifier
            .heightIn(min = 116.dp)
            .then(
                if (onClick != null) {
                    Modifier.clickable(onClick = onClick)
                } else {
                    Modifier
                },
            ),
        color = tokens.colors.surface,
        shape = RoundedCornerShape(22.dp),
        border = BorderStroke(1.dp, tokens.colors.borderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = tile.value,
                    style = MaterialTheme.typography.titleLarge,
                    color = tokens.colors.textPrimary,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
                Surface(
                    modifier = Modifier.size(34.dp),
                    color = tokens.colors.accent.copy(alpha = tokens.opacity.pressed),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = tile.icon,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = tokens.colors.accent,
                        )
                    }
                }
            }
            Text(
                text = tile.label,
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.colors.textPrimary,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = tile.caption,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.colors.textMuted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileInsightCollectionSheet(
    collection: ProfileInsightCollection,
    isTablet: Boolean,
    onDismiss: () -> Unit,
) {
    val tokens = MaterialTheme.nuvio
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    NuvioModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = if (isTablet) 24.dp else 18.dp)
                .padding(bottom = 22.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = collection.title,
                    style = MaterialTheme.typography.titleLarge,
                    color = tokens.colors.textPrimary,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(Res.string.profile_insights_collection_count, collection.items.size),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.colors.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            LazyVerticalGrid(
                columns = GridCells.Adaptive(if (isTablet) 132.dp else 104.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = if (isTablet) 640.dp else 520.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                items(
                    items = collection.items,
                    key = { item -> item.id },
                ) { item ->
                    ProfileInsightPosterTile(item = item)
                }
            }
        }
    }
}

@Composable
private fun ProfileInsightPosterTile(
    item: ProfileInsightPosterItem,
) {
    val tokens = MaterialTheme.nuvio
    val initialImageUrl = remember(item.id, item.imageUrl) {
        item.imageUrl?.trim()?.takeIf { it.isNotBlank() }
    }
    val cachedImageUrl = remember(item.id, item.lookupType, item.lookupId, initialImageUrl) {
        initialImageUrl ?: profileCachedArtworkUrl(item.lookupType, item.lookupId)
    }
    var resolvedImageUrl by remember(item.id, cachedImageUrl) {
        mutableStateOf(cachedImageUrl)
    }

    LaunchedEffect(item.id, item.lookupType, item.lookupId, cachedImageUrl) {
        resolvedImageUrl = cachedImageUrl
        if (cachedImageUrl != null) return@LaunchedEffect
        resolvedImageUrl = profileFetchArtworkUrl(item.lookupType, item.lookupId)
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(15.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .border(1.dp, tokens.colors.borderSubtle, RoundedCornerShape(15.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (resolvedImageUrl != null) {
                NuvioAsyncImage(
                    imageUrl = resolvedImageUrl.orEmpty(),
                    contentDescription = item.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                    animateIfPossible = true,
                )
            } else {
                Text(
                    text = item.title.take(1).uppercase(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = tokens.colors.textMuted,
                    fontWeight = FontWeight.Black,
                )
            }
        }
        Text(
            text = item.title,
            style = MaterialTheme.typography.labelLarge,
            color = tokens.colors.textPrimary,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        item.subtitle?.let { subtitle ->
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.colors.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ProfileTasteCard(stats: ProfileInsightsStats) {
    val tokens = MaterialTheme.nuvio
    val fallbackType = when (stats.topType) {
        "movie" -> stringResource(Res.string.profile_insights_type_movie)
        "series" -> stringResource(Res.string.profile_insights_type_series)
        null -> null
        else -> stats.topType.fallbackDisplayLabel()
    }
    val topSignal = stats.topGenre ?: fallbackType ?: stringResource(Res.string.profile_insights_taste_empty)

    NuvioSurfaceCard {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    modifier = Modifier.size(52.dp),
                    color = tokens.colors.accent.copy(alpha = tokens.opacity.pressed),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Rounded.AutoAwesome,
                            contentDescription = null,
                            tint = tokens.colors.accent,
                        )
                    }
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Text(
                        text = stringResource(Res.string.profile_insights_taste_dna_title),
                        style = MaterialTheme.typography.labelMedium,
                        color = tokens.colors.textMuted,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = topSignal,
                        style = MaterialTheme.typography.titleLarge,
                        color = tokens.colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(Res.string.profile_insights_taste_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.colors.textMuted,
                    )
                }
            }
            if (stats.tasteSegments.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    stats.tasteSegments.forEach { segment ->
                        ProfileTasteSegmentRow(segment = segment)
                    }
                }
            }
            ProfileTasteBalanceBar(stats = stats)
            if (stats.dnaChips.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    stats.dnaChips.chunked(2).forEach { rowChips ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            rowChips.forEach { chip ->
                                ProfileTasteDnaChip(
                                    text = chip.localizedLabel(),
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            repeat(2 - rowChips.size) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileTasteSegmentRow(segment: ProfileTasteSegment) {
    val tokens = MaterialTheme.nuvio
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = segment.label,
                style = MaterialTheme.typography.labelMedium,
                color = tokens.colors.textPrimary,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${(segment.share * 100f).roundToInt().coerceIn(1, 100)}%",
                style = MaterialTheme.typography.labelSmall,
                color = tokens.colors.textMuted,
                maxLines = 1,
            )
        }
        LinearProgressIndicator(
            progress = { segment.share.coerceIn(0f, 1f) },
            modifier = Modifier
                .fillMaxWidth()
                .height(5.dp)
                .clip(RoundedCornerShape(999.dp)),
            color = tokens.colors.accent,
            trackColor = tokens.colors.borderSubtle,
        )
    }
}

@Composable
private fun ProfileTasteBalanceBar(stats: ProfileInsightsStats) {
    val tokens = MaterialTheme.nuvio
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(Res.string.profile_insights_taste_balance_title),
                style = MaterialTheme.typography.labelMedium,
                color = tokens.colors.textPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stats.typeBalanceLabel.localizedLabel(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.colors.textMuted,
                maxLines = 1,
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(tokens.colors.borderSubtle),
        ) {
            val movieLeaning = stats.movieShare >= 0.5f
            Box(
                modifier = Modifier
                    .weight(stats.movieShare.coerceIn(0.05f, 0.95f))
                    .fillMaxSize()
                    .background(
                        if (movieLeaning) {
                            tokens.colors.accent
                        } else {
                            tokens.colors.textMuted.copy(alpha = 0.42f)
                        },
                    ),
            )
            Box(
                modifier = Modifier
                    .weight((1f - stats.movieShare).coerceIn(0.05f, 0.95f))
                    .fillMaxSize()
                    .background(
                        if (movieLeaning) {
                            tokens.colors.textMuted.copy(alpha = 0.42f)
                        } else {
                            tokens.colors.accent
                        },
                    ),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(Res.string.profile_insights_type_movie),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.colors.textMuted,
            )
            Text(
                text = stringResource(Res.string.profile_insights_type_series),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.colors.textMuted,
            )
        }
    }
}

@Composable
private fun ProfileTasteDnaChip(
    text: String,
    modifier: Modifier = Modifier,
) {
    val tokens = MaterialTheme.nuvio
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(tokens.colors.accent.copy(alpha = tokens.opacity.pressed))
            .border(1.dp, tokens.colors.accent.copy(alpha = 0.22f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.AutoAwesome,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = tokens.colors.accent,
        )
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = tokens.colors.textPrimary,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun profileInsightDurationLabel(durationMs: Long): String {
    val minutes = (durationMs / ProfileInsightsMinuteMs).coerceAtLeast(0L)
    return if (minutes >= 60L) {
        stringResource(Res.string.profile_insights_hours, ((minutes + 30L) / 60L).toInt())
    } else {
        stringResource(Res.string.profile_insights_minutes, minutes.toInt())
    }
}

private fun buildProfileInsightsStats(
    watchProgressState: WatchProgressUiState,
    watchedState: WatchedUiState,
    fullyWatchedSeriesKeys: Set<String>,
    libraryState: LibraryUiState,
    todayIsoDate: String,
): ProfileInsightsStats {
    val now = WatchedClock.nowEpochMs()
    val recentCutoff = now - ProfileInsightsRecentWindowMs
    val progressEntries = watchProgressState.entries
        .filter(WatchProgressEntry::isProfileInsightProgressEntry)
        .map(WatchProgressEntry::normalizedCompletion)
        .distinctBy { entry ->
            listOf(
                entry.parentMetaType,
                entry.parentMetaId,
                entry.videoId,
                entry.seasonNumber,
                entry.episodeNumber,
            ).joinToString("|")
        }
    val continueEntries = progressEntries.profileInsightContinueWatchingEntries()
    val libraryItems = libraryState.items.filter(LibraryItem::isProfileInsightContent)
    val watchedItems = watchedState.items.filter(WatchedItem::isProfileInsightContent)
    val watchedBuckets = buildProfileWatchedContentBuckets(
        watchedItems = watchedItems,
        fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
        libraryItems = libraryItems,
        progressEntries = progressEntries,
    )
    val completedContentItems = watchedBuckets.completedItems
    val ongoingSeriesItems = watchedBuckets.ongoingSeriesItems
    val normalizedTypes = libraryItems.map { item -> item.type } +
        progressEntries.map { entry -> entry.parentMetaType } +
        watchedItems.map { item -> item.type }
    val typedCounts = normalizedTypes
        .mapNotNull(String::profileNormalizedType)
        .groupingBy { type -> type }
        .eachCount()
    val movieCount = typedCounts["movie"] ?: 0
    val seriesCount = typedCounts["series"] ?: 0
    val movieSeriesTotal = (movieCount + seriesCount).coerceAtLeast(0)
    val movieShare = if (movieSeriesTotal > 0) {
        movieCount.toFloat() / movieSeriesTotal.toFloat()
    } else {
        0.5f
    }
    val recentActivityCount = profileRecentActivityCount(
        watchedItems = watchedItems,
        progressEntries = progressEntries,
        recentCutoff = recentCutoff,
    )

    return ProfileInsightsStats(
        continueCount = continueEntries.size,
        completedCount = completedContentItems.size,
        ongoingSeriesCount = ongoingSeriesItems.size,
        libraryCount = libraryItems.size,
        trackedDurationMs = profileTrackedDurationMs(
            watchedItems = watchedItems,
            progressEntries = progressEntries,
        ),
        recentActivityCount = recentActivityCount,
        upcomingCount = libraryItems.count { item ->
            item.profileReleaseIsoDate()?.let { releaseDate -> releaseDate >= todayIsoDate } == true
        },
        topGenre = libraryItems.profileTopGenre(),
        topType = normalizedTypes
            .mapNotNull(String::profileNormalizedType)
            .profileMostCommonValue(),
        tasteSegments = libraryItems.profileTopGenreSegments(limit = 3),
        movieShare = movieShare,
        typeBalanceLabel = when {
            movieSeriesTotal == 0 -> ProfileTasteBalanceLabel.Learning
            movieShare >= 0.62f -> ProfileTasteBalanceLabel.MovieLeaning
            movieShare <= 0.38f -> ProfileTasteBalanceLabel.SeriesLeaning
            else -> ProfileTasteBalanceLabel.Balanced
        },
        dnaChips = buildProfileTasteDnaChips(
            libraryCount = libraryItems.size,
            continueCount = continueEntries.size,
            completedCount = completedContentItems.size,
            recentActivityCount = recentActivityCount,
            upcomingCount = libraryItems.count { item ->
                item.profileReleaseIsoDate()?.let { releaseDate -> releaseDate >= todayIsoDate } == true
            },
            movieShare = movieShare,
            movieSeriesTotal = movieSeriesTotal,
        ),
    )
}

private fun buildProfileInsightCollections(
    watchProgressState: WatchProgressUiState,
    watchedState: WatchedUiState,
    fullyWatchedSeriesKeys: Set<String>,
    libraryState: LibraryUiState,
    todayIsoDate: String,
    continueTitle: String,
    completedTitle: String,
    ongoingTitle: String,
    libraryTitle: String,
    upcomingTitle: String,
): Map<ProfileInsightCollectionKind, ProfileInsightCollection> {
    val continueItems = watchProgressState.entries
        .profileInsightContinueWatchingEntries()
        .asSequence()
        .map { entry ->
            ProfileInsightPosterItem(
                id = "continue:${entry.parentMetaId}:${entry.videoId}",
                title = entry.title.trim().takeIf { it.isNotBlank() } ?: entry.parentMetaId,
                subtitle = entry.profileEpisodeLine(),
                imageUrl = entry.poster ?: entry.episodeThumbnail ?: entry.background,
                lookupType = entry.parentMetaType,
                lookupId = entry.parentMetaId,
            )
        }
        .toList()

    val watchedBuckets = buildProfileWatchedContentBuckets(
        watchedItems = watchedState.items,
        fullyWatchedSeriesKeys = fullyWatchedSeriesKeys,
        libraryItems = libraryState.items,
        progressEntries = watchProgressState.entries,
    )

    val completedItems = watchedBuckets.completedItems
        .asSequence()
        .map { item ->
            ProfileInsightPosterItem(
                id = "completed:${item.kind}:${item.id}",
                title = item.title,
                subtitle = item.subtitle,
                imageUrl = item.imageUrl,
                lookupType = item.kind,
                lookupId = item.id,
            )
        }
        .toList()

    val ongoingItems = watchedBuckets.ongoingSeriesItems
        .asSequence()
        .map { item ->
            ProfileInsightPosterItem(
                id = "ongoing:${item.kind}:${item.id}",
                title = item.title,
                subtitle = item.subtitle,
                imageUrl = item.imageUrl,
                lookupType = item.kind,
                lookupId = item.id,
            )
        }
        .toList()

    val libraryItems = libraryState.items
        .asSequence()
        .filter(LibraryItem::isProfileInsightContent)
        .sortedByDescending { item -> item.savedAtEpochMs }
        .map { item ->
            ProfileInsightPosterItem(
                id = "library:${item.id}:${item.type}",
                title = item.name.trim().takeIf { it.isNotBlank() } ?: item.id,
                subtitle = item.releaseInfo?.trim()?.takeIf { it.isNotBlank() },
                imageUrl = item.poster ?: item.banner,
                lookupType = item.type,
                lookupId = item.id,
            )
        }
        .toList()

    val upcomingItems = libraryState.items
        .asSequence()
        .filter(LibraryItem::isProfileInsightContent)
        .filter { item -> item.profileReleaseIsoDate()?.let { releaseDate -> releaseDate >= todayIsoDate } == true }
        .sortedBy { item -> item.profileReleaseIsoDate().orEmpty() }
        .map { item ->
            ProfileInsightPosterItem(
                id = "upcoming:${item.id}:${item.type}",
                title = item.name.trim().takeIf { it.isNotBlank() } ?: item.id,
                subtitle = item.releaseInfo?.trim()?.takeIf { it.isNotBlank() },
                imageUrl = item.poster ?: item.banner,
                lookupType = item.type,
                lookupId = item.id,
            )
        }
        .toList()

    return mapOf(
        ProfileInsightCollectionKind.Continue to ProfileInsightCollection(
            title = continueTitle,
            subtitle = "",
            items = continueItems,
        ),
        ProfileInsightCollectionKind.Completed to ProfileInsightCollection(
            title = completedTitle,
            subtitle = "",
            items = completedItems,
        ),
        ProfileInsightCollectionKind.Ongoing to ProfileInsightCollection(
            title = ongoingTitle,
            subtitle = "",
            items = ongoingItems,
        ),
        ProfileInsightCollectionKind.Library to ProfileInsightCollection(
            title = libraryTitle,
            subtitle = "",
            items = libraryItems,
        ),
        ProfileInsightCollectionKind.Upcoming to ProfileInsightCollection(
            title = upcomingTitle,
            subtitle = "",
            items = upcomingItems,
        ),
    )
}

private fun emptyProfileInsightsStats(): ProfileInsightsStats =
    ProfileInsightsStats(
        continueCount = 0,
        completedCount = 0,
        ongoingSeriesCount = 0,
        libraryCount = 0,
        trackedDurationMs = 0L,
        recentActivityCount = 0,
        upcomingCount = 0,
        topGenre = null,
        topType = null,
        tasteSegments = emptyList(),
        movieShare = 0.5f,
        typeBalanceLabel = ProfileTasteBalanceLabel.Learning,
        dnaChips = listOf(ProfileTasteDnaChip.Learning),
    )

private fun emptyProfileInsightCollections(
    continueTitle: String,
    completedTitle: String,
    ongoingTitle: String,
    libraryTitle: String,
    upcomingTitle: String,
): Map<ProfileInsightCollectionKind, ProfileInsightCollection> =
    mapOf(
        ProfileInsightCollectionKind.Continue to ProfileInsightCollection(
            title = continueTitle,
            subtitle = "",
            items = emptyList(),
        ),
        ProfileInsightCollectionKind.Completed to ProfileInsightCollection(
            title = completedTitle,
            subtitle = "",
            items = emptyList(),
        ),
        ProfileInsightCollectionKind.Ongoing to ProfileInsightCollection(
            title = ongoingTitle,
            subtitle = "",
            items = emptyList(),
        ),
        ProfileInsightCollectionKind.Library to ProfileInsightCollection(
            title = libraryTitle,
            subtitle = "",
            items = emptyList(),
        ),
        ProfileInsightCollectionKind.Upcoming to ProfileInsightCollection(
            title = upcomingTitle,
            subtitle = "",
            items = emptyList(),
        ),
    )

private data class ProfileWatchedContentBuckets(
    val completedItems: List<ProfileCompletedContentItem>,
    val ongoingSeriesItems: List<ProfileCompletedContentItem>,
)

private fun buildProfileWatchedContentBuckets(
    watchedItems: List<WatchedItem>,
    fullyWatchedSeriesKeys: Set<String>,
    libraryItems: List<LibraryItem>,
    progressEntries: List<WatchProgressEntry> = emptyList(),
): ProfileWatchedContentBuckets {
    val libraryByContentKey = libraryItems
        .mapNotNull { item ->
            val kind = item.type.profileCompletedContentKind() ?: return@mapNotNull null
            if (!item.isProfileInsightContent()) return@mapNotNull null
            "${kind}:${item.id}" to item
        }
        .toMap()
    val progressByContentKey = progressEntries
        .filter(WatchProgressEntry::isProfileInsightProgressEntry)
        .map(WatchProgressEntry::normalizedCompletion)
        .mapNotNull { entry ->
            val kind = entry.parentMetaType.profileCompletedContentKind() ?: return@mapNotNull null
            if (entry.parentMetaId.isBlank()) return@mapNotNull null
            "${kind}:${entry.parentMetaId}" to entry
        }
        .groupBy({ it.first }, { it.second })
        .mapValues { (_, entries) -> entries.maxByOrNull(WatchProgressEntry::lastUpdatedEpochMs) }

    val eligibleItems = watchedItems
        .asSequence()
        .filter(WatchedItem::isProfileInsightContent)
        .toList()

    val movieItems = eligibleItems
        .asSequence()
        .filter { item -> item.type.profileCompletedContentKind() == "movie" }
        .filterNot { item -> item.season != null || item.episode != null }
        .groupBy { item -> "movie:${item.id}" }
        .mapNotNull { (key, group) ->
            val item = group.maxByOrNull(WatchedItem::markedAtEpochMs) ?: return@mapNotNull null
            val libraryItem = libraryByContentKey[key]
            val progressItem = progressByContentKey[key]
            ProfileCompletedContentItem(
                id = item.id,
                kind = "movie",
                title = item.name.trim().takeIf { it.isNotBlank() }
                    ?: libraryItem?.name?.trim()?.takeIf { it.isNotBlank() }
                    ?: progressItem?.title?.trim()?.takeIf { it.isNotBlank() }
                    ?: item.id,
                subtitle = item.releaseInfo?.trim()?.takeIf { it.isNotBlank() }
                    ?: libraryItem?.releaseInfo?.trim()?.takeIf { it.isNotBlank() },
                imageUrl = item.poster
                    ?: libraryItem?.poster
                    ?: libraryItem?.banner
                    ?: progressItem?.profileArtworkUrl()
                    ?: profileCachedArtworkUrl("movie", item.id),
                markedAtEpochMs = item.markedAtEpochMs,
            )
        }

    val completedSeriesItems = mutableListOf<ProfileCompletedContentItem>()
    val ongoingSeriesItems = mutableListOf<ProfileCompletedContentItem>()

    eligibleItems
        .asSequence()
        .filter { item -> item.type.profileCompletedContentKind() == "series" }
        .groupBy { item -> "series:${item.id}" }
        .forEach { (key, group) ->
            val topLevelMarker = group
                .filterNot { item -> item.season != null || item.episode != null }
                .maxByOrNull(WatchedItem::markedAtEpochMs)
            val hasTopLevelSeriesMarker = topLevelMarker != null &&
                !topLevelMarker.type.equals("tv", ignoreCase = true)
            val hasFullyWatchedMarker = hasTopLevelSeriesMarker ||
                group.any { item -> watchedItemKey(item.type, item.id) in fullyWatchedSeriesKeys }
            val libraryItem = libraryByContentKey[key]
            val progressItem = progressByContentKey[key]

            if (hasFullyWatchedMarker) {
                val representative = topLevelMarker ?: group.maxByOrNull(WatchedItem::markedAtEpochMs)
                    ?: return@forEach
                completedSeriesItems += ProfileCompletedContentItem(
                    id = representative.id,
                    kind = "series",
                    title = topLevelMarker?.name?.trim()?.takeIf { it.isNotBlank() }
                        ?: libraryItem?.name?.trim()?.takeIf { it.isNotBlank() }
                        ?: progressItem?.title?.trim()?.takeIf { it.isNotBlank() }
                        ?: representative.name.trim().takeIf { it.isNotBlank() }
                        ?: representative.id,
                    subtitle = topLevelMarker?.releaseInfo?.trim()?.takeIf { it.isNotBlank() }
                        ?: libraryItem?.releaseInfo?.trim()?.takeIf { it.isNotBlank() }
                        ?: representative.releaseInfo?.trim()?.takeIf { it.isNotBlank() },
                    imageUrl = topLevelMarker?.poster
                        ?: libraryItem?.poster
                        ?: libraryItem?.banner
                        ?: progressItem?.profileArtworkUrl()
                        ?: representative.poster
                        ?: profileCachedArtworkUrl("series", representative.id),
                    markedAtEpochMs = group.maxOf { item -> item.markedAtEpochMs },
                )
            } else {
                val hasEpisodeActivity = group.any { item -> item.season != null && item.episode != null }
                if (!hasEpisodeActivity) return@forEach
                val representative = group.maxByOrNull(WatchedItem::markedAtEpochMs) ?: return@forEach
                ongoingSeriesItems += ProfileCompletedContentItem(
                    id = representative.id,
                    kind = "series",
                    title = libraryItem?.name?.trim()?.takeIf { it.isNotBlank() }
                        ?: progressItem?.title?.trim()?.takeIf { it.isNotBlank() }
                        ?: representative.name.trim().takeIf { it.isNotBlank() }
                        ?: representative.id,
                    subtitle = libraryItem?.releaseInfo?.trim()?.takeIf { it.isNotBlank() }
                        ?: representative.releaseInfo?.trim()?.takeIf { it.isNotBlank() },
                    imageUrl = libraryItem?.poster
                        ?: libraryItem?.banner
                        ?: progressItem?.profileArtworkUrl()
                        ?: representative.poster
                        ?: profileCachedArtworkUrl("series", representative.id),
                    markedAtEpochMs = group.maxOf { item -> item.markedAtEpochMs },
                )
            }
        }

    return ProfileWatchedContentBuckets(
        completedItems = (movieItems + completedSeriesItems).sortedByDescending(ProfileCompletedContentItem::markedAtEpochMs),
        ongoingSeriesItems = ongoingSeriesItems.sortedByDescending(ProfileCompletedContentItem::markedAtEpochMs),
    )
}
private fun WatchProgressEntry.isProfileInsightProgressEntry(): Boolean =
    parentMetaType.profileCompletedContentKind() != null &&
        !parentMetaId.isLikelyProfileLiveTvValue() &&
        !title.isLikelyProfileLiveTvValue()

private fun List<WatchProgressEntry>.profileInsightContinueWatchingEntries(): List<WatchProgressEntry> =
    asSequence()
        .filter(WatchProgressEntry::isProfileInsightProgressEntry)
        .map(WatchProgressEntry::normalizedCompletion)
        .filterNot(WatchProgressEntry::isEffectivelyCompleted)
        .filter { entry ->
            entry.lastPositionMs > 0L || (entry.normalizedProgressPercent ?: 0f) > 0f
        }
        .distinctBy { entry ->
            listOf(
                entry.parentMetaType,
                entry.parentMetaId,
                entry.videoId,
                entry.seasonNumber,
                entry.episodeNumber,
            ).joinToString("|")
        }
        .sortedByDescending(WatchProgressEntry::lastUpdatedEpochMs)
        .toList()

private fun WatchProgressEntry.profileEpisodeLine(): String? {
    val episodeCode = if (seasonNumber != null && episodeNumber != null) {
        "S${seasonNumber}E${episodeNumber}"
    } else {
        null
    }
    val cleanTitle = episodeTitle?.trim()?.takeIf { it.isNotBlank() }
    return when {
        episodeCode != null && cleanTitle != null -> "$episodeCode - $cleanTitle"
        episodeCode != null -> episodeCode
        cleanTitle != null -> cleanTitle
        else -> null
    }
}

private fun WatchProgressEntry.profileTrackedDurationMs(): Long {
    if (durationMs <= 0L) return lastPositionMs.coerceAtLeast(0L)
    if (isEffectivelyCompleted) return durationMs
    if (lastPositionMs > 0L) return lastPositionMs.coerceIn(0L, durationMs)
    val explicitPercent = normalizedProgressPercent ?: return 0L
    return (durationMs * (explicitPercent / 100f)).toLong().coerceIn(0L, durationMs)
}

private fun profileTrackedDurationMs(
    watchedItems: List<WatchedItem>,
    progressEntries: List<WatchProgressEntry>,
): Long {
    val progressDurationByKey = progressEntries
        .asSequence()
        .mapNotNull { entry ->
            entry.profileTrackableActivityKey()?.let { key -> key to entry.profileTrackedDurationMs() }
        }
        .groupBy({ it.first }, { it.second })
        .mapValues { (_, durations) -> durations.maxOrNull() ?: 0L }

    val watchedDurationByKey = watchedItems
        .asSequence()
        .mapNotNull { item ->
            item.profileTrackableActivityKey()?.let { key -> key to item.profileCachedWatchedDurationMs() }
        }
        .filter { (key, duration) -> duration > 0L && key !in progressDurationByKey }
        .groupBy({ it.first }, { it.second })
        .mapValues { (_, durations) -> durations.maxOrNull() ?: 0L }

    return progressDurationByKey.values.sum() + watchedDurationByKey.values.sum()
}

private fun WatchProgressEntry.profileArtworkUrl(): String? =
    poster?.takeIf { it.isNotBlank() }
        ?: background?.takeIf { it.isNotBlank() }
        ?: episodeThumbnail?.takeIf { it.isNotBlank() }

private suspend fun profileFetchArtworkUrl(type: String?, id: String?): String? {
    for ((lookupType, lookupId) in profileMetaLookupCandidates(type, id)) {
        profileCachedArtworkUrl(lookupType, lookupId)?.let { return it }

        val hydratedMeta = runCatching {
            MetaDetailsRepository.fetch(type = lookupType, id = lookupId)
        }.onFailure { error ->
            profileInsightsLog.w(error) {
                "Failed to hydrate profile poster for $lookupType/$lookupId"
            }
        }.getOrNull()

        hydratedMeta.profileMetaArtworkUrl()?.let { return it }
    }

    return null
}

private fun profileCachedArtworkUrl(type: String?, id: String?): String? {
    for ((lookupType, lookupId) in profileMetaLookupCandidates(type, id)) {
        MetaDetailsRepository.peek(type = lookupType, id = lookupId)
            .profileMetaArtworkUrl()
            ?.let { return it }
    }

    return null
}

private fun MetaDetails?.profileMetaArtworkUrl(): String? =
    this?.poster?.trim()?.takeIf { it.isNotBlank() }
        ?: this?.background?.trim()?.takeIf { it.isNotBlank() }

private fun profileMetaLookupCandidates(type: String?, id: String?): List<Pair<String, String>> {
    val cleanId = id?.trim()?.takeIf { it.isNotBlank() } ?: return emptyList()
    val cleanType = type?.trim()?.takeIf { it.isNotBlank() } ?: return emptyList()
    val normalizedKind = cleanType.profileCompletedContentKind()

    val typeCandidates = buildList {
        add(cleanType)
        normalizedKind?.let(::add)
        when (normalizedKind) {
            "movie" -> add("film")
            "series" -> {
                add("tv")
                add("show")
                add("tvshow")
            }
        }
    }
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .distinctBy { it.lowercase() }

    return typeCandidates.map { candidateType -> candidateType to cleanId }
}

private fun profileRecentActivityCount(
    watchedItems: List<WatchedItem>,
    progressEntries: List<WatchProgressEntry>,
    recentCutoff: Long,
): Int = buildSet {
    watchedItems
        .asSequence()
        .filter { item -> item.markedAtEpochMs >= recentCutoff }
        .mapNotNull(WatchedItem::profileActivityKey)
        .forEach(::add)
    progressEntries
        .asSequence()
        .filter { entry -> entry.lastUpdatedEpochMs >= recentCutoff }
        .mapNotNull(WatchProgressEntry::profileActivityKey)
        .forEach(::add)
}.size

private fun WatchedItem.profileActivityKey(): String? {
    if (!isProfileTrackableActivity()) return null
    val kind = type.profileCompletedContentKind() ?: return null
    val contentId = id.trim().takeIf { it.isNotBlank() } ?: return null
    return "$kind:$contentId:${season ?: -1}:${episode ?: -1}"
}

private fun WatchProgressEntry.profileActivityKey(): String? {
    if (!isProfileTrackableActivity()) return null
    val kind = parentMetaType.profileCompletedContentKind() ?: return null
    val contentId = parentMetaId.trim().takeIf { it.isNotBlank() } ?: return null
    return "$kind:$contentId:${seasonNumber ?: -1}:${episodeNumber ?: -1}"
}

private fun WatchedItem.profileTrackableActivityKey(): String? = profileActivityKey()

private fun WatchProgressEntry.profileTrackableActivityKey(): String? = profileActivityKey()

private fun WatchedItem.isProfileTrackableActivity(): Boolean {
    val kind = type.profileCompletedContentKind() ?: return false
    return kind == "movie" || (kind == "series" && season != null && episode != null)
}

private fun WatchProgressEntry.isProfileTrackableActivity(): Boolean {
    val kind = parentMetaType.profileCompletedContentKind() ?: return false
    return kind == "movie" || (kind == "series" && seasonNumber != null && episodeNumber != null)
}

private fun WatchedItem.profileCachedWatchedDurationMs(): Long {
    val kind = type.profileCompletedContentKind() ?: return 0L
    val meta = profileCachedMeta(type, id) ?: return 0L
    val minutes = when {
        kind == "movie" && season == null && episode == null -> profileParseRuntimeMinutes(meta.runtime)
        kind == "series" && season != null && episode != null -> meta.videos
            .firstOrNull { video -> video.season == season && video.episode == episode }
            ?.runtime
            ?.takeIf { runtime -> runtime > 0 }
        else -> null
    } ?: return 0L
    return minutes.toLong() * ProfileInsightsMinuteMs
}

private fun profileCachedMeta(type: String?, id: String?): MetaDetails? {
    for ((lookupType, lookupId) in profileMetaLookupCandidates(type, id)) {
        MetaDetailsRepository.peek(type = lookupType, id = lookupId)?.let { return it }
    }
    return null
}

private fun profileParseRuntimeMinutes(value: String?): Int? {
    val runtime = value?.trim()?.takeIf { it.isNotBlank() } ?: return null

    profileHourMinuteColonRegex.matchEntire(runtime)?.let { match ->
        val hours = match.groupValues[1].toIntOrNull() ?: return null
        val minutes = match.groupValues[2].toIntOrNull() ?: return null
        return ((hours * 60) + minutes).coerceAtLeast(0)
    }

    val hoursToken = profileHourTokenRegex.find(runtime)?.groupValues?.getOrNull(1)?.toIntOrNull()
    val minutesToken = profileMinuteTokenRegex.find(runtime)?.groupValues?.getOrNull(1)?.toIntOrNull()
    if (hoursToken != null || minutesToken != null) {
        return (((hoursToken ?: 0).coerceAtLeast(0) * 60) + (minutesToken ?: 0).coerceAtLeast(0))
    }

    return profileDigitsOnlyRegex.matchEntire(runtime)
        ?.groupValues
        ?.getOrNull(1)
        ?.toIntOrNull()
        ?.coerceAtLeast(0)
}

private fun List<LibraryItem>.profileTopGenre(): String? =
    asSequence()
        .flatMap { item -> item.genres.asSequence() }
        .map { genre -> genre.trim() }
        .filter { genre -> genre.isNotBlank() }
        .groupingBy { genre -> genre }
        .eachCount()
        .maxByOrNull { (_, count) -> count }
        ?.key

private fun List<LibraryItem>.profileTopGenreSegments(limit: Int): List<ProfileTasteSegment> {
    val counts = asSequence()
        .flatMap { item -> item.genres.asSequence() }
        .map { genre -> genre.trim() }
        .filter { genre -> genre.isNotBlank() }
        .groupingBy { genre -> genre }
        .eachCount()
        .toList()
        .sortedByDescending { (_, count) -> count }
    val total = counts.sumOf { (_, count) -> count }.coerceAtLeast(1)
    return counts
        .take(limit)
        .map { (genre, count) ->
            ProfileTasteSegment(
                label = genre,
                share = count.toFloat() / total.toFloat(),
            )
        }
}

private fun buildProfileTasteDnaChips(
    libraryCount: Int,
    continueCount: Int,
    completedCount: Int,
    recentActivityCount: Int,
    upcomingCount: Int,
    movieShare: Float,
    movieSeriesTotal: Int,
): List<ProfileTasteDnaChip> = buildList {
    when {
        movieSeriesTotal == 0 -> add(ProfileTasteDnaChip.Learning)
        movieShare >= 0.62f -> add(ProfileTasteDnaChip.MovieLeaning)
        movieShare <= 0.38f -> add(ProfileTasteDnaChip.SeriesLeaning)
        else -> add(ProfileTasteDnaChip.Balanced)
    }
    if (continueCount >= 3) add(ProfileTasteDnaChip.BingeReady)
    if (recentActivityCount >= 5) add(ProfileTasteDnaChip.HighActivity)
    if (libraryCount >= 12) add(ProfileTasteDnaChip.Collector)
    if (upcomingCount > 0) add(ProfileTasteDnaChip.RadarWatcher)
    if (completedCount >= 10) add(ProfileTasteDnaChip.Completionist)
}.distinct().take(4)

private fun LibraryItem.profileReleaseIsoDate(): String? =
    releaseInfo.profileExtractIsoDate()

private fun String?.profileExtractIsoDate(): String? {
    val value = this?.trim().orEmpty()
    if (value.isBlank()) return null

    if (value.length >= 10) {
        for (start in 0..(value.length - 10)) {
            val candidate = value.substring(start, start + 10)
            if (candidate.isIsoDateCandidate()) return candidate
        }
    }

    val normalized = value
        .replace(',', ' ')
        .replace('.', ' ')
        .replace('/', ' ')
        .replace('-', ' ')
        .replace(Regex("\\s+"), " ")
        .trim()
    val tokens = normalized.split(' ').filter(String::isNotBlank)
    val yearIndex = tokens.indexOfFirst { token ->
        token.length == 4 && token.all(Char::isDigit) && token.toIntOrNull() in 1000..9999
    }
    if (yearIndex < 0) return null

    val year = tokens[yearIndex].toInt()
    val monthBefore = tokens.getOrNull(yearIndex - 1)?.profileMonthNumber()
    val monthAfter = tokens.getOrNull(yearIndex + 1)?.profileMonthNumber()
    val month = monthBefore ?: monthAfter ?: 12
    val dayBefore = tokens.getOrNull(yearIndex - 1)?.toIntOrNull()?.takeIf { it in 1..31 }
    val dayAfterOne = tokens.getOrNull(yearIndex + 1)?.toIntOrNull()?.takeIf { it in 1..31 }
    val dayAfterTwo = tokens.getOrNull(yearIndex + 2)?.toIntOrNull()?.takeIf { it in 1..31 }
    val day = when {
        monthBefore != null -> dayBefore ?: 1
        monthAfter != null -> dayAfterTwo ?: 1
        else -> dayAfterOne ?: 31
    }.coerceAtMost(profileDaysInMonth(year, month))

    return "${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}"
}

private fun String.isIsoDateCandidate(): Boolean =
    length == 10 &&
        this[4] == '-' &&
        this[7] == '-' &&
        take(4).all(Char::isDigit) &&
        substring(5, 7).all(Char::isDigit) &&
        substring(8, 10).all(Char::isDigit)

private fun String.profileMonthNumber(): Int? =
    when (trim().lowercase().take(3)) {
        "jan", "oca" -> 1
        "feb", "şub", "sub" -> 2
        "mar" -> 3
        "apr", "nis" -> 4
        "may", "mai" -> 5
        "jun", "haz" -> 6
        "jul", "tem" -> 7
        "aug", "ağu", "agu" -> 8
        "sep", "eyl" -> 9
        "oct", "eki" -> 10
        "nov", "kas" -> 11
        "dec", "ara" -> 12
        else -> null
    }

private fun profileDaysInMonth(year: Int, month: Int): Int =
    when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        2 -> if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) 29 else 28
        else -> 31
    }

private fun String.profileNormalizedType(): String? =
    when (trim().lowercase()) {
        "movie", "film" -> "movie"
        "series", "show", "tv", "tvshow", "anime" -> "series"
        "" -> null
        else -> trim().lowercase()
    }

private fun String.profileCompletedContentKind(): String? =
    when (trim().lowercase()) {
        "live-tv", "livetv", "live_tv", "channel", "tv-channel", "tv_channel", "iptv", "m3u", "stalker" -> null
        "movie", "film" -> "movie"
        "series", "show", "tv", "tvshow", "anime" -> "series"
        else -> null
    }

private fun LibraryItem.isProfileInsightContent(): Boolean =
    type.profileCompletedContentKind() != null &&
        !id.isLikelyProfileLiveTvValue() &&
        !name.isLikelyProfileLiveTvValue()

private fun WatchedItem.isProfileInsightContent(): Boolean =
    type.profileCompletedContentKind() != null &&
        !id.isLikelyProfileLiveTvValue() &&
        !name.isLikelyProfileLiveTvValue()

private fun String.isLikelyProfileLiveTvValue(): Boolean {
    val value = trim().lowercase()
    return value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("rtmp://") ||
        value.startsWith("rtsp://") ||
        value.endsWith(".m3u") ||
        value.endsWith(".m3u8")
}

private fun List<String>.profileMostCommonValue(): String? =
    filter { value -> value.isNotBlank() }
        .groupingBy { value -> value }
        .eachCount()
        .maxByOrNull { (_, count) -> count }
        ?.key

private fun String.fallbackDisplayLabel(): String {
    val clean = trim()
    if (clean.isBlank()) return clean
    return clean.replaceFirstChar { char ->
        if (char.isLowerCase()) char.titlecase() else char.toString()
    }
}

private data class ProfileInsightsStats(
    val continueCount: Int,
    val completedCount: Int,
    val ongoingSeriesCount: Int,
    val libraryCount: Int,
    val trackedDurationMs: Long,
    val recentActivityCount: Int,
    val upcomingCount: Int,
    val topGenre: String?,
    val topType: String?,
    val tasteSegments: List<ProfileTasteSegment>,
    val movieShare: Float,
    val typeBalanceLabel: ProfileTasteBalanceLabel,
    val dnaChips: List<ProfileTasteDnaChip>,
)


private data class ProfileInsightTile(
    val icon: ImageVector,
    val value: String,
    val label: String,
    val caption: String,
    val collectionKind: ProfileInsightCollectionKind? = null,
)

private enum class ProfileInsightCollectionKind {
    Continue,
    Completed,
    Ongoing,
    Library,
    Upcoming,
}

private data class ProfileInsightCollection(
    val title: String,
    val subtitle: String,
    val items: List<ProfileInsightPosterItem>,
)

private data class ProfileInsightPosterItem(
    val id: String,
    val title: String,
    val subtitle: String?,
    val imageUrl: String?,
    val lookupType: String? = null,
    val lookupId: String? = null,
)

private data class ProfileCompletedContentItem(
    val id: String,
    val kind: String,
    val title: String,
    val subtitle: String?,
    val imageUrl: String?,
    val markedAtEpochMs: Long,
)

private data class ProfileTasteSegment(
    val label: String,
    val share: Float,
)

private enum class ProfileTasteBalanceLabel {
    Learning,
    MovieLeaning,
    SeriesLeaning,
    Balanced,
}

private enum class ProfileTasteDnaChip {
    Learning,
    MovieLeaning,
    SeriesLeaning,
    Balanced,
    BingeReady,
    HighActivity,
    Collector,
    RadarWatcher,
    Completionist,
}

@Composable
private fun ProfileTasteBalanceLabel.localizedLabel(): String =
    when (this) {
        ProfileTasteBalanceLabel.Learning -> stringResource(Res.string.profile_insights_taste_balance_learning)
        ProfileTasteBalanceLabel.MovieLeaning -> stringResource(Res.string.profile_insights_taste_balance_movie)
        ProfileTasteBalanceLabel.SeriesLeaning -> stringResource(Res.string.profile_insights_taste_balance_series)
        ProfileTasteBalanceLabel.Balanced -> stringResource(Res.string.profile_insights_taste_balance_balanced)
    }

@Composable
private fun ProfileTasteDnaChip.localizedLabel(): String =
    when (this) {
        ProfileTasteDnaChip.Learning -> stringResource(Res.string.profile_insights_taste_chip_learning)
        ProfileTasteDnaChip.MovieLeaning -> stringResource(Res.string.profile_insights_taste_chip_movie)
        ProfileTasteDnaChip.SeriesLeaning -> stringResource(Res.string.profile_insights_taste_chip_series)
        ProfileTasteDnaChip.Balanced -> stringResource(Res.string.profile_insights_taste_chip_balanced)
        ProfileTasteDnaChip.BingeReady -> stringResource(Res.string.profile_insights_taste_chip_binge)
        ProfileTasteDnaChip.HighActivity -> stringResource(Res.string.profile_insights_taste_chip_active)
        ProfileTasteDnaChip.Collector -> stringResource(Res.string.profile_insights_taste_chip_collector)
        ProfileTasteDnaChip.RadarWatcher -> stringResource(Res.string.profile_insights_taste_chip_radar)
        ProfileTasteDnaChip.Completionist -> stringResource(Res.string.profile_insights_taste_chip_completionist)
    }

private const val ProfileInsightsMinuteMs = 60_000L
private const val ProfileInsightsRecentWindowMs = 7L * 24L * 60L * 60L * 1000L
private val profileHourTokenRegex = Regex("""(?i)(\d+)\s*h(?:ours?)?""")
private val profileMinuteTokenRegex = Regex("""(?i)(\d+)\s*m(?:in(?:ute)?s?)?""")
private val profileHourMinuteColonRegex = Regex("""^\s*(\d+)\s*:\s*(\d{1,2})\s*$""")
private val profileDigitsOnlyRegex = Regex("""^\s*(\d+)\s*$""")
