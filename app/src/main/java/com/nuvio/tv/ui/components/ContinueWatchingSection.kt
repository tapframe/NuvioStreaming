package com.nuvio.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.nuvio.tv.domain.model.WatchProgress
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.theme.NuvioTheme
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ContinueWatchingSection(
    items: List<WatchProgress>,
    onItemClick: (WatchProgress) -> Unit,
    modifier: Modifier = Modifier
) {
    if (items.isEmpty()) return

    Column(modifier = modifier) {
        Text(
            text = "Continue Watching",
            style = MaterialTheme.typography.titleLarge,
            color = NuvioColors.TextPrimary,
            modifier = Modifier.padding(start = 48.dp, bottom = 16.dp)
        )

        TvLazyRow(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(
                items = items, 
                key = { progress ->
                    // Create unique key using videoId which is always unique per episode
                    progress.videoId
                }
            ) { progress ->
                ContinueWatchingCard(
                    progress = progress,
                    onClick = { onItemClick(progress) }
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ContinueWatchingCard(
    progress: WatchProgress,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    Card(
        onClick = onClick,
        modifier = Modifier
            .width(320.dp)
            .onFocusChanged { isFocused = it.isFocused },
        shape = CardDefaults.shape(
            shape = RoundedCornerShape(12.dp)
        ),
        colors = CardDefaults.colors(
            containerColor = NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.BackgroundCard
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(12.dp)
            )
        ),
        scale = CardDefaults.scale(
            focusedScale = 1.05f
        )
    ) {
        Column {
            // Thumbnail with progress overlay
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
            ) {
                // Background image
                AsyncImage(
                    model = progress.backdrop ?: progress.poster,
                    contentDescription = progress.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )

                // Gradient overlay for text readability
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colorStops = arrayOf(
                                    0.0f to Color.Transparent,
                                    0.5f to Color.Transparent,
                                    0.8f to NuvioColors.Background.copy(alpha = 0.7f),
                                    1.0f to NuvioColors.Background.copy(alpha = 0.95f)
                                )
                            )
                        )
                )

                // Play icon overlay when focused
                if (isFocused) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.3f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(NuvioColors.Primary)
                                .padding(16.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = "Play",
                                tint = NuvioColors.OnPrimary
                            )
                        }
                    }
                }

                // Content info at bottom
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(12.dp)
                ) {
                    // Episode info (for series)
                    progress.episodeDisplayString?.let { episodeStr ->
                        Text(
                            text = episodeStr,
                            style = MaterialTheme.typography.labelMedium,
                            color = NuvioColors.Primary
                        )
                    }
                    
                    Text(
                        text = progress.name,
                        style = MaterialTheme.typography.titleSmall,
                        color = NuvioColors.TextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Episode title if available
                    progress.episodeTitle?.let { title ->
                        Text(
                            text = title,
                            style = MaterialTheme.typography.bodySmall,
                            color = NuvioTheme.extendedColors.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                // Remaining time badge
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(NuvioColors.Background.copy(alpha = 0.8f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = formatRemainingTime(progress.remainingTime),
                        style = MaterialTheme.typography.labelSmall,
                        color = NuvioColors.TextPrimary
                    )
                }
            }

            // Progress bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .background(NuvioColors.SurfaceVariant)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress.progressPercentage)
                        .height(4.dp)
                        .background(NuvioColors.Primary)
                )
            }
        }
    }
}

private fun formatRemainingTime(remainingMs: Long): String {
    val totalMinutes = TimeUnit.MILLISECONDS.toMinutes(remainingMs)
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    
    return when {
        hours > 0 -> "${hours}h ${minutes}m left"
        minutes > 0 -> "${minutes}m left"
        else -> "Almost done"
    }
}
