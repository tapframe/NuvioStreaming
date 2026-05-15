package com.nuvio.app.features.debrid

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

class DirectDebridConfigEncoder {
    @OptIn(ExperimentalEncodingApi::class)
    fun encode(service: DebridServiceCredential): String {
        val servicesJson = """{"service":"${service.provider.id.jsonEscaped()}","apiKey":"${service.apiKey.jsonEscaped()}"}"""
        val json = """{"cachedOnly":true,"debridServices":[$servicesJson],"enableTorrent":false}"""
        return Base64.Default.encode(json.encodeToByteArray())
    }

    fun encodeTorbox(apiKey: String): String =
        encode(DebridServiceCredential(DebridProviders.Torbox, apiKey))
}

private fun String.jsonEscaped(): String = buildString {
    this@jsonEscaped.forEach { char ->
        when (char) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\b' -> append("\\b")
            '\u000C' -> append("\\f")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> {
                if (char.code < 0x20) {
                    append("\\u")
                    append(char.code.toString(16).padStart(4, '0'))
                } else {
                    append(char)
                }
            }
        }
    }
}

