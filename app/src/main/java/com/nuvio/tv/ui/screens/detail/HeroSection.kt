package com.nuvio.tv.ui.screens.detail

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.IconButton
import androidx.tv.material3.IconButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.nuvio.tv.domain.model.Meta
import com.nuvio.tv.domain.model.Video
import com.nuvio.tv.ui.components.FadeInAsyncImage
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.theme.NuvioTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.ui.platform.LocalContext
import coil.decode.SvgDecoder
import coil.request.ImageRequest
import com.nuvio.tv.domain.model.NextToWatch

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun HeroContentSection(
    meta: Meta,
    nextEpisode: Video?,
    nextToWatch: NextToWatch?,
    onPlayClick: () -> Unit,
    isInLibrary: Boolean,
    onToggleLibrary: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(540.dp),
        verticalArrangement = Arrangement.Bottom
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 48.dp, end = 48.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.Bottom
        ) {
            if (meta.logo != null) {
                FadeInAsyncImage(
                    model = meta.logo,
                    contentDescription = meta.name,
                    modifier = Modifier
                        .height(100.dp)
                        .fillMaxWidth(0.4f)
                        .padding(bottom = 16.dp),
                    contentScale = ContentScale.Fit,
                    alignment = Alignment.CenterStart,
                    fadeDurationMs = 500
                )
            } else {
                Text(
                    text = meta.name,
                    style = MaterialTheme.typography.displayMedium,
                    color = NuvioColors.TextPrimary,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                PlayButton(
                    text = nextToWatch?.displayText ?: when {
                        nextEpisode != null -> "Play S${nextEpisode.season}, E${nextEpisode.episode}"
                        else -> "Play"
                    },
                    onClick = onPlayClick
                )

                ActionIconButton(
                    icon = if (isInLibrary) Icons.Default.Check else Icons.Default.Add,
                    contentDescription = if (isInLibrary) "Remove from library" else "Add to library",
                    onClick = onToggleLibrary
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Director/Writer line above description
            val directorLine = meta.director.takeIf { it.isNotEmpty() }?.joinToString(", ")
            val writerLine = meta.writer.takeIf { it.isNotEmpty() }?.joinToString(", ")
            val creditLine = if (!directorLine.isNullOrBlank()) {
                "Director: $directorLine"
            } else if (!writerLine.isNullOrBlank()) {
                "Writer: $writerLine"
            } else {
                null
            }

            if (!creditLine.isNullOrBlank()) {
                Text(
                    text = creditLine,
                    style = MaterialTheme.typography.labelLarge,
                    color = NuvioTheme.extendedColors.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth(0.6f)
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            // Always show series/movie description, not episode description
            if (meta.description != null) {
                Text(
                    text = meta.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = NuvioColors.TextPrimary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth(0.6f)
                        .padding(bottom = 12.dp)
                )
            }

            MetaInfoRow(meta = meta)
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PlayButton(
    text: String,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    Button(
        onClick = onClick,
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused },
        colors = ButtonDefaults.colors(
            containerColor = androidx.compose.ui.graphics.Color.White,
            focusedContainerColor = androidx.compose.ui.graphics.Color.White,
            contentColor = androidx.compose.ui.graphics.Color.Black,
            focusedContentColor = androidx.compose.ui.graphics.Color.Black
        ),
        shape = ButtonDefaults.shape(
            shape = RoundedCornerShape(32.dp)
        ),
        border = ButtonDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = RoundedCornerShape(32.dp)
            )
        ),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 14.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Default.PlayArrow,
                contentDescription = null,
                modifier = Modifier.size(20.dp)
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ActionIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(48.dp)
            .onFocusChanged { isFocused = it.isFocused },
        colors = IconButtonDefaults.colors(
            containerColor = NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.Secondary,
            contentColor = NuvioColors.TextPrimary,
            focusedContentColor = NuvioColors.OnPrimary
        ),
        border = IconButtonDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, NuvioColors.FocusRing),
                shape = CircleShape
            )
        ),
        shape = IconButtonDefaults.shape(
            shape = CircleShape
        )
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(24.dp)
        )
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun MetaInfoRow(meta: Meta) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Primary row: Genres, Runtime, Release, Ratings
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Show all genres
            if (meta.genres.isNotEmpty()) {
                Text(
                    text = meta.genres.joinToString(" • "),
                    style = MaterialTheme.typography.labelLarge,
                    color = NuvioTheme.extendedColors.textSecondary
                )
                MetaInfoDivider()
            }

            // Runtime
            meta.runtime?.let { runtime ->
                Text(
                    text = formatRuntime(runtime),
                    style = MaterialTheme.typography.labelLarge,
                    color = NuvioTheme.extendedColors.textSecondary
                )
                MetaInfoDivider()
            }

            meta.releaseInfo?.let { releaseInfo ->
                Text(
                    text = releaseInfo,
                    style = MaterialTheme.typography.labelLarge,
                    color = NuvioTheme.extendedColors.textSecondary
                )
                MetaInfoDivider()
            }

            meta.imdbRating?.let { rating ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    val context = LocalContext.current
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(com.nuvio.tv.R.raw.imdb_logo_2016)
                            .decoderFactory(SvgDecoder.Factory())
                            .build(),
                        contentDescription = "Rating",
                        modifier = Modifier.size(30.dp),
                        contentScale = ContentScale.Fit
                    )
                    Text(
                        text = String.format("%.1f", rating),
                        style = MaterialTheme.typography.labelLarge,
                        color = NuvioTheme.extendedColors.textSecondary
                    )
                }
            }
        }

        // Secondary row: Country, Language
        val hasSecondaryInfo = meta.country != null || meta.language != null
        if (hasSecondaryInfo) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                meta.country?.let { country ->
                    Text(
                        text = country,
                        style = MaterialTheme.typography.labelMedium,
                        color = NuvioTheme.extendedColors.textTertiary
                    )
                }

                if (meta.country != null && meta.language != null) {
                    MetaInfoDivider()
                }

                meta.language?.let { language ->
                    Text(
                        text = language.uppercase(),
                        style = MaterialTheme.typography.labelMedium,
                        color = NuvioTheme.extendedColors.textTertiary
                    )
                }
            }
        }
    }
}

private fun formatRuntime(runtime: String): String {
    val minutes = runtime.filter { it.isDigit() }.toIntOrNull() ?: return runtime
    return if (minutes >= 60) {
        val hours = minutes / 60
        val mins = minutes % 60
        if (mins > 0) "${hours}h ${mins}m" else "${hours}h"
    } else {
        "${minutes}m"
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun MetaInfoDivider() {
    Text(
        text = "•",
        style = MaterialTheme.typography.labelLarge,
        color = NuvioTheme.extendedColors.textTertiary
    )
}
