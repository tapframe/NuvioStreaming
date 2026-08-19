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
}
