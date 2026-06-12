package com.nuvio.app.features.player

import java.util.Locale

internal actual object DeviceLanguagePreferences {
    actual fun preferredLanguageCodes(): List<String> =
        Locale.getDefault()
            .toLanguageTag()
            .takeIf { it.isNotBlank() }
            ?.let(::listOf)
            ?: emptyList()
}
