package com.nuvio.app.features.addons

import java.util.Locale

internal actual fun deviceLanguageTag(): String? =
    Locale.getDefault().toLanguageTag().takeIf { it.isNotBlank() }
