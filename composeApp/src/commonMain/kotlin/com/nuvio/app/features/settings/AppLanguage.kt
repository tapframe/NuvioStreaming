package com.nuvio.app.features.settings

import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.lang_czech
import nuvio.composeapp.generated.resources.lang_english
import nuvio.composeapp.generated.resources.lang_french
import nuvio.composeapp.generated.resources.lang_german
import nuvio.composeapp.generated.resources.lang_greek
import nuvio.composeapp.generated.resources.lang_indonesian
import nuvio.composeapp.generated.resources.lang_italian
import nuvio.composeapp.generated.resources.lang_polish
import nuvio.composeapp.generated.resources.lang_portuguese_portugal
import nuvio.composeapp.generated.resources.lang_spanish
import nuvio.composeapp.generated.resources.lang_turkish
import org.jetbrains.compose.resources.StringResource

enum class AppLanguage(
    val code: String,
    val labelRes: StringResource,
) {
    CZECH("cs", Res.string.lang_czech),
    ENGLISH("en", Res.string.lang_english),
    FRENCH("fr", Res.string.lang_french),
    GERMAN("de", Res.string.lang_german),
    GREEK("el", Res.string.lang_greek),
    INDONESIAN("id", Res.string.lang_indonesian),
    ITALIAN("it", Res.string.lang_italian),
    POLISH("pl", Res.string.lang_polish),
    PORTUGUESE("pt", Res.string.lang_portuguese_portugal),
    SPANISH("es", Res.string.lang_spanish),
    TURKISH("tr", Res.string.lang_turkish),
    ;

    companion object {
        fun fromCode(code: String?): AppLanguage =
            entries.firstOrNull { it.code.equals(code, ignoreCase = true) } ?: ENGLISH
    }
}
