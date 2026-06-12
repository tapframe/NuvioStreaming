package com.nuvio.app.features.details.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.VolumeOff
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.graphicsLayer
import com.nuvio.app.core.ui.NuvioDesktopImageScaling
import com.nuvio.app.core.ui.NuvioAsyncImage as AsyncImage
import com.nuvio.app.features.details.MetaDetails
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
fun DetailHero(
    meta: MetaDetails,
    isTablet: Boolean = false,
    scrollOffset: Int = 0,
    contentMaxWidth: Dp = 560.dp,
    viewportHeight: Dp = 0.dp,
    onHeightChanged: (Int) -> Unit = {},
    heroTrailerSourceUrl: String? = null,
    heroTrailerSourceAudioUrl: String? = null,
    heroTrailerReady: Boolean = false,
    heroTrailerPlayWhenReady: Boolean = false,
    heroTrailerMuted: Boolean = true,
    onHeroTrailerMuteToggle: () -> Unit = {},
    onHeroTrailerReady: () -> Unit = {},
    onHeroTrailerEnded: () -> Unit = {},
    onHeroTrailerError: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(
        modifier = modifier.fillMaxWidth(),
    ) {
        val heroHeight = detailHeroHeight(maxWidth, viewportHeight, isTablet)
        val trailerAlpha by animateFloatAsState(
            targetValue = if (heroTrailerReady) 1f else 0f,
            animationSpec = tween(durationMillis = 300),
            label = "detail_hero_trailer_alpha",
        )
        val muteIconSize = if (isTablet) 20.dp else 22.dp
        val heroChromeTopPadding = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() +
            8.dp +
            ((40.dp - muteIconSize) / 2)

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(heroHeight)
                .onSizeChanged { onHeightChanged(it.height) }
                .graphicsLayer {
                    clip = true
                },
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize(),
                contentAlignment = Alignment.BottomCenter,
            ) {
                val imageUrl = meta.background ?: meta.poster
                val backdropScale = if (isTablet) 1f else 1.08f
                if (imageUrl != null) {
                    AsyncImage(
                        model = imageUrl,
                        contentDescription = meta.name,
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                translationY = scrollOffset * 0.5f
                                scaleX = backdropScale
                                scaleY = backdropScale
                            },
                        alignment = Alignment.Center,
                        contentScale = ContentScale.Crop,
                        desktopImageScaling = NuvioDesktopImageScaling.Disabled,
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.surface),
                    )
                }
                if (heroTrailerSourceUrl != null) {
                    HeroTrailerPlayerSurface(
                        sourceUrl = heroTrailerSourceUrl,
                        sourceAudioUrl = heroTrailerSourceAudioUrl,
                        playWhenReady = heroTrailerPlayWhenReady,
                        muted = heroTrailerMuted,
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                alpha = trailerAlpha
                                translationY = scrollOffset * 0.5f
                                scaleX = backdropScale
                                scaleY = backdropScale
                            },
                        onReady = onHeroTrailerReady,
                        onEnded = onHeroTrailerEnded,
                        onError = onHeroTrailerError,
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clickable(
                                enabled = heroTrailerReady,
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = onHeroTrailerMuteToggle,
                            ),
                    )
                    AnimatedContent(
                        targetState = heroTrailerMuted,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(
                                top = heroChromeTopPadding,
                                end = if (isTablet) 32.dp else 22.dp,
                            )
                            .graphicsLayer {
                                alpha = trailerAlpha * 0.72f
                            },
                        transitionSpec = {
                            (fadeIn(animationSpec = tween(120)) + scaleIn(
                                initialScale = 0.82f,
                                animationSpec = tween(160),
                            )) togetherWith (fadeOut(animationSpec = tween(90)) + scaleOut(
                                targetScale = 1.12f,
                                animationSpec = tween(100),
                            ))
                        },
                        label = "detail_hero_trailer_mute_icon",
                    ) { muted ->
                        Icon(
                            imageVector = if (muted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(muteIconSize),
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(260.dp)
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Transparent,
                                    MaterialTheme.colorScheme.background.copy(alpha = 0.7f),
                                    MaterialTheme.colorScheme.background,
                                ),
                            ),
                        ),
                )

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = if (isTablet) 32.dp else 18.dp)
                        .padding(bottom = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (meta.logo != null) {
                        AsyncImage(
                            model = meta.logo,
                            contentDescription = stringResource(Res.string.detail_logo_content_description, meta.name),
                            modifier = Modifier
                                .fillMaxWidth(if (isTablet) 0.56f else 0.6f)
                                .widthIn(max = contentMaxWidth)
                                .height(if (isTablet) 72.dp else 80.dp),
                            alignment = Alignment.Center,
                            contentScale = ContentScale.Fit,
                        )
                    } else {
                        Text(
                            text = meta.name,
                            style = if (isTablet) MaterialTheme.typography.displaySmall else MaterialTheme.typography.displayLarge,
                            color = MaterialTheme.colorScheme.onBackground,
                            textAlign = TextAlign.Center,
                        )
                    }

                    if (meta.genres.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = meta.genres.take(3).joinToString(" \u2022 "),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

private fun detailHeroHeight(maxWidth: Dp, viewportHeight: Dp, isTablet: Boolean): Dp =
    if (!isTablet) {
        (maxWidth * 1.33f).coerceIn(420.dp, 760.dp)
    } else {
        val viewportLimit = viewportHeight
            .takeIf { it > 0.dp }
            ?.let { it * 0.72f }
            ?: 1080.dp
        minOf(maxWidth * 9f / 16f, viewportLimit).coerceIn(420.dp, 1080.dp)
    }
