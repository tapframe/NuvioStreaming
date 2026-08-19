package com.nuvio.app.features.settings

import androidx.compose.ui.graphics.Color
import com.nuvio.app.features.membership.MemberTier
import kotlin.test.Test
import kotlin.test.assertEquals

class MemberBrandWordmarkTest {
    @Test
    fun supporterBadgeMatchesWebsiteWarmGradient() {
        val style = MemberTier.SUPPORTER.badgeStyle()

        assertEquals("Supporter", style.label)
        assertEquals(
            listOf(
                0f to Color(0xFFD4843D),
                0.5f to Color(0xFFFFDE90),
                1f to Color(0xFFD4843D),
            ),
            style.colorStops,
        )
    }

    @Test
    fun supporterPlusBadgeMatchesWebsiteCoolGradient() {
        val style = MemberTier.SUPPORTER_PLUS.badgeStyle()

        assertEquals("Supporter+", style.label)
        assertEquals(
            listOf(
                0f to Color(0xFF91A8FF),
                0.52f to Color(0xFFF08BD8),
                0.78f to Color(0xFFFF9B8E),
                1f to Color(0xFF91A8FF),
            ),
            style.colorStops,
        )
    }

    @Test
    fun badgeMotionMatchesWebsiteGradientGeometryAndTiming() {
        assertEquals(100f, MemberBadgeGradientAngleDegrees)
        assertEquals(2.4f, MemberBadgeGradientWidthMultiplier)
        assertEquals(2_750, MemberBadgeSweepHalfDurationMs)
    }
}
