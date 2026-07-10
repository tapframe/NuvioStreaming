package com.nuvio.app.features.home.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.nuvio.app.core.format.formatReleaseDateForDisplay
import com.nuvio.app.features.home.MetaPreview
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource
import kotlin.math.abs
import kotlin.math.roundToInt

private const val HERO_BACKGROUND_PARALLAX = 0.055f
private const val HERO_BACKGROUND_SCALE = 1.14f
private const val HERO_CONTENT_PARALLAX = 0.18f
private const val HERO_SCROLL_PARALLAX = 0.3f
private const val HERO_SCROLL_DOWN_SCALE_MULTIPLIER = 0.0001f
private const val HERO_SCROLL_UP_SCALE_MULTIPLIER = 0.002f
private const val HERO_SCROLL_MAX_SCALE = 1.3f
private const val HERO_SWIPE_THRESHOLD_FRACTION = 0.16f
private const val HERO_SWIPE_VELOCITY_THRESHOLD = 300f
private const val MOBILE_HERO_VIEWPORT_RATIO = 0.82f
private const val MOBILE_HERO_MIN_HEIGHT_DP = 360f
private const val MOBILE_HERO_MAX_HEIGHT_DP = 760f

internal data class HomeHeroLayout(
    val isTablet: Boolean,
    val heroHeight: Dp,
    val contentMaxWidth: Dp,
    val contentWidthFraction: Float,
    val contentHorizontalPadding: Dp,
    val contentVerticalPadding: Dp,
    val bottomFadeHeight: Dp,
    val logoWidthFraction: Float,
)

