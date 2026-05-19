package com.nuvio.app.features.details.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.AppIconResource
import com.nuvio.app.core.ui.appIconPainter
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_play
import nuvio.composeapp.generated.resources.action_save
import nuvio.composeapp.generated.resources.compose_settings_root_downloads_title
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DetailActionButtons(
    modifier: Modifier = Modifier,
    playLabel: String = stringResource(Res.string.action_play),
    saveLabel: String = stringResource(Res.string.action_save),
    isSaved: Boolean = false,
    isTablet: Boolean = false,
    onPlayClick: () -> Unit = {},
    onPlayLongClick: (() -> Unit)? = null,
    onSaveClick: () -> Unit = {},
    onSaveLongClick: (() -> Unit)? = null,
    onDownloadsClick: (() -> Unit)? = null,
) {
    val playPainter = appIconPainter(AppIconResource.PlayerPlay)
    val libraryAddPainter = appIconPainter(AppIconResource.LibraryAddPlus)
    val playShape = RoundedCornerShape(40.dp)
    val downloadsContentDescription = stringResource(Res.string.compose_settings_root_downloads_title)

    BoxWithConstraints(
        modifier = modifier.fillMaxWidth(),
    ) {
        val spacing = 12.dp
        val downloadsButtonSize = 50.dp
        val playButtonWidth: Dp? = if (isTablet) {
            220.dp
        } else if (onDownloadsClick != null) {
            ((maxWidth - spacing) / 2f).coerceAtLeast(0.dp)
        } else {
            null
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = if (isTablet) {
                Arrangement.spacedBy(spacing, Alignment.CenterHorizontally)
            } else {
                Arrangement.spacedBy(spacing)
            },
        ) {
            val playModifier = playButtonWidth?.let { Modifier.width(it) } ?: Modifier.weight(1f)
            val saveModifier = if (isTablet) {
                Modifier.width(220.dp)
            } else {
                Modifier.weight(1f)
            }

            Surface(
                modifier = playModifier.height(50.dp),
                shape = playShape,
                color = MaterialTheme.colorScheme.onBackground,
                contentColor = MaterialTheme.colorScheme.background,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(
                            onClick = onPlayClick,
                            onLongClick = onPlayLongClick,
                            role = Role.Button,
                        )
                        .height(50.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        painter = playPainter,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = playLabel,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Surface(
                modifier = saveModifier.height(50.dp),
                shape = RoundedCornerShape(40.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0f),
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(
                            onClick = onSaveClick,
                            onLongClick = onSaveLongClick,
                            role = Role.Button,
                        )
                        .height(50.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isSaved) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    } else {
                        Icon(
                            painter = libraryAddPainter,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = saveLabel,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            onDownloadsClick?.let { openDownloads ->
                Surface(
                    modifier = Modifier.size(downloadsButtonSize),
                    shape = RoundedCornerShape(40.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0f),
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(
                                onClick = openDownloads,
                                role = Role.Button,
                            )
                            .height(downloadsButtonSize),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Download,
                            contentDescription = downloadsContentDescription,
                            modifier = Modifier.size(20.dp),
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}
