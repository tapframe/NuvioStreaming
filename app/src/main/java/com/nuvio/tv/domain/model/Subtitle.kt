package com.nuvio.tv.domain.model

/**
 * Represents a subtitle from a Stremio addon
 */
data class Subtitle(
    val id: String,
    val url: String,
    val lang: String,
    val addonName: String,
    val addonLogo: String?
) {
    /**
     * Returns a human-readable language name
     */
    fun getDisplayLanguage(): String {
        return languageCodeToName(lang)
    }
    
    companion object {
        private val languageNames = mapOf(
            "en" to "English",
            "eng" to "English",
            "es" to "Spanish",
            "spa" to "Spanish",
            "fr" to "French",
            "fra" to "French",
            "fre" to "French",
            "de" to "German",
            "deu" to "German",
            "ger" to "German",
            "it" to "Italian",
            "ita" to "Italian",
            "pt" to "Portuguese",
            "por" to "Portuguese",
            "pt-br" to "Portuguese (Brazil)",
            "ru" to "Russian",
            "rus" to "Russian",
            "ja" to "Japanese",
            "jpn" to "Japanese",
            "ko" to "Korean",
            "kor" to "Korean",
            "zh" to "Chinese",
            "chi" to "Chinese",
            "zho" to "Chinese",
            "ar" to "Arabic",
            "ara" to "Arabic",
            "hi" to "Hindi",
            "hin" to "Hindi",
            "nl" to "Dutch",
            "nld" to "Dutch",
            "dut" to "Dutch",
            "pl" to "Polish",
            "pol" to "Polish",
            "sv" to "Swedish",
            "swe" to "Swedish",
            "no" to "Norwegian",
            "nor" to "Norwegian",
            "da" to "Danish",
            "dan" to "Danish",
            "fi" to "Finnish",
            "fin" to "Finnish",
            "tr" to "Turkish",
            "tur" to "Turkish",
            "el" to "Greek",
            "ell" to "Greek",
            "gre" to "Greek",
            "he" to "Hebrew",
            "heb" to "Hebrew",
            "th" to "Thai",
            "tha" to "Thai",
            "vi" to "Vietnamese",
            "vie" to "Vietnamese",
            "id" to "Indonesian",
            "ind" to "Indonesian",
            "ms" to "Malay",
            "msa" to "Malay",
            "may" to "Malay",
            "cs" to "Czech",
            "ces" to "Czech",
            "cze" to "Czech",
            "hu" to "Hungarian",
            "hun" to "Hungarian",
            "ro" to "Romanian",
            "ron" to "Romanian",
            "rum" to "Romanian",
            "uk" to "Ukrainian",
            "ukr" to "Ukrainian",
            "bg" to "Bulgarian",
            "bul" to "Bulgarian",
            "hr" to "Croatian",
            "hrv" to "Croatian",
            "sr" to "Serbian",
            "srp" to "Serbian",
            "sk" to "Slovak",
            "slk" to "Slovak",
            "slo" to "Slovak",
            "sl" to "Slovenian",
            "slv" to "Slovenian"
        )
        
        fun languageCodeToName(code: String): String {
            val lowerCode = code.lowercase()
            return languageNames[lowerCode] ?: code.uppercase()
        }
    }
}
