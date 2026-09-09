package com.nuvio.app.core.ui

import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame

class FontSelectionTest {

    @Test
    fun resolveFontFamilyReturnsAppFontWhenSystemFontIsDisabled() {
        val appFont = FontFamily.Monospace
        val resolved = resolveFontFamily(useSystemFont = false, appFont = appFont)
        assertSame(appFont, resolved)
    }

    @Test
    fun resolveFontFamilyReturnsDefaultFontWhenSystemFontIsEnabled() {
        val appFont = FontFamily.Monospace
        val resolved = resolveFontFamily(useSystemFont = true, appFont = appFont)
        assertSame(FontFamily.Default, resolved)
    }

    @Test
    fun createNuvioTypographyPreservesAllPropertiesWithGivenFont() {
        val testFont = FontFamily.Cursive
        val typography = createNuvioTypography(testFont)

        // Verify font family on all 8 configured styles
        assertEquals(testFont, typography.displayLarge.fontFamily)
        assertEquals(testFont, typography.headlineLarge.fontFamily)
        assertEquals(testFont, typography.titleLarge.fontFamily)
        assertEquals(testFont, typography.titleMedium.fontFamily)
        assertEquals(testFont, typography.bodyLarge.fontFamily)
        assertEquals(testFont, typography.bodyMedium.fontFamily)
        assertEquals(testFont, typography.labelLarge.fontFamily)
        assertEquals(testFont, typography.labelMedium.fontFamily)

        // Verify typography properties are strictly preserved
        assertEquals(NuvioTokens.Type.pageDisplay, typography.displayLarge.fontSize)
        assertEquals(NuvioTokens.LineHeight.pageDisplay, typography.displayLarge.lineHeight)
        assertEquals(FontWeight.Bold, typography.displayLarge.fontWeight)
        assertEquals(NuvioTokens.LetterSpacing.pageDisplay, typography.displayLarge.letterSpacing)

        assertEquals(NuvioTokens.Type.headline, typography.headlineLarge.fontSize)
        assertEquals(NuvioTokens.LineHeight.headline, typography.headlineLarge.lineHeight)
        assertEquals(FontWeight.SemiBold, typography.headlineLarge.fontWeight)
        assertEquals(NuvioTokens.LetterSpacing.headline, typography.headlineLarge.letterSpacing)

        assertEquals(NuvioTokens.Type.titleSm, typography.titleLarge.fontSize)
        assertEquals(NuvioTokens.LineHeight.materialTitleLarge, typography.titleLarge.lineHeight)
        assertEquals(FontWeight.SemiBold, typography.titleLarge.fontWeight)

        assertEquals(NuvioTokens.Type.bodyLg, typography.titleMedium.fontSize)
        assertEquals(NuvioTokens.LineHeight.bodyMd, typography.titleMedium.lineHeight)
        assertEquals(FontWeight.SemiBold, typography.titleMedium.fontWeight)

        assertEquals(NuvioTokens.Type.bodyApp, typography.bodyLarge.fontSize)
        assertEquals(NuvioTokens.LineHeight.bodyApp, typography.bodyLarge.lineHeight)
        assertEquals(FontWeight.Normal, typography.bodyLarge.fontWeight)

        assertEquals(NuvioTokens.Type.bodyMd, typography.bodyMedium.fontSize)
        assertEquals(NuvioTokens.LineHeight.bodyMd, typography.bodyMedium.lineHeight)
        assertEquals(FontWeight.Normal, typography.bodyMedium.fontWeight)

        assertEquals(NuvioTokens.Type.bodyMd, typography.labelLarge.fontSize)
        assertEquals(NuvioTokens.LineHeight.bodySm, typography.labelLarge.lineHeight)
        assertEquals(FontWeight.SemiBold, typography.labelLarge.fontWeight)

        assertEquals(NuvioTokens.Type.labelSm, typography.labelMedium.fontSize)
        assertEquals(NuvioTokens.LineHeight.labelXs, typography.labelMedium.lineHeight)
        assertEquals(FontWeight.SemiBold, typography.labelMedium.fontWeight)
        assertEquals(NuvioTokens.LetterSpacing.label, typography.labelMedium.letterSpacing)
    }

    @Test
    fun createNuvioTypographyWithSystemDefaultFontUsesFontFamilyDefault() {
        val typography = createNuvioTypography(FontFamily.Default)

        assertEquals(FontFamily.Default, typography.displayLarge.fontFamily)
        assertEquals(FontFamily.Default, typography.headlineLarge.fontFamily)
        assertEquals(FontFamily.Default, typography.titleLarge.fontFamily)
        assertEquals(FontFamily.Default, typography.titleMedium.fontFamily)
        assertEquals(FontFamily.Default, typography.bodyLarge.fontFamily)
        assertEquals(FontFamily.Default, typography.bodyMedium.fontFamily)
        assertEquals(FontFamily.Default, typography.labelLarge.fontFamily)
        assertEquals(FontFamily.Default, typography.labelMedium.fontFamily)
    }

