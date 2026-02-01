package com.nuvio.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Glow
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.nuvio.tv.domain.model.MetaPreview
import com.nuvio.tv.domain.model.PosterShape
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.theme.NuvioTheme

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ContentCard(
    item: MetaPreview,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit = {}
) {
    var isFocused by remember { mutableStateOf(false) }

    val cardWidth = when (item.posterShape) {
        PosterShape.POSTER -> 140.dp
        PosterShape.LANDSCAPE -> 260.dp
        PosterShape.SQUARE -> 170.dp
    }
    val cardHeight = when (item.posterShape) {
        PosterShape.POSTER -> 210.dp
        PosterShape.LANDSCAPE -> 148.dp
        PosterShape.SQUARE -> 170.dp
    }

    Column(
        modifier = modifier.width(cardWidth)
    ) {
        Card(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (focusRequester != null) Modifier.focusRequester(focusRequester)
                    else Modifier
                )
                .onFocusChanged { isFocused = it.isFocused },
            shape = CardDefaults.shape(
                shape = RoundedCornerShape(8.dp)
            ),
            colors = CardDefaults.colors(
                containerColor = NuvioColors.BackgroundCard,
                focusedContainerColor = NuvioColors.BackgroundCard
            ),
            border = CardDefaults.border(
                focusedBorder = Border(
                    border = BorderStroke(3.dp, NuvioColors.FocusRing),
                    shape = RoundedCornerShape(8.dp)
                )
            ),
            scale = CardDefaults.scale(
                focusedScale = 1.08f
            ),
            glow = CardDefaults.glow(
                focusedGlow = Glow(
                    elevation = 8.dp,
                    elevationColor = NuvioColors.FocusRing.copy(alpha = 0.3f)
                )
            )
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(cardHeight)
                    .clip(RoundedCornerShape(8.dp))
            ) {
                AsyncImage(
                    model = item.poster,
                    contentDescription = item.name,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
        ) {
            Text(
                text = item.name,
                style = MaterialTheme.typography.titleMedium,
                color = NuvioColors.TextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            item.releaseInfo?.let { release ->
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = release,
                    style = MaterialTheme.typography.labelMedium,
                    color = NuvioTheme.extendedColors.textSecondary,
                    maxLines = 1
                )
            }
        }
    }
}
