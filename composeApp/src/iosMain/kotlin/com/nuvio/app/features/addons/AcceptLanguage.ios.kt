package com.nuvio.app.features.addons

import platform.Foundation.NSLocale
import platform.Foundation.preferredLanguages

internal actual fun deviceLanguageTag(): String? {
    val preferred = NSLocale.preferredLanguages.firstOrNull() as? String
    return preferred?.takeIf { it.isNotBlank() }
}
