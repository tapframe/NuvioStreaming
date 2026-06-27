package com.nuvio.app.features.settings

import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.lang_bulgarian
import nuvio.composeapp.generated.resources.lang_czech
import nuvio.composeapp.generated.resources.lang_english
import nuvio.composeapp.generated.resources.lang_french
import nuvio.composeapp.generated.resources.lang_german
import nuvio.composeapp.generated.resources.lang_greek
import nuvio.composeapp.generated.resources.lang_hungarian
import nuvio.composeapp.generated.resources.lang_indonesian
import nuvio.composeapp.generated.resources.lang_italian
import nuvio.composeapp.generated.resources.lang_polish
import nuvio.composeapp.generated.resources.lang_portuguese_brazil
import nuvio.composeapp.generated.resources.lang_portuguese_portugal
import nuvio.composeapp.generated.resources.lang_slovak
import nuvio.composeapp.generated.resources.lang_spanish
import nuvio.composeapp.generated.resources.lang_turkish
import nuvio.composeapp.generated.resources.lang_norwegian
import nuvio.composeapp.generated.resources.lang_japanese
import nuvio.composeapp.generated.resources.settings_appearance_app_language_device
import org.jetbrains.compose.resources.StringResource

enum class AppLanguage(
    val code: String,
    val labelRes: StringResource,
) {
    DEVICE("device", Res.string.settings_appearance_app_language_device),
    BULGARIAN("bg", Res.string.lang_bulgarian),
    CZECH("cs", Res.string.lang_czech),
    ENGLISH("en", Res.string.lang_english),
    FRENCH("fr", Res.string.lang_french),
    GERMAN("de", Res.string.lang_german),
    GREEK("el", Res.string.lang_greek),
    HUNGARIAN("hu", Res.string.lang_hungarian),
    INDONESIAN("id", Res.string.lang_indonesian),
    ITALIAN("it", Res.string.lang_italian),
    POLISH("pl", Res.string.lang_polish),
    PORTUGUESE_BRAZIL("pt-BR", Res.string.lang_portuguese_brazil),
    PORTUGUESE("pt", Res.string.lang_portuguese_portugal),
    SLOVAK("sk", Res.string.lang_slovak),
    SPANISH("es", Res.string.lang_spanish),
    TURKISH("tr", Res.string.lang_turkish),
    NORWEGIAN("nb", Res.string.lang_norwegian),
    JAPANESE("ja", Res.string.lang_japanese),
    ;

    companion object {
        fun fromCode(code: String?): AppLanguage =
            entries.firstOrNull { it.code.equals(code, ignoreCase = true) } ?: DEVICE
    }
}
