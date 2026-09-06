package com.nuvio.app.features.membership

import com.nuvio.app.core.ui.AppTheme

private val supporterThemes = linkedMapOf(
    AppTheme.GOLD to CosmeticEntitlement.GOLD_THEME,
    AppTheme.JADE to CosmeticEntitlement.JADE_THEME,
    AppTheme.ROSE_GOLD to CosmeticEntitlement.ROSE_GOLD_THEME,
    AppTheme.ARCTIC_BLUE to CosmeticEntitlement.ARCTIC_BLUE_THEME,
    AppTheme.GRAPHITE to CosmeticEntitlement.GRAPHITE_THEME,
)

private val standardThemes = listOf(AppTheme.WHITE) + AppTheme.entries.filterNot {
    it == AppTheme.WHITE || it == AppTheme.CUSTOM || it in supporterThemes
}

fun availableAppThemes(entitlements: CosmeticEntitlements, memberTier: MemberTier? = null): List<AppTheme> {
    val supporter = supporterThemes
        .filterValues(entitlements::includes)
        .keys
        .toList()
    val customThemes = if (memberTier != null) listOf(AppTheme.CUSTOM) else emptyList()
    return supporter + customThemes + standardThemes
}

fun resolveAppTheme(
    selectedTheme: AppTheme?,
    entitlements: CosmeticEntitlements,
    memberTier: MemberTier? = null,
): AppTheme {
    if (selectedTheme == null) {
        return supporterThemes
            .filterValues(entitlements::includes)
            .keys
            .firstOrNull()
            ?: AppTheme.WHITE
    }
    return selectedTheme.takeIf { it in availableAppThemes(entitlements, memberTier) } ?: AppTheme.WHITE
}
