package com.nuvio.app.features.details

import androidx.compose.animation.Crossfade
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
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource
import com.nuvio.app.core.ui.landscapePosterHeightForWidth
import com.nuvio.app.core.ui.landscapePosterWidth
import com.nuvio.app.core.ui.rememberPosterCardStyleUiState
import com.nuvio.app.features.details.components.DetailPosterRailSection
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.tmdb.TmdbEntityBrowseData
import com.nuvio.app.features.tmdb.TmdbEntityKind
import com.nuvio.app.features.tmdb.TmdbEntityMediaType
import com.nuvio.app.features.tmdb.TmdbEntityRailType
import com.nuvio.app.features.tmdb.TmdbMetadataService

private sealed interface EntityBrowseUiState {
    data object Loading : EntityBrowseUiState
    data class Error(val message: String) : EntityBrowseUiState
    data class Success(val data: TmdbEntityBrowseData) : EntityBrowseUiState
}

@Composable
fun TmdbEntityBrowseScreen(
    entityKind: TmdbEntityKind,
    entityId: Int,
    entityName: String,
    sourceType: String,
    onBack: () -> Unit,
    onOpenMeta: (MetaPreview) -> Unit,
    modifier: Modifier = Modifier,
) {
    var uiState by remember(entityKind, entityId) {
        mutableStateOf<EntityBrowseUiState>(EntityBrowseUiState.Loading)
    }
    val loadFailedMessage = stringResource(Res.string.details_browse_load_failed, entityName)

    LaunchedEffect(entityKind, entityId) {
        uiState = EntityBrowseUiState.Loading
        val data = TmdbMetadataService.fetchEntityBrowse(
            entityKind = entityKind,
            entityId = entityId,
            sourceType = sourceType,
            fallbackName = entityName,
        )
        uiState = if (data != null) {
            EntityBrowseUiState.Success(data)
        } else {
            EntityBrowseUiState.Error(loadFailedMessage)
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        Crossfade(
            targetState = uiState,
            label = "EntityBrowseCrossfade",
        ) { state ->
            when (state) {
                is EntityBrowseUiState.Loading -> EntityBrowseSkeleton()
                is EntityBrowseUiState.Error -> EntityBrowseError(
                    message = state.message,
                    onRetry = { uiState = EntityBrowseUiState.Loading },
                )
                is EntityBrowseUiState.Success -> EntityBrowseContent(
                    data = state.data,
                    sourceType = sourceType,
                    onOpenMeta = onOpenMeta,
                )
            }
        }

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
private fun EntityBrowseContent(
    data: TmdbEntityBrowseData,
    sourceType: String,
    onOpenMeta: (MetaPreview) -> Unit,
) {
    val backgroundUrl = remember(data.rails, sourceType) {
        val preferredMediaType = if (sourceType.trim().equals("movie", ignoreCase = true)) {
            TmdbEntityMediaType.MOVIE
        } else {
            TmdbEntityMediaType.TV
        }
        data.rails.firstOrNull { it.mediaType == preferredMediaType }
            ?.items?.firstOrNull()?.poster
            ?: data.rails.firstOrNull()?.items?.firstOrNull()?.poster
    }

    Box(modifier = Modifier.fillMaxSize()) {
        if (backgroundUrl != null) {
            AsyncImage(
                model = backgroundUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                alpha = 0.10f,
            )
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to MaterialTheme.colorScheme.background.copy(alpha = 0.7f),
                        0.3f to MaterialTheme.colorScheme.background.copy(alpha = 0.95f),
                        1f to MaterialTheme.colorScheme.background,
                    ),
                ),
        )

        if (data.rails.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(Res.string.catalog_empty_title),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(top = 56.dp),
            ) {
                EntityHeroSection(
                    header = data.header,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                )

                data.rails.forEach { rail ->
                    val mediaLabel = when (rail.mediaType) {
                        TmdbEntityMediaType.MOVIE -> stringResource(Res.string.media_movies)
                        TmdbEntityMediaType.TV -> stringResource(Res.string.media_series)
                    }
                    val railLabel = when (rail.railType) {
                        TmdbEntityRailType.POPULAR -> stringResource(Res.string.details_browse_rail_popular)
                        TmdbEntityRailType.TOP_RATED -> stringResource(Res.string.details_browse_rail_top_rated)
                        TmdbEntityRailType.RECENT -> stringResource(Res.string.details_browse_rail_recent)
                    }
                    val railTitle = stringResource(Res.string.details_browse_rail_title, mediaLabel, railLabel)

                    DetailPosterRailSection(
                        title = railTitle,
                        items = rail.items,
                        watchedKeys = emptySet(),
                        headerHorizontalPadding = 20.dp,
                        onPosterClick = onOpenMeta,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }

                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }
}

@Composable
private fun EntityHeroSection(
    header: com.nuvio.app.features.tmdb.TmdbEntityHeader,
    modifier: Modifier = Modifier,
) {
    val hasLogo = !header.logo.isNullOrBlank()

    Column(modifier = modifier.padding(horizontal = 20.dp)) {
        Text(
            text = when (header.kind) {
                TmdbEntityKind.COMPANY -> stringResource(Res.string.details_browse_kind_company)
                TmdbEntityKind.NETWORK -> stringResource(Res.string.details_browse_kind_network)
            },
            style = MaterialTheme.typography.labelLarge.copy(
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.4.sp,
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(8.dp))

        if (hasLogo) {
            Box(
                modifier = Modifier
                    .height(60.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.White)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = header.logo,
                    contentDescription = header.name,
                    modifier = Modifier.height(44.dp),
                    contentScale = ContentScale.Fit,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        Text(
            text = header.name,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.5).sp,
            ),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        val metaLine = listOfNotNull(
            header.originCountry?.takeIf { it.isNotBlank() },
            header.secondaryLabel?.takeIf { it.isNotBlank() },
        ).joinToString(" • ")
        if (metaLine.isNotBlank()) {
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = metaLine,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        header.description?.takeIf { it.isNotBlank() }?.let { description ->
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 20.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun EntityBrowseSkeleton() {
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(top = 56.dp),
    ) {
        Column(modifier = Modifier.padding(horizontal = 20.dp)) {
            Box(
                modifier = Modifier
                    .width(120.dp)
                    .height(14.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            )
            Spacer(modifier = Modifier.height(12.dp))
            Box(
                modifier = Modifier
                    .width(200.dp)
                    .height(28.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            )
            Spacer(modifier = Modifier.height(10.dp))
            Box(
                modifier = Modifier
                    .width(140.dp)
                    .height(14.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
            )
        }

        Spacer(modifier = Modifier.height(28.dp))

        repeat(3) {
            Column(modifier = Modifier.padding(bottom = 20.dp)) {
                Box(
                    modifier = Modifier
                        .padding(horizontal = 20.dp)
                        .width(160.dp)
                        .height(16.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    repeat(4) {
                        Box(
                            modifier = Modifier
                                .width(skeletonPosterWidth)
                                .height(skeletonPosterHeight)
                                .clip(RoundedCornerShape(posterCardStyle.cornerRadiusDp.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EntityBrowseError(
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
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            ) {
                Text(stringResource(Res.string.action_retry))
            }
        }
    }
}