@Composable
fun HomeHeroSection(
    items: List<MetaPreview>,
    modifier: Modifier = Modifier,
    viewportHeight: Dp? = null,
    mobileBelowSectionHeightHint: Dp? = null,
    listState: LazyListState? = null,
    onItemClick: ((MetaPreview) -> Unit)? = null,
) {
    if (items.isEmpty()) return

    val pagerState = rememberPagerState(pageCount = { items.size })
    val coroutineScope = rememberCoroutineScope()
    var pagerDragActive by remember { mutableStateOf(false) }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .homeHeroPagerGesture(
                pagerState = pagerState,
                itemCount = items.size,
                coroutineScope = coroutineScope,
                onDragActiveChange = { pagerDragActive = it },
            )
            .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp)),
    ) {
        val layout = homeHeroLayout(
            maxWidthDp = maxWidth.value,
            viewportHeightDp = viewportHeight?.value,
            mobileBelowSectionHeightHintDp = mobileBelowSectionHeightHint?.value,
        )
        val heroWidthPx = with(LocalDensity.current) { maxWidth.toPx() }
        val heroHeightPx = with(LocalDensity.current) { layout.heroHeight.toPx() }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(layout.heroHeight),
        ) {
            HorizontalPager(
                state = pagerState,
                userScrollEnabled = false,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = 0.01f },
            ) {
                Box(modifier = Modifier.fillMaxSize())
            }

            Box(
                modifier = Modifier.fillMaxSize(),
            ) {
                HeroBackgroundLayers(
                    items = items,
                    pagerState = pagerState,
                    listState = listState,
                    layout = layout,
                    heroWidthPx = heroWidthPx,
                    heroHeightPx = heroHeightPx,
                    includePagerNeighbors = pagerDragActive,
                )

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.background.copy(alpha = 0.02f),
                                    MaterialTheme.colorScheme.background.copy(alpha = 0.12f),
                                    MaterialTheme.colorScheme.background.copy(alpha = 0.34f),
                                    MaterialTheme.colorScheme.background.copy(alpha = 0.78f),
                                ),
                            ),
                        ),
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(layout.bottomFadeHeight)
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    MaterialTheme.colorScheme.background.copy(alpha = 0f),
                                    MaterialTheme.colorScheme.background,
                                ),
                            ),
                        ),
                )

                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(
                            horizontal = layout.contentHorizontalPadding,
                            vertical = layout.contentVerticalPadding,
                        ),
                    horizontalAlignment = if (layout.isTablet) Alignment.Start else Alignment.CenterHorizontally,
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(layout.contentWidthFraction)
                            .widthIn(max = layout.contentMaxWidth),
                        contentAlignment = if (layout.isTablet) Alignment.CenterStart else Alignment.Center,
                    ) {
                        HeroContentLayers(
                            items = items,
                            pagerState = pagerState,
                            layout = layout,
                            heroWidthPx = heroWidthPx,
                            onItemClick = onItemClick,
                            includePagerNeighbors = pagerDragActive,
                        )
                    }

                    if (!layout.isTablet) {
                        Spacer(modifier = Modifier.height(14.dp))
                        Surface(
                            modifier = Modifier
                                .clickable(enabled = onItemClick != null) {
                                    onItemClick?.invoke(currentHeroItem(items, pagerState))
                                },
                            color = MaterialTheme.colorScheme.onBackground,
                            contentColor = MaterialTheme.colorScheme.background,
                            shape = RoundedCornerShape(40.dp),
                        ) {
                            Text(
                                text = stringResource(Res.string.home_view_details),
                                modifier = Modifier.padding(horizontal = 28.dp, vertical = 12.dp),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }

                    if (items.size > 1) {
                        Spacer(modifier = Modifier.height(if (layout.isTablet) 14.dp else 12.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            items.forEachIndexed { index, _ ->
                                HeroPageIndicatorDot(
                                    pagerState = pagerState,
                                    page = index,
                                    onClick = {
                                        coroutineScope.launch {
                                            pagerState.animateScrollToPage(index)
                                        }
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
private fun HeroBackgroundLayers(
    items: List<MetaPreview>,
    pagerState: PagerState,
    listState: LazyListState?,
    layout: HomeHeroLayout,
    heroWidthPx: Float,
    heroHeightPx: Float,
    includePagerNeighbors: Boolean,
) {
    val layerPages = rememberHeroLayerPages(
        pagerState = pagerState,
        itemCount = items.size,
        includePagerNeighbors = includePagerNeighbors,
    )

    layerPages.forEach { page ->
        val item = items[page]
        AsyncImage(
            model = item.banner ?: item.poster,
            contentDescription = item.name,
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    val pageOffset = heroPageOffset(pagerState, page)
                    val scrollOffsetPx = heroScrollOffsetPx(listState, heroHeightPx)
                    val scrollScale = heroBackgroundScrollScale(scrollOffsetPx)

                    alpha = heroPageVisibility(pageOffset)
                    translationX = -pageOffset * heroWidthPx * HERO_BACKGROUND_PARALLAX
                    translationY = heroBackgroundScrollTranslationY(scrollOffsetPx)
                    scaleX = HERO_BACKGROUND_SCALE * scrollScale
                    scaleY = HERO_BACKGROUND_SCALE * scrollScale
                },
            alignment = if (layout.isTablet) Alignment.TopCenter else Alignment.Center,
            contentScale = ContentScale.Crop,
        )
    }
}

@Composable
private fun HeroContentLayers(
    items: List<MetaPreview>,
    pagerState: PagerState,
    layout: HomeHeroLayout,
    heroWidthPx: Float,
    onItemClick: ((MetaPreview) -> Unit)?,
    includePagerNeighbors: Boolean,
) {
    val layerPages = rememberHeroLayerPages(
        pagerState = pagerState,
        itemCount = items.size,
        includePagerNeighbors = includePagerNeighbors,
    )

    layerPages.forEach { page ->
        Box(
            modifier = Modifier.graphicsLayer {
                val pageOffset = heroPageOffset(pagerState, page)

                alpha = heroPageVisibility(pageOffset)
                translationX = -pageOffset * heroWidthPx * HERO_CONTENT_PARALLAX
            },
        ) {
            HeroContentBlock(
                item = items[page],
                layout = layout,
                onItemClick = onItemClick,
            )
        }
    }
}

@Composable
private fun rememberHeroLayerPages(
    pagerState: PagerState,
    itemCount: Int,
    includePagerNeighbors: Boolean,
): List<Int> {
    if (itemCount <= 0) return emptyList()

    val currentPage = pagerState.currentPage.coerceIn(0, itemCount - 1)
    val includeNeighbors = includePagerNeighbors || pagerState.isScrollInProgress
    return remember(currentPage, includeNeighbors, itemCount) {
        heroLayerPages(
            currentPage = currentPage,
            itemCount = itemCount,
            includeNeighbors = includeNeighbors,
        )
    }
}

private fun heroLayerPages(
    currentPage: Int,
    itemCount: Int,
    includeNeighbors: Boolean,
): List<Int> {
    if (!includeNeighbors || itemCount == 1) return listOf(currentPage)

    val neighbors = listOf(currentPage - 1, currentPage + 1)
        .map { page -> page.coerceIn(0, itemCount - 1) }
        .filter { page -> page != currentPage }
        .distinct()
    return neighbors + currentPage
}

private fun heroPageOffset(
    pagerState: PagerState,
    page: Int,
): Float = (pagerState.currentPage - page) + pagerState.currentPageOffsetFraction

private fun heroPageVisibility(
    pagerState: PagerState,
    page: Int,
): Float = heroPageVisibility(heroPageOffset(pagerState, page))

private fun heroPageVisibility(pageOffset: Float): Float = (1f - abs(pageOffset)).coerceIn(0f, 1f)

private fun currentHeroItem(
    items: List<MetaPreview>,
    pagerState: PagerState,
): MetaPreview {
    val currentPage = pagerState.currentPage.coerceIn(0, items.lastIndex)
    val currentVisiblePages = heroLayerPages(
        currentPage = currentPage,
        itemCount = items.size,
        includeNeighbors = true,
    )
    val selectedPage = currentVisiblePages.maxBy { page ->
        heroPageVisibility(pagerState, page)
    }
    return items[selectedPage]
}

@Composable
private fun HeroPageIndicatorDot(
    pagerState: PagerState,
    page: Int,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clickable(onClick = onClick)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.onBackground)
            .graphicsLayer {
                val activeFraction = heroPageVisibility(pagerState, page)
                alpha = 0.35f + (0.57f * activeFraction)
            }
            .heroPageIndicatorSize(pagerState = pagerState, page = page),
    )
}

private fun Modifier.heroPageIndicatorSize(
    pagerState: PagerState,
    page: Int,
): Modifier = layout { measurable, constraints ->
    val activeFraction = heroPageVisibility(pagerState, page)
    val widthPx = (8.dp.toPx() + (24.dp.toPx() * activeFraction)).roundToInt()
    val heightPx = 8.dp.roundToPx()
    val constrainedWidth = widthPx.coerceIn(constraints.minWidth, constraints.maxWidth)
    val constrainedHeight = heightPx.coerceIn(constraints.minHeight, constraints.maxHeight)
    val placeable = measurable.measure(
        constraints.copy(
            minWidth = constrainedWidth,
            maxWidth = constrainedWidth,
            minHeight = constrainedHeight,
            maxHeight = constrainedHeight,
        ),
    )

    layout(constrainedWidth, constrainedHeight) {
        placeable.place(0, 0)
    }
}

@Composable
fun HomeHeroReservedSpace(
    modifier: Modifier = Modifier,
    viewportHeight: Dp? = null,
    mobileBelowSectionHeightHint: Dp? = null,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp)),
    ) {
        val layout = homeHeroLayout(
            maxWidthDp = maxWidth.value,
            viewportHeightDp = viewportHeight?.value,
            mobileBelowSectionHeightHintDp = mobileBelowSectionHeightHint?.value,
        )

        Spacer(
            modifier = Modifier
                .fillMaxWidth()
                .height(layout.heroHeight),
        )
    }
}

@Composable
private fun HeroContentBlock(
    item: MetaPreview,
    layout: HomeHeroLayout,
    onItemClick: ((MetaPreview) -> Unit)?,
) {
    var logoLoadError by remember(item.type, item.id, item.logo) {
        mutableStateOf(false)
    }
    val logoUrl = item.logo?.takeIf { it.isNotBlank() }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (layout.isTablet) Alignment.Start else Alignment.CenterHorizontally,
    ) {
        if (logoUrl != null && !logoLoadError) {
            AsyncImage(
                model = logoUrl,
                contentDescription = item.name,
                modifier = Modifier
                    .fillMaxWidth(layout.logoWidthFraction)
                    .aspectRatio(2.6f)
                    .clickable(enabled = onItemClick != null) {
                        onItemClick?.invoke(item)
                    },
                alignment = if (layout.isTablet) Alignment.CenterStart else Alignment.Center,
                contentScale = ContentScale.Fit,
                onError = { logoLoadError = true },
            )
        } else {
            Text(
                text = item.name,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = onItemClick != null) {
                        onItemClick?.invoke(item)
                    },
                style = if (layout.isTablet) {
                    MaterialTheme.typography.displaySmall
                } else {
                    MaterialTheme.typography.displaySmall
                },
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Black,
                textAlign = if (layout.isTablet) TextAlign.Start else TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Spacer(modifier = Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = if (layout.isTablet) {
                Arrangement.spacedBy(8.dp, Alignment.Start)
            } else {
                Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
            },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HeroMetaText(text = item.type.replaceFirstChar(Char::uppercase))
            item.genres.firstOrNull()?.let { genre ->
                HeroMetaDot()
                HeroMetaText(text = genre)
            }
            item.releaseInfo?.takeIf { it.isNotBlank() }?.let { info ->
                HeroMetaDot()
                HeroMetaText(text = formatReleaseDateForDisplay(info))
            }
        }
    }
}

@Composable
private fun HeroMetaText(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onBackground,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

internal fun homeHeroLayout(
    maxWidthDp: Float,
    viewportHeightDp: Float? = null,
    mobileBelowSectionHeightHintDp: Float? = null,
): HomeHeroLayout =
    when {
        maxWidthDp >= 1200f -> HomeHeroLayout(
            isTablet = true,
            heroHeight = (maxWidthDp * 0.42f).dp.coerceIn(360.dp, 440.dp),
            contentMaxWidth = 640.dp,
            contentWidthFraction = 0.56f,
            contentHorizontalPadding = 56.dp,
            contentVerticalPadding = 22.dp,
            bottomFadeHeight = 190.dp,
            logoWidthFraction = 0.58f,
        )
        maxWidthDp >= 840f -> HomeHeroLayout(
            isTablet = true,
            heroHeight = (maxWidthDp * 0.46f).dp.coerceIn(340.dp, 420.dp),
            contentMaxWidth = 560.dp,
            contentWidthFraction = 0.62f,
            contentHorizontalPadding = 40.dp,
            contentVerticalPadding = 20.dp,
            bottomFadeHeight = 180.dp,
            logoWidthFraction = 0.56f,
        )
        maxWidthDp >= 600f -> HomeHeroLayout(
            isTablet = true,
            heroHeight = (maxWidthDp * 0.58f).dp.coerceIn(320.dp, 380.dp),
            contentMaxWidth = 520.dp,
            contentWidthFraction = 0.72f,
            contentHorizontalPadding = 32.dp,
            contentVerticalPadding = 18.dp,
            bottomFadeHeight = 170.dp,
            logoWidthFraction = 0.54f,
        )
        else -> HomeHeroLayout(
            isTablet = false,
            heroHeight = mobileHeroHeight(
                maxWidthDp = maxWidthDp,
                viewportHeightDp = viewportHeightDp,
                mobileBelowSectionHeightHintDp = mobileBelowSectionHeightHintDp,
            ),
            contentMaxWidth = 480.dp,
            contentWidthFraction = 1f,
            contentHorizontalPadding = 24.dp,
            contentVerticalPadding = 16.dp,
            bottomFadeHeight = 220.dp,
            logoWidthFraction = 0.62f,
        )
    }

private fun mobileHeroHeight(
    maxWidthDp: Float,
    viewportHeightDp: Float?,
    mobileBelowSectionHeightHintDp: Float?,
): Dp {
    val viewportDrivenHeight = viewportHeightDp?.let { (it * MOBILE_HERO_VIEWPORT_RATIO).dp }
    val widthFallbackHeight = (maxWidthDp * 1.16f).dp
    val baseHeight = viewportDrivenHeight ?: widthFallbackHeight

    val maxAllowedFromViewportDp = if (viewportHeightDp != null && mobileBelowSectionHeightHintDp != null) {
        viewportHeightDp - mobileBelowSectionHeightHintDp
    } else {
        null
    }
    val cappedHeight = if (maxAllowedFromViewportDp != null) {
        val maxAllowedFromViewport = maxAllowedFromViewportDp.dp
        baseHeight.coerceAtMost(maxAllowedFromViewport)
    } else {
        baseHeight
    }
    val minHeight = if (maxAllowedFromViewportDp != null) {
        minOf(MOBILE_HERO_MIN_HEIGHT_DP, maxAllowedFromViewportDp.coerceAtLeast(0f)).dp
    } else {
        MOBILE_HERO_MIN_HEIGHT_DP.dp
    }

    return cappedHeight.coerceIn(minHeight, MOBILE_HERO_MAX_HEIGHT_DP.dp)
}

@Composable
private fun HeroMetaDot() {
    Box(
        modifier = Modifier
            .size(4.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)),
    )
}

private fun heroScrollOffsetPx(
    listState: LazyListState?,
    heroHeightPx: Float,
): Float = when {
    listState == null -> 0f
    listState.firstVisibleItemIndex > 0 -> heroHeightPx
    else -> listState.firstVisibleItemScrollOffset.toFloat()
}

private fun heroBackgroundScrollScale(scrollOffsetPx: Float): Float {
    val scaleIncrease = if (scrollOffsetPx < 0f) {
        abs(scrollOffsetPx) * HERO_SCROLL_UP_SCALE_MULTIPLIER
    } else {
        scrollOffsetPx * HERO_SCROLL_DOWN_SCALE_MULTIPLIER
    }
    return (1f + scaleIncrease).coerceAtMost(HERO_SCROLL_MAX_SCALE)
}

private fun heroBackgroundScrollTranslationY(scrollOffsetPx: Float): Float {
    return scrollOffsetPx * HERO_SCROLL_PARALLAX
}

private fun Modifier.homeHeroPagerGesture(
    pagerState: PagerState,
    itemCount: Int,
    coroutineScope: CoroutineScope,
    onDragActiveChange: (Boolean) -> Unit,
): Modifier {
    if (itemCount <= 1) return this

    return pointerInput(pagerState, itemCount) {
        awaitEachGesture {
            val down = awaitFirstDown(pass = PointerEventPass.Initial)
            val widthPx = size.width.toFloat().takeIf { it > 0f } ?: return@awaitEachGesture
            val velocityTracker = VelocityTracker().apply {
                addPosition(down.uptimeMillis, down.position)
            }
            val startPage = pagerState.currentPage
            var totalDx = 0f
            var totalDy = 0f
            var dragging = false
            var settleAnimationStarted = false

            try {
                while (true) {
                    val event = awaitPointerEvent(pass = PointerEventPass.Initial)
                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                    velocityTracker.addPosition(change.uptimeMillis, change.position)

                    if (!change.pressed) {
                        if (dragging) {
                            val targetPage = resolveHeroTargetPage(
                                startPage = startPage,
                                itemCount = itemCount,
                                totalDx = totalDx,
                                velocityX = velocityTracker.calculateVelocity().x,
                                widthPx = widthPx,
                            )
                            settleAnimationStarted = true
                            coroutineScope.launch {
                                try {
                                    pagerState.animateScrollToPage(targetPage)
                                } finally {
                                    onDragActiveChange(false)
                                }
                            }
                        }
                        break
                    }

                    val delta = change.position - change.previousPosition
                    totalDx += delta.x
                    totalDy += delta.y

                    if (!dragging) {
                        val horizontalDrag =
                            abs(totalDx) > viewConfiguration.touchSlop && abs(totalDx) > abs(totalDy)
                        val verticalDrag =
                            abs(totalDy) > viewConfiguration.touchSlop && abs(totalDy) > abs(totalDx)

                        when {
                            verticalDrag -> break
                            horizontalDrag -> {
                                dragging = true
                                onDragActiveChange(true)
                            }
                            else -> continue
                        }
                    }

                    pagerState.dispatchRawDelta(-delta.x)
                    change.consume()
                }
            } finally {
                if (dragging && !settleAnimationStarted) {
                    onDragActiveChange(false)
                }
            }
        }
    }
}

private fun resolveHeroTargetPage(
    startPage: Int,
    itemCount: Int,
    totalDx: Float,
    velocityX: Float,
    widthPx: Float,
): Int {
    val thresholdPassed = abs(totalDx) > widthPx * HERO_SWIPE_THRESHOLD_FRACTION ||
        abs(velocityX) > HERO_SWIPE_VELOCITY_THRESHOLD
    if (!thresholdPassed) return startPage

    val currentPage = startPage.coerceIn(0, itemCount - 1)
    return when {
        totalDx > 0f -> if (currentPage == 0) itemCount - 1 else currentPage - 1
        totalDx < 0f -> if (currentPage == itemCount - 1) 0 else currentPage + 1
        else -> currentPage
    }
}
