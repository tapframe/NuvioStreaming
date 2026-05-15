package com.nuvio.app.features.debrid

internal fun encodePathSegment(value: String): String =
    percentEncode(value, spaceAsPlus = false)

internal fun encodeFormValue(value: String): String =
    percentEncode(value, spaceAsPlus = true)

internal fun queryString(vararg pairs: Pair<String, String?>): String =
    pairs
        .mapNotNull { (key, value) ->
            value?.let { "${encodePathSegment(key)}=${encodePathSegment(it)}" }
        }
        .joinToString("&")

private fun percentEncode(value: String, spaceAsPlus: Boolean): String = buildString {
    val hex = "0123456789ABCDEF"
    value.encodeToByteArray().forEach { byte ->
        val code = byte.toInt() and 0xFF
        val isUnreserved = (code in 'A'.code..'Z'.code) ||
            (code in 'a'.code..'z'.code) ||
            (code in '0'.code..'9'.code) ||
            code == '-'.code ||
            code == '.'.code ||
            code == '_'.code ||
            code == '~'.code
        when {
            isUnreserved -> append(code.toChar())
            spaceAsPlus && code == 0x20 -> append('+')
            else -> {
                append('%')
                append(hex[code shr 4])
                append(hex[code and 0x0F])
            }
        }
    }
}

