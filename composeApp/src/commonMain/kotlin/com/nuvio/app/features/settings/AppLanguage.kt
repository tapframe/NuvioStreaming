package com.nuvio.app.features.settings

import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.lang_english
import nuvio.composeapp.generated.resources.lang_french
import nuvio.composeapp.generated.resources.lang_spanish
import nuvio.composeapp.generated.resources.lang_portuguese_portugal
import nuvio.composeapp.generated.resources.lang_turkish
import nuvio.composeapp.generated.resources.lang_italian
import nuvio.composeapp.generated.resources.lang_greek
import nuvio.composeapp.generated.resources.lang_polish
import org.jetbrains.compose.resources.StringResource

enum class AppLanguage(
    val code: String,
    val labelRes: StringResource,
) {
    ENGLISH("en", Res.string.lang_english),
    FRENCH("fr", Res.string.lang_french),
    SPANISH("es", Res.string.lang_spanish),
    PORTUGUESE("pt", Res.string.lang_portuguese_portugal),
    TURKISH("tr", Res.string.lang_turkish),
    ITALIAN("it", Res.string.lang_italian),
    GREEK("el", Res.string.lang_greek),
    POLISH("pl", Res.string.lang_polish),
    ;

    companion object {
        fun fromCode(code: String?): AppLanguage =
            entries.firstOrNull { it.code.equals(code, ignoreCase = true) } ?: ENGLISH
    }
}
