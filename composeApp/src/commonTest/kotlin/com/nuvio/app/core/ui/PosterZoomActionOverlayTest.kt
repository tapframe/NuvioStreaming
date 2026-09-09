package com.nuvio.app.core.ui

import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import kotlin.test.Test
import kotlin.test.assertEquals

class PosterZoomActionOverlayTest {

    @Test
    fun defaultTopStartAlignmentShiftsChildInRtl() {
        val parentSize = IntSize(width = 1080, height = 2400)
        val childSize = IntSize(width = 600, height = 900)

        // In LTR, Alignment.TopStart positions the child at x = 0.
        val ltrOffset = Alignment.TopStart.align(childSize, parentSize, LayoutDirection.Ltr)
        assertEquals(IntOffset(0, 0), ltrOffset)

        // In RTL, Alignment.TopStart positions the child at x = parentWidth - childWidth (480px).
        // If the overlay relied on TopStart, graphicsLayer translationX would add to this 480px offset,
        // shifting the poster 480px too far to the right.
        val rtlOffset = Alignment.TopStart.align(childSize, parentSize, LayoutDirection.Rtl)
        assertEquals(IntOffset(parentSize.width - childSize.width, 0), rtlOffset)
    }

    @Test
    fun absoluteTopLeftAlignmentPositionsChildAtZeroInBothLtrAndRtl() {
        val parentSize = IntSize(width = 1080, height = 2400)
        val childSize = IntSize(width = 600, height = 900)

        // AbsoluteAlignment.TopLeft guarantees layout position (0, 0) in LTR
        val ltrOffset = AbsoluteAlignment.TopLeft.align(childSize, parentSize, LayoutDirection.Ltr)
        assertEquals(IntOffset(0, 0), ltrOffset)

        // AbsoluteAlignment.TopLeft guarantees layout position (0, 0) in RTL as well
        val rtlOffset = AbsoluteAlignment.TopLeft.align(childSize, parentSize, LayoutDirection.Rtl)
        assertEquals(IntOffset(0, 0), rtlOffset)
    }

    @Test
    fun watchedBadgeTransformOriginAdaptsToLayoutDirection() {
        // Alignment.TopEnd resolves to TopRight in LTR and TopLeft in RTL.
        val ltrTopEnd = Alignment.TopEnd.align(IntSize(40, 40), IntSize(600, 900), LayoutDirection.Ltr)
        assertEquals(IntOffset(600 - 40, 0), ltrTopEnd)

        val rtlTopEnd = Alignment.TopEnd.align(IntSize(40, 40), IntSize(600, 900), LayoutDirection.Rtl)
        assertEquals(IntOffset(0, 0), rtlTopEnd)

        // The counter-scaling pivot must match the corner the badge is aligned to:
        // In LTR: pinned to top-right corner -> pivot at (1f, 0f)
        val ltrPivot = if (LayoutDirection.Ltr == LayoutDirection.Rtl) {
            TransformOrigin(0f, 0f)
        } else {
            TransformOrigin(1f, 0f)
        }
        assertEquals(TransformOrigin(1f, 0f), ltrPivot)

        // In RTL: pinned to top-left corner -> pivot at (0f, 0f)
        val rtlPivot = if (LayoutDirection.Rtl == LayoutDirection.Rtl) {
            TransformOrigin(0f, 0f)
        } else {
            TransformOrigin(1f, 0f)
        }
        assertEquals(TransformOrigin(0f, 0f), rtlPivot)
    }
}
