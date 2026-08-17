package com.nuvio.app.features.player

internal object SubtitleSdhFilter {
    private val squareBrackets = Regex("\\[[^]\\r\\n]*][ \\t]*")
    private val uppercaseParentheses = Regex(
        "(?:\\((?=[A-Zl0-9 '#.,\\\"\\\\-]*\\))(?=[^)]*[A-Zl])[^)]*\\)|" +
            "（(?=[A-Zl0-9 '#.,\\\"\\\\-]*）)(?=[^）]*[A-Zl])[^）]*）)[ \\t]*",
    )
    private val speakerLabel = Regex(
        "(?m)^([ \\t]*-[ \\t]*)?(?:[A-Zl0-9 '#.,]+|\\[[^]\\r\\n]*]):(?=\\s|$)[ \\t]*",
    )

    fun filter(text: String): String? {
        var filtered = speakerLabel.replace(text) { match -> match.groups[1]?.value.orEmpty() }
        filtered = squareBrackets.replace(filtered, "")
        filtered = uppercaseParentheses.replace(filtered, "")
        return filtered.lines()
            .filter { line -> line.any { !it.isWhitespace() && it != '-' } }
            .joinToString("\n")
            .takeIf(String::isNotBlank)
    }
}