    @Test
    fun createNuvioTypeScalePreservesAllPropertiesWithGivenFont() {
        val testFont = FontFamily.Serif
        val scale = createNuvioTypeScale(testFont)

        // Verify font family on all 10 styles
        assertEquals(testFont, scale.labelXs.fontFamily)
        assertEquals(testFont, scale.labelSm.fontFamily)
        assertEquals(testFont, scale.bodySm.fontFamily)
        assertEquals(testFont, scale.bodyMd.fontFamily)
        assertEquals(testFont, scale.bodyLg.fontFamily)
        assertEquals(testFont, scale.titleSm.fontFamily)
        assertEquals(testFont, scale.titleMd.fontFamily)
        assertEquals(testFont, scale.titleLg.fontFamily)
        assertEquals(testFont, scale.displaySm.fontFamily)
        assertEquals(testFont, scale.displayMd.fontFamily)

        // Verify sizes, line heights, font weights
        assertEquals(NuvioTokens.Type.labelXs, scale.labelXs.fontSize)
        assertEquals(NuvioTokens.LineHeight.labelXs, scale.labelXs.lineHeight)
        assertEquals(FontWeight.SemiBold, scale.labelXs.fontWeight)

        assertEquals(NuvioTokens.Type.labelSm, scale.labelSm.fontSize)
        assertEquals(NuvioTokens.LineHeight.labelSm, scale.labelSm.lineHeight)
        assertEquals(FontWeight.SemiBold, scale.labelSm.fontWeight)

        assertEquals(NuvioTokens.Type.bodySm, scale.bodySm.fontSize)
        assertEquals(NuvioTokens.LineHeight.bodySm, scale.bodySm.lineHeight)
        assertEquals(FontWeight.Normal, scale.bodySm.fontWeight)

        assertEquals(NuvioTokens.Type.bodyMd, scale.bodyMd.fontSize)
        assertEquals(NuvioTokens.LineHeight.bodyMd, scale.bodyMd.lineHeight)
        assertEquals(FontWeight.Normal, scale.bodyMd.fontWeight)

        assertEquals(NuvioTokens.Type.bodyLg, scale.bodyLg.fontSize)
        assertEquals(NuvioTokens.LineHeight.bodyLg, scale.bodyLg.lineHeight)
        assertEquals(FontWeight.Normal, scale.bodyLg.fontWeight)

        assertEquals(NuvioTokens.Type.titleSm, scale.titleSm.fontSize)
        assertEquals(NuvioTokens.LineHeight.titleSm, scale.titleSm.lineHeight)
        assertEquals(FontWeight.SemiBold, scale.titleSm.fontWeight)

        assertEquals(NuvioTokens.Type.titleMd, scale.titleMd.fontSize)
        assertEquals(NuvioTokens.LineHeight.titleMd, scale.titleMd.lineHeight)
        assertEquals(FontWeight.SemiBold, scale.titleMd.fontWeight)

        assertEquals(NuvioTokens.Type.titleLg, scale.titleLg.fontSize)
        assertEquals(NuvioTokens.LineHeight.titleLg, scale.titleLg.lineHeight)
        assertEquals(FontWeight.SemiBold, scale.titleLg.fontWeight)

        assertEquals(NuvioTokens.Type.displaySm, scale.displaySm.fontSize)
        assertEquals(NuvioTokens.LineHeight.displaySm, scale.displaySm.lineHeight)
        assertEquals(FontWeight.Bold, scale.displaySm.fontWeight)

        assertEquals(NuvioTokens.Type.displayMd, scale.displayMd.fontSize)
        assertEquals(NuvioTokens.LineHeight.displayMd, scale.displayMd.lineHeight)
        assertEquals(FontWeight.Bold, scale.displayMd.fontWeight)
    }

    @Test
    fun createNuvioTypeScaleWithSystemDefaultFontUsesFontFamilyDefault() {
        val scale = createNuvioTypeScale(FontFamily.Default)

        assertEquals(FontFamily.Default, scale.labelXs.fontFamily)
        assertEquals(FontFamily.Default, scale.labelSm.fontFamily)
        assertEquals(FontFamily.Default, scale.bodySm.fontFamily)
        assertEquals(FontFamily.Default, scale.bodyMd.fontFamily)
        assertEquals(FontFamily.Default, scale.bodyLg.fontFamily)
        assertEquals(FontFamily.Default, scale.titleSm.fontFamily)
        assertEquals(FontFamily.Default, scale.titleMd.fontFamily)
        assertEquals(FontFamily.Default, scale.titleLg.fontFamily)
        assertEquals(FontFamily.Default, scale.displaySm.fontFamily)
        assertEquals(FontFamily.Default, scale.displayMd.fontFamily)
    }
}
