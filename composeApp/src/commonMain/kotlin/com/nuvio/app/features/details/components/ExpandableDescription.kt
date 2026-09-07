package com.nuvio.app.features.details.components

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.details_show_less
import nuvio.composeapp.generated.resources.details_show_more
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun ExpandableDescription(
    text: String,
    collapsedMaxLines: Int,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyMedium,
    color: Color = MaterialTheme.colorScheme.onSurface,
) {
    var expanded by remember(text) { mutableStateOf(false) }
    var canExpand by remember(text) { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .animateContentSize()
            .clickable(enabled = canExpand) { expanded = !expanded },
    ) {
        Text(
            text = text,
            style = style,
            color = color,
            maxLines = if (expanded) Int.MAX_VALUE else collapsedMaxLines,
            overflow = TextOverflow.Ellipsis,
            onTextLayout = { result ->
                if (!expanded) {
                    canExpand = result.hasVisualOverflow
                }
            },
        )
        if (canExpand) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = if (expanded) {
                    stringResource(Res.string.details_show_less)
                } else {
                    stringResource(Res.string.details_show_more)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
