package com.nuvio.app.features.membership

import com.nuvio.app.core.ui.AppTheme
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ThemeAccessTest {
    @Test
    fun memberWithoutSavedThemeDefaultsToGold() {
        val entitlements = CosmeticEntitlements(setOf(CosmeticEntitlement.GOLD_THEME))

        assertEquals(AppTheme.GOLD, resolveAppTheme(null, entitlements))
    }

    @Test
    fun unavailableSupporterThemeFallsBackToWhite() {
        assertEquals(
            AppTheme.WHITE,
            resolveAppTheme(AppTheme.JADE, CosmeticEntitlements.None),
        )
    }

    @Test
    fun availableThemesKeepStandardThemesAndEntitledSupporterThemes() {
        val entitlements = CosmeticEntitlements(setOf(CosmeticEntitlement.ROSE_GOLD_THEME))
        val themes = availableAppThemes(entitlements)

        assertEquals(AppTheme.ROSE_GOLD, themes.first())
        assertTrue(AppTheme.WHITE in themes)
        assertTrue(AppTheme.CRIMSON in themes)
        assertTrue(AppTheme.GOLD !in themes)
    }

    @Test
    fun bothMemberTiersCanUseCustomThemesWithoutAnAdditionalEntitlement() {
        MemberTier.entries.forEach { tier ->
            val themes = availableAppThemes(CosmeticEntitlements.None, tier)

            assertEquals(AppTheme.CUSTOM, themes.first())
            assertEquals(AppTheme.CUSTOM, resolveAppTheme(AppTheme.CUSTOM, CosmeticEntitlements.None, tier))
            assertEquals(AppTheme.WHITE, resolveAppTheme(null, CosmeticEntitlements.None, tier))
        }
    }

    @Test
    fun savedCustomThemeFallsBackOnMembershipLossAndReturnsOnRenewal() {
        val selected = AppTheme.CUSTOM
        val entitlements = CosmeticEntitlements(setOf(CosmeticEntitlement.GOLD_THEME))

        assertTrue(AppTheme.CUSTOM !in availableAppThemes(entitlements))
        assertEquals(AppTheme.WHITE, resolveAppTheme(selected, entitlements))
        assertEquals(AppTheme.CUSTOM, resolveAppTheme(selected, entitlements, MemberTier.SUPPORTER))
    }

    @Test
    fun customThemeFollowsEntitledPresetsAndPrecedesStandardThemes() {
        val themes = availableAppThemes(
            CosmeticEntitlements(setOf(CosmeticEntitlement.GOLD_THEME)),
            MemberTier.SUPPORTER_PLUS,
        )

        assertEquals(listOf(AppTheme.GOLD, AppTheme.CUSTOM, AppTheme.WHITE), themes.take(3))
        assertEquals(themes.size, themes.distinct().size)
    }
}
