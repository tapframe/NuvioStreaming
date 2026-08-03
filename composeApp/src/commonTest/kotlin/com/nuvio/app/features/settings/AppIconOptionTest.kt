package com.nuvio.app.features.settings

import kotlin.test.Test
import kotlin.test.assertEquals

class AppIconOptionTest {
    @Test
    fun primaryIconUsesPlatformDefault() {
        assertEquals(null, AppIconOption.ORIGINAL.platformName)
        assertEquals(AppIconOption.ORIGINAL, AppIconOption.fromPlatformName(null))
    }

    @Test
    fun alternateIconNamesRoundTrip() {
        AppIconOption.entries.drop(1).forEach { icon ->
            assertEquals(icon, AppIconOption.fromPlatformName(icon.platformName))
        }
    }

    @Test
    fun shortlistedCatalogueContainsSixIcons() {
        assertEquals(6, AppIconOption.entries.size)
    }

    @Test
    fun unknownIconFallsBackToOriginal() {
        assertEquals(AppIconOption.ORIGINAL, AppIconOption.fromPlatformName("UnknownIcon"))
    }
}
