package com.nuvio.app.features.p2p

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.player_torrent_stats
import org.jetbrains.compose.resources.stringResource

@Composable
fun P2pStatsOverlay(
    visible: Boolean,
    downloadSpeed: Long,
    uploadSpeed: Long,
    peers: Int,
    seeds: Int,
    totalProgress: Float,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .background(
                    color = Color.Black.copy(alpha = 0.7f),
                    shape = RoundedCornerShape(8.dp),
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "P2P",
                    color = Color(0xFF4CAF50),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "↓ ${formatP2pSpeed(downloadSpeed)}",
                    color = Color.White,
                    fontSize = 11.sp,
                )
                Text(
                    text = "↑ ${formatP2pSpeed(uploadSpeed)}",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 11.sp,
                )
            }
            Text(
                text = stringResource(
                    Res.string.player_torrent_stats,
                    peers,
                    seeds,
                    (totalProgress * 100).toInt(),
                ),
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 10.sp,
            )
        }
    }
}

@Composable
fun P2pLoadingStatus(
    message: String?,
    progress: Float?,
    modifier: Modifier = Modifier,
    visible: Boolean = message != null || progress != null,
) {
    if (!visible) return

    Column(
        modifier = modifier
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!message.isNullOrBlank()) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.78f),
            )
        }
        if (progress != null) {
            Box(
                modifier = Modifier
                    .width(200.dp)
                    .height(3.dp)
                    .background(
                        color = Color.White.copy(alpha = 0.2f),
                        shape = RoundedCornerShape(2.dp),
                    ),
            ) {
                Box(
                    modifier = Modifier
                        .width(200.dp * progress.coerceIn(0f, 1f))
                        .height(3.dp)
                        .background(
                            color = Color.White.copy(alpha = 0.85f),
                            shape = RoundedCornerShape(2.dp),
                        ),
                )
            }
        }
    }
}
