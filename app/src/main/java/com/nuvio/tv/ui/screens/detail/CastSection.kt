package com.nuvio.tv.ui.screens.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.CircleShape
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.nuvio.tv.domain.model.MetaCastMember
import com.nuvio.tv.ui.components.FadeInAsyncImage
import com.nuvio.tv.ui.theme.NuvioColors

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun CastSection(
    cast: List<MetaCastMember>,
    modifier: Modifier = Modifier
) {
    if (cast.isEmpty()) return

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 20.dp, bottom = 8.dp)
    ) {
        Text(
            text = "Cast",
            style = MaterialTheme.typography.titleLarge,
            color = NuvioColors.TextPrimary,
            modifier = Modifier.padding(horizontal = 48.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        TvLazyRow(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 48.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(
                items = cast,
                key = { member ->
                    member.name + "|" + (member.character ?: "") + "|" + (member.photo ?: "")
                }
            ) { member ->
                CastMemberItem(member = member)
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun CastMemberItem(
    member: MetaCastMember
) {
    Column(
        modifier = Modifier.width(120.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Card(
            onClick = { /* no-op (for focus + row scrolling) */ },
            modifier = Modifier
                .size(72.dp),
            shape = CardDefaults.shape(
                shape = CircleShape
            ),
            colors = CardDefaults.colors(
                containerColor = NuvioColors.SurfaceVariant,
                focusedContainerColor = NuvioColors.FocusBackground
            ),
            border = CardDefaults.border(
                focusedBorder = Border(
                    border = androidx.compose.foundation.BorderStroke(2.dp, NuvioColors.FocusRing),
                    shape = CircleShape
                )
            )
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                contentAlignment = Alignment.Center
            ) {
                val photo = member.photo
                if (!photo.isNullOrBlank()) {
                    FadeInAsyncImage(
                        model = photo,
                        contentDescription = member.name,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Text(
                        text = member.name.firstOrNull()?.uppercase() ?: "?",
                        style = MaterialTheme.typography.titleLarge,
                        color = NuvioColors.TextPrimary
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Text(
            text = member.name,
            style = MaterialTheme.typography.labelMedium,
            color = NuvioColors.TextSecondary,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )

        val character = member.character
        if (!character.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = character,
                style = MaterialTheme.typography.labelSmall,
                color = NuvioColors.TextTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
