package com.nuvio.app.core.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Keeps the initial horizontal inset while allowing a horizontal scroller's
 * content to move through that inset once scrolling starts.
 */
fun Modifier.nuvioHorizontalScrollBleed(horizontalPadding: Dp): Modifier {
    if (horizontalPadding <= 0.dp) return this

    return layout { measurable, constraints ->
        if (!constraints.hasBoundedWidth) {
            val placeable = measurable.measure(constraints)
            return@layout layout(placeable.width, placeable.height) {
                placeable.placeRelative(0, 0)
            }
        }

        val paddingPx = horizontalPadding.roundToPx()
        if (paddingPx == 0) {
            val placeable = measurable.measure(constraints)
            return@layout layout(placeable.width, placeable.height) {
                placeable.placeRelative(0, 0)
            }
        }

        val visibleWidth = constraints.maxWidth
        val expandedWidth = visibleWidth + paddingPx * 2
        val expandedConstraints = Constraints(
            minWidth = expandedWidth,
            maxWidth = expandedWidth,
            minHeight = constraints.minHeight,
            maxHeight = constraints.maxHeight,
        )
        val placeable = measurable.measure(expandedConstraints)

        layout(visibleWidth, placeable.height) {
            placeable.placeRelative(-paddingPx, 0)
        }
    }
}
